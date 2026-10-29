# Architecture note

## Shape

```
Browser (React + TipTap)  ──fetch /api/*──▶  Express (one Node process)  ──▶  SQLite (better-sqlite3)
        ▲                                         │
        └──────── static client (Vite build) ◀────┘
```

There is one deployable unit: a single Docker image runs one Node process that serves both the JSON API and the built SPA. This is the cheapest setup that is still a real full-stack app, and there's no CORS, no second service, and nothing for reviewers to pay for.

| Layer       | Choice                     | Why                                                                                                                                                    |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor      | TipTap 3 (ProseMirror)     | A schema-based editor, so formatting is structured rather than arbitrary `contentEditable` HTML. Toolbar, shortcuts and lists work out of the box.      |
| Client      | React 19 + Vite            | Fast to build and well known. Two routes (`/` and `/d/:id`).                                                                                           |
| API         | Express 5 + zod            | Thin routes: validate, call a domain function, return JSON. Express 5 forwards async errors to one error handler.                                       |
| Storage     | SQLite via better-sqlite3  | Zero-ops, file-based and transactional. Synchronous calls keep data-access code simple, and tests run against `:memory:`.                              |
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
4. **Import creates a new document.** I chose this over "attach to doc" or "merge into draft" because it's the clearest product story ("bring my existing doc in") and avoids a merge UI. Conversion happens server-side (`mammoth` for .docx, `marked` for .md, escaped paragraphs for .txt) so the browser never parses untrusted Office files. There is a 5 MB limit, and the file type is checked by extension and then by whether it actually parses: a corrupt .docx returns `422` with a human-readable message.

## What I prioritized, and what I cut

**Prioritized (depth):** a calm, coherent editing loop (autosave with honest status, keyboard shortcuts, read-only mode for viewers); sharing with real roles and immediate effect; protection against lost writes; security basics (sanitization, hashed sessions, 404 for no access, validated inputs); tests on the access rules, which are the riskiest logic.

**Deliberately cut:**

- Real-time co-editing, cursors and presence (see decision 3).
- Comments, suggestion mode and version history. Version history is the cheapest next step, because the `version` counter already exists.
- Sign-up, password reset, and email notifications on share.
- Images, tables, fonts and colours in the editor. .docx images are dropped on import.
- Pagination and search on the document list (fine at demo scale).

## Known risks

- **Hosting:** the free Render plan has an ephemeral disk, so data resets on redeploy or sleep. This is documented in the README. Fix: mount a volume at `/data`, with no code change.
- **Polling cost:** one GET per open document every 4 s is fine at demo scale. At real scale, replace it with a WebSocket or SSE "version changed" push.
- **Last-writer UX:** "Keep mine" overwrites the other person's version as a whole document; it does not merge.

## What I'd build next

With another 2–4 hours, in order:

1. **Version history:** a `document_versions` table written on each save (or throttled), plus a side panel to view and restore. This closes the "Keep mine overwrote their work" gap.
2. **Push instead of poll:** an SSE endpoint that broadcasts `{docId, version}`, plus a "Bob is editing" presence indicator.
3. **Export to Markdown/PDF**, and **import into an existing document** at the cursor.
4. **Durable hosting** (volume or managed Postgres) and a CI workflow running `npm test` and the E2E smoke test on each push.
