import "dotenv/config";
import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertKey, decrypt, encrypt } from "./crypto";
import { createMatcher } from "./matcher";
import { normalizeDigits } from "./normalize";

assertKey();

const prisma = new PrismaClient();
const matcher = createMatcher();
const allowMock = process.env.ALLOW_MOCK_SCANNER !== "false";
const MIN_TEMPLATE_BYTES = 32;
const app = express();
app.use(express.json({ limit: "2mb" }));

const enrollSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "نام و نام خانوادگی را وارد کنید")
    .max(200),
  nationalId: z.string().trim().max(50).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  fingerprint: z.string().min(1, "اثر انگشت اسکن نشده است"), // base64 template
  fpFormat: z.string().min(1).max(50),
});

// Runs enrollments one at a time so two simultaneous requests
// cannot both pass the duplicate check and both insert.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Never returns fingerprint data.
app.get("/api/people", async (_req, res) => {
  const people = await prisma.person.findMany({
    select: {
      id: true,
      fullName: true,
      nationalId: true,
      phone: true,
      fpFormat: true,
      createdAt: true,
    },
    orderBy: { id: "desc" },
  });
  res.json(people);
});

app.post("/api/people", async (req, res) => {
  const parsed = enrollSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "اطلاعات نامعتبر است",
    });
  }
  const { fingerprint, fpFormat, fullName } = parsed.data;
  // Persian digits would otherwise make "۱۲۳" and "123" two different IDs.
  const nationalId =
    normalizeDigits(parsed.data.nationalId ?? "").replace(/\s/g, "") || null;
  const phone =
    normalizeDigits(parsed.data.phone ?? "").replace(/[\s-]/g, "") || null;
  if (nationalId && !/^\d+$/.test(nationalId)) {
    return res.status(400).json({ error: "کد ملی باید فقط شامل عدد باشد" });
  }
  if (!allowMock && fpFormat === "MOCK") {
    return res
      .status(400)
      .json({ error: "اسکنر آزمایشی مجاز نیست. اسکنر واقعی را وصل کنید." });
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(fingerprint)) {
    return res.status(400).json({ error: "داده اثر انگشت معتبر نیست" });
  }
  const probe = Buffer.from(fingerprint, "base64");
  if (probe.length < MIN_TEMPLATE_BYTES) {
    return res
      .status(400)
      .json({ error: "داده اثر انگشت ناقص است. دوباره اسکن کنید." });
  }

  try {
    const result = await serialize(async () => {
      if (nationalId) {
        const existing = await prisma.person.findUnique({
          where: { nationalId },
        });
        if (existing)
          return {
            status: 409 as const,
            error: "این کد ملی قبلاً ثبت شده است",
          };
      }

      const rows = await prisma.person.findMany({
        select: { id: true, fingerprint: true },
      });
      const candidates = rows.map((r) => ({
        id: r.id,
        template: decrypt(Buffer.from(r.fingerprint)),
      }));
      let matchedId: number | null;
      try {
        matchedId = await matcher.findMatch(probe, candidates);
      } catch (err) {
        console.error("[matcher]", err);
        return {
          status: 503 as const,
          error: "سرویس تطبیق اثر انگشت در دسترس نیست. چیزی ذخیره نشد.",
        };
      }
      if (matchedId !== null) {
        return {
          status: 409 as const,
          error: "این اثر انگشت قبلاً ثبت شده است",
        };
      }

      const person = await prisma.person.create({
        data: {
          fullName,
          nationalId,
          phone,
          fpFormat,
          fingerprint: encrypt(probe),
        },
        select: { id: true },
      });
      // Read the row back and decrypt it: proves what is in the database
      // is exactly what the scanner produced.
      const saved = await prisma.person.findUnique({
        where: { id: person.id },
        select: { fingerprint: true },
      });
      const intact =
        saved !== null && decrypt(Buffer.from(saved.fingerprint)).equals(probe);
      if (!intact) {
        await prisma.person.delete({ where: { id: person.id } });
        return {
          status: 500 as const,
          error: "ذخیره اثر انگشت تأیید نشد و لغو شد. دوباره تلاش کنید.",
        };
      }
      return { status: 201 as const, id: person.id };
    });

    if (result.status !== 201)
      return res.status(result.status).json({ error: result.error });
    return res.status(201).json({ id: result.id });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({ error: "این کد ملی قبلاً ثبت شده است" });
    }
    console.error(err);
    return res
      .status(500)
      .json({ error: "ذخیره نشد. گزارش‌های API را بررسی کنید." });
  }
});

const port = Number(process.env.PORT ?? 3000);
// Bound to loopback: only this PC can reach the API.
app.listen(port, "127.0.0.1", () =>
  console.log(`API listening on http://localhost:${port}`)
);
