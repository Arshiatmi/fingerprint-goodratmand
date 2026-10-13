import { useEffect, useState } from "react";

interface Person {
  id: number;
  fullName: string;
  nationalId: string | null;
  phone: string | null;
  fpFormat: string;
  createdAt: string;
}

export default function PeopleList({ refreshKey }: { refreshKey: number }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/people")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: Person[]) => {
        setPeople(data);
        setError("");
      })
      .catch(() => setError("فهرست ثبت‌شده‌ها بارگذاری نشد. مطمئن شوید API در حال اجراست."));
  }, [refreshKey]);

  const fa = (n: number | string) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

  return (
    <section className="panel wide">
      <h2>ثبت‌شده‌ها{people ? ` (${fa(people.length)})` : ""}</h2>
      {error && <p className="notice error">{error}</p>}
      {people && people.length === 0 && <p className="lede">هنوز کسی ثبت نشده است.</p>}
      {people && people.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>نام</th>
                <th>کد ملی</th>
                <th>تلفن</th>
                <th>نوع اسکن</th>
                <th>تاریخ ثبت</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>{fa(p.id)}</td>
                  <td>{p.fullName}</td>
                  <td>{p.nationalId ? fa(p.nationalId) : "—"}</td>
                  <td>{p.phone ? fa(p.phone) : "—"}</td>
                  <td>
                    <span className={p.fpFormat === "MOCK" ? "badge warn" : "badge ok"}>
                      {p.fpFormat === "MOCK" ? "آزمایشی" : "اسکنر واقعی"}
                    </span>
                  </td>
                  <td>{new Date(p.createdAt).toLocaleString("fa-IR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
