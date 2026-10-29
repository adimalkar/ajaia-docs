# Architecture note

## Shape

```
Browser (React + TipTap) ──▶ Vercel CDN: static client (Vite build)
          │
          └── fetch /api/* ──▶ Vercel function: Express app ──▶ Turso (hosted SQLite / libSQL)
```

The same Express app (`createApp(db)`) runs in three places: as a Vercel serverless function in production (`server/vercel.ts`), as a long-running process locally or in Docker (`server/index.ts`), and in-process in the tests. Only the database URL changes: a Turso URL in production, a local file in development, `:memory:` in tests. Everything is same-origin, so there's no CORS, and every service is on a free tier.

**Why Vercel + Turso:** the first plan was Render's free tier as a single Docker service, but it sleeps after 15 minutes idle (a 30–60 s cold start for the next visitor) and its disk is ephemeral. That's a poor first impression for a reviewer. Vercel functions don't sleep in that way, but they also have no persistent disk, so the database had to move off the filesystem. Turso is hosted SQLite, so the schema and SQL stayed the same. The only code change was making data access async.

**Why Turso over Neon (Postgres):** Neon was the main alternative, and for a larger product it's probably the better default: Postgres is the industry standard, has richer types and row-level locking, and offers `LISTEN/NOTIFY` as a natural basis for real-time collaboration later. I picked Turso for this timebox because:

- **No query rewrite.** The app was already written for SQLite. With Turso the schema and every query ran unchanged. Neon would have meant reworking the schema, query parameters, `COLLATE NOCASE` and `INSERT OR IGNORE`, then re-checking every query.
- **One database engine everywhere.** The same libSQL client runs a local file in dev, `:memory:` in tests, and Turso in prod. Tests run on the same engine as production, and reviewers can run the project with no database to install.
- **Time spent where it shows.** The switch took about 15–20 minutes. Neon would have taken roughly 45 more, with no difference a reviewer would see.

Moving to Postgres later is contained: SQL lives only in `server/db.ts`, `server/auth.ts`, `server/documents.ts` and `server/seed.ts`, behind the small `all` / `get` / `run` helpers.

| Layer       | Choice                     | Why                                                                                                                                                    |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor      | TipTap 3 (ProseMirror)     | A schema-based editor, so formatting is structured rather than arbitrary `contentEditable` HTML. Toolbar, shortcuts and lists work out of the box.      |
| Client      | React 19 + Vite            | Fast to build and well known. Two routes (`/` and `/d/:id`).                                                                                           |
| API         | Express 5 + zod            | Thin routes: validate, call a domain function, return JSON. Express 5 forwards async errors to one error handler.                                       |
| Storage     | SQLite via libSQL (Turso)  | Real SQL with constraints and transactions. The same client talks to a local file, `:memory:` (tests) or hosted Turso (prod), with zero ops.          |
| Auth        | Seeded users + session cookie | Real login with scrypt password hashes, httpOnly cookies and server-side sessions (only token hashes stored), but no sign-up flow. Enough to make ownership and sharing real. |

## Data model

```
users(id, email UNIQUE, name, password_hash)
sessions(token_hash PK, user_id → users, expires_at)
documents(id uuid, owner_id → users, title, content_html, version, created_at, updated_at, updated_by)
document_shares(document_id → documents, user_id → users, role ∈ {viewer, editor}, PK(document_id, user_id))
```

- **Ownership is a column, not a share row.** Every document has exactly one owner, and shares hold only the extra grants. A user's role on a document is `owner` if they own it, otherwise their share role, otherwise nothing. That is one SQL query in `getRole()`.
- **Content is stored as sanitized HTML.** It is TipTap's native import/export format, so .md/.docx import can reuse the same path, and it stays readable in the database. ProseMirror JSON would be more exact, but it would need a converter for every import format, and HTML round-trips cleanly through the schema for the formatting supported here.

## Key decisions

