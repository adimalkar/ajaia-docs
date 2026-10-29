# Ajaia Docs

A lightweight collaborative document editor: create and format documents, import files, and share them with teammates as viewers or editors.

**Live demo:** _LIVE_URL_ (Vercel + Turso: always on, data persists)

## Demo accounts

All demo accounts use the password **`ajaia-demo`**. The login screen also has one-click buttons for each.

| User         | Email              | Seeded data                                                    |
| ------------ | ------------------ | -------------------------------------------------------------- |
| Alice Chen   | `alice@ajaia.test` | Owns "Q3 Product Brief" (shared with Bob as **editor**)        |
| Bob Rivera   | `bob@ajaia.test`   | Owns "Design review notes" (shared with Alice as **viewer**)   |
| Carol Okafor | `carol@ajaia.test` | Nothing shared with her yet. Use her to test granting access   |

**Testing the sharing flow:** sign in as Alice in one browser and as Bob in a private window (or another browser). Sessions are cookie-based, so two tabs in the same window share one user.

## What works

- **Documents:** create, rename (inline title), edit, delete (owner only), reopen. Autosave runs ~0.8 s after you stop typing, with a visible *Saving… / All changes saved* indicator. `Ctrl/⌘+S` saves immediately, and you get a warning if you try to close the tab with unsaved changes.
- **Rich text:** bold, italic, underline, strikethrough, Heading 1–3, bulleted and numbered lists, quotes, undo/redo and clear formatting, with the usual keyboard shortcuts. Pasted URLs become links.
- **File import:** **.txt, .md and .docx (up to 4 MB)** become a new editable document owned by the uploader, keeping headings, emphasis and lists. Other file types are rejected with a clear message. Sample files are in [`samples/`](samples).
- **Sharing:** the owner shares by email as **Can edit** or **Can view**, can change the role, can remove access, and can copy the document link. The home page separates **My documents** from **Shared with me** (which shows owner and access level). Viewers get a read-only editor.
- **Collaboration safety:** every save carries the version it was based on. If someone else saved first, the server returns `409` instead of overwriting their work, and the editor offers **Load their version** or **Keep mine**. Open documents poll every 4 s, so viewers and idle editors pick up others' changes, and a role change or revoked access applies without a reload.
- **Persistence:** SQLite via libSQL stores users, sessions, documents (as sanitized HTML) and shares. Locally it uses a file; in production it uses a hosted [Turso](https://turso.tech) database.

## Run locally

Requires **Node.js 22+**.

```bash
npm install
npm run dev          # API on :3001, Vite dev server on http://localhost:5173
```

Production build:

```bash
npm run build
npm start            # serves the API and the built client on http://localhost:3001
```

No database setup is needed locally: a SQLite file is created at `./data/docs.db` and seeded with the demo accounts on first start. To reset the demo, delete `./data`.

| Env var              | Default  | Purpose                                                          |
| -------------------- | -------- | ---------------------------------------------------------------- |
| `PORT`               | `3001`   | HTTP port (local / Docker)                                       |
| `DATA_DIR`           | `./data` | Directory for the local SQLite file                               |
| `TURSO_DATABASE_URL` | unset    | Use a hosted Turso database instead of the local file (`libsql://…`) |
| `TURSO_AUTH_TOKEN`   | unset    | Auth token for the Turso database                                  |

## Tests

```bash
npm test             # API integration tests (Vitest + Supertest, in-memory SQLite)
npm run typecheck    # TypeScript across client and server
npm run test:e2e     # browser smoke test against a running server (see below)
```

- `server/test/api.test.ts` (11 tests) covers the access-control lifecycle (no access, then viewer, then editor, then revoked, then deleted), owner-only actions, idempotent seeding, 409 conflict detection, HTML sanitization (scripts, event handlers, `javascript:` links), input validation, and .md/.txt import plus rejection of unsupported, oversized or corrupt files.
- `e2e/smoke.mjs` drives two real browser sessions (Alice and Bob) through create, format, reload, share, viewer read-only, live update, role upgrade, edit conflict, .docx import, revoke, and a mobile layout check. It writes screenshots to `docs/screenshots/`. Start the server with `npm run build && npm start` first. Set `CHROME_PATH` to a local Chrome/Chromium binary, or run `npx playwright install chromium` once.

## Deployment

**Production: Vercel + Turso (both free tiers, no card).** Vercel serves the built client from its CDN and runs the Express API as one serverless function ([`api/index.ts`](api/index.ts), which delegates to [`server/vercel.ts`](server/vercel.ts)). The data lives in a hosted Turso (libSQL) database, so nothing sleeps and data survives redeploys.

1. **Turso:** sign in at [turso.tech](https://turso.tech), create a database, then create a database token. Note the database URL (`libsql://….turso.io`) and the token.
2. **Vercel:** Add New → Project → import this repo. [`vercel.json`](vercel.json) sets the build, output and rewrites. Add the environment variables `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, then deploy.
3. The schema and demo accounts are created automatically on the first request.

**Self-hosting alternative:** [`Dockerfile`](Dockerfile) runs the same app as one long-lived Node process using a local SQLite file at `/data` (mount a volume there), or Turso if the env vars are set.

## Project structure

```
server/            Express API (TypeScript)
  app.ts           app factory (used by index.ts, vercel.ts and tests)
  index.ts         long-running server (local dev / Docker)
  vercel.ts        serverless entry (lazy schema + seed per cold start)
  documents.ts     data access + access-control rules (getRole / assertRole)
  auth.ts          password hashing, sessions, requireUser middleware
  importers.ts     .txt / .md / .docx → HTML
  sanitize.ts      single HTML allowlist shared by import and save
  routes/          HTTP layer: validation (zod) → domain functions
  test/            API integration tests
api/index.ts       Vercel function entry (re-exports server/vercel.ts)
client/src/        React + TipTap SPA
  pages/           Login, Home (document lists), DocumentPage (editor)
  components/      Toolbar, ShareDialog, small UI primitives
  useDocumentSaver.ts  serialized autosave queue with conflict handling
e2e/smoke.mjs      Playwright browser smoke test
samples/           example .md / .txt / .docx files to try importing
docs/screenshots/  screenshots captured by the smoke test
```

## Known limitations and next steps

See [ARCHITECTURE.md](ARCHITECTURE.md#what-id-build-next) for the full list. In short:

- No real-time co-editing. Concurrent edits are detected and resolved explicitly (409 plus a choice), not merged.
- No images, tables or text colour in the editor. .docx import keeps structure and basic formatting only, and images are dropped.
- No sign-up or password reset: the users are seeded.
