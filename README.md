# Fingerprint enrollment (TypeScript)

Form + fingerprint scan → encrypted template saved in a database, with duplicate rejection.

```
Browser (http://localhost:5173)
   ├─ POST /api/capture ─► scanner agent (localhost:8443) ─► Suprema SDK
   └─ POST /api/people  ─► API (localhost:3000) ─► SQLite/Postgres
                              ├─ duplicate check (matcher)
                              └─ AES-256-GCM encrypt, then save
```

## Run it (mock scanner, no hardware needed)

Requires Node 18+.

```bash
npm install
cp api/.env.example api/.env
# generate a key and paste it as FP_ENC_KEY in api/.env:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:setup
npm run dev
```

Open http://localhost:5173.

To test duplicate rejection with the mock: copy `web/.env.example` to `web/.env`,
set `VITE_MOCK_FINGER=alice`, restart, and enroll twice. The second save is rejected.

## Moving to the real Suprema scanner

Three places, all marked `TODO`:

1. **Agent**: replace `agent/src/server.ts` with Suprema's WebAgent, or a service that calls the
   UFScanner SDK. It must provide the two endpoints described at the top of that file.
2. **`web/src/scanner.ts`**: adjust the capture URL and response fields to your agent.
3. **`api/src/matcher.ts`**: set `MATCHER=agent` in `api/.env`. The agent's `/api/match` must run
   Suprema's matcher (UFMatcher). Real scans of the same finger are never byte-identical, so
   the mock matcher cannot detect duplicates from real hardware.

## Security notes

- Templates are encrypted with AES-256-GCM before they touch the database. The key lives in
  `api/.env` (`FP_ENC_KEY`). Lose it and the data is unrecoverable; leak it and the encryption is void.
  For production, load it from a secrets manager or OS keystore instead of a file.
- The API and agent bind to 127.0.0.1 only.
- Duplicate checking decrypts stored templates in memory and sends them to the matcher. That is fine
  on one PC, but it does not scale to very large databases.
- `GET /api/people` never returns fingerprint data.
- Biometric data is regulated in many places. Get explicit consent and document retention.