1. **One access-control chokepoint.** Every document operation calls `assertRole(db, docId, userId, minimum)` in `server/documents.ts` before touching data, with ranks `viewer < editor < owner`. A user with no access gets **404, not 403**, so document IDs can't be probed for existence. Editors can edit and rename. Only owners can share, change roles, revoke or delete.
2. **One HTML allowlist** (`server/sanitize.ts`) runs on both import and save. It mirrors what the editor schema can represent (p, h1–h3, strong/em/u/s, lists, blockquote, code, links with http/https/mailto). Stored content therefore can't carry scripts or event handlers even if someone bypasses the UI and calls the API directly, and the database holds exactly what the editor renders.
3. **Optimistic concurrency instead of real-time sync.** Each document has a `version`. Saves send `baseVersion`, and `UPDATE … WHERE version = ?` either applies or affects 0 rows, which becomes a `409`. The client's save queue (`useDocumentSaver`) keeps one request in flight at a time, merges keystrokes into a single pending patch, and on 409 stops autosaving and asks the user to load the other version or keep their own. A 4-second poll pulls in newer versions only when the local editor has nothing unsaved. This gives viewers near-live updates and makes role changes and revocations take effect without a reload.
   *Why not CRDT/WebSockets (Yjs + Hocuspocus)?* That is the right end state, but it brings a second protocol, presence, and document-state storage, which would mean at least half the timebox spent on one feature. The version check prevents the failure that actually matters (silently losing a colleague's work) for a fraction of the cost, and it is a clean stepping stone because the server-side document model doesn't change.
4. **Import creates a new document.** I chose this over "attach to doc" or "merge into draft" because it's the clearest product story ("bring my existing doc in") and avoids a merge UI. Conversion happens server-side (`mammoth` for .docx, `marked` for .md, escaped paragraphs for .txt) so the browser never parses untrusted Office files. There is a 4 MB limit (Vercel caps request bodies at 4.5 MB), and the file type is checked by extension and then by whether it actually parses: a corrupt .docx returns `422` with a human-readable message.

## What I prioritized, and what I cut

**Prioritized (depth):** a calm, coherent editing loop (autosave with honest status, keyboard shortcuts, read-only mode for viewers); sharing with real roles and immediate effect; protection against lost writes; security basics (sanitization, hashed sessions, 404 for no access, validated inputs); tests on the access rules, which are the riskiest logic.

**Deliberately cut:**

- Real-time co-editing, cursors and presence (see decision 3).
- Comments, suggestion mode and version history. Version history is the cheapest next step, because the `version` counter already exists.
- Sign-up, password reset, and email notifications on share.
- Images, tables, fonts and colours in the editor. .docx images are dropped on import.
- Pagination and search on the document list (fine at demo scale).

## Known risks

- **Serverless cold starts:** the first request on a cold Vercel instance opens the Turso connection and checks the schema and seed (typically well under a second). Seeding is idempotent, so concurrent cold starts can't duplicate demo data, and there is a test for this.
- **Foreign keys:** hosted libSQL doesn't enforce `ON DELETE CASCADE` by default, so deleting a document removes its shares explicitly in one transaction.
- **Polling cost:** one GET per open document every 4 s is fine at demo scale. At real scale, replace it with a WebSocket or SSE "version changed" push.
- **Last-writer UX:** "Keep mine" overwrites the other person's version as a whole document; it does not merge.

## What I'd build next

With another 2–4 hours, in order:

1. **Version history:** a `document_versions` table written on each save (or throttled), plus a side panel to view and restore. This closes the "Keep mine overwrote their work" gap.
2. **Push instead of poll:** an SSE endpoint that broadcasts `{docId, version}`, plus a "Bob is editing" presence indicator.
3. **Export to Markdown/PDF**, and **import into an existing document** at the cursor.
4. **CI:** a GitHub Actions workflow running `npm test`, the typecheck and the E2E smoke test against a Vercel preview deployment on each push.
