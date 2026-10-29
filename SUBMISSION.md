# Submission: Ajaia Full Stack Product Engineer

**Candidate:** Aditya Malkar

## Links

- **Live app:** _LIVE_URL_
- **Walkthrough video:** see [`VIDEO_URL.txt`](VIDEO_URL.txt)

## Test accounts

Password for all accounts: **`ajaia-demo`** (or use the one-click buttons on the login screen)

- `alice@ajaia.test`: owns a doc shared with Bob as editor
- `bob@ajaia.test`: owns a doc shared with Alice as viewer
- `carol@ajaia.test`: nothing shared yet, so use her to try granting access

To test sharing, use two browsers (or one normal and one private window), one per user.

## What's included

| Path                          | What it is                                                                 |
| ----------------------------- | -------------------------------------------------------------------------- |
| `README.md`                   | Features, local setup and run instructions, tests, deployment               |
| `ARCHITECTURE.md`             | Architecture note: design, priorities, scope cuts, next steps              |
| `AI_WORKFLOW.md`              | AI tools used, what was changed or rejected, how it was verified           |
| `SUBMISSION.md`               | This file                                                                  |
| `VIDEO_URL.txt`               | Walkthrough video link                                                     |
| `server/`                     | Express + SQLite API (TypeScript), including `server/test/` API tests      |
| `client/`                     | React + TipTap single-page app                                             |
| `e2e/smoke.mjs`               | Two-user browser smoke test (Playwright)                                   |
| `samples/`                    | Sample `.md`, `.txt`, `.docx` files to try the import feature              |
| `docs/screenshots/`           | Screenshots of the main flows (captured by the smoke test)                 |
| `Dockerfile`, `render.yaml`   | Container build and Render deployment blueprint                            |
| `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts` | Build and tooling config |

## Status

**Working end to end:** login with seeded users; create, rename, edit, autosave, reopen and delete documents; rich text (bold, italic, underline, strikethrough, H1–H3, bulleted and numbered lists, quotes, undo/redo); .txt/.md/.docx import into a new document; sharing by email with viewer/editor roles, role changes and revoke; separate "My documents" and "Shared with me" lists; conflict detection on concurrent edits; near-live updates for open documents; SQLite persistence; API and browser tests; Docker deployment.

**Incomplete or intentionally out of scope:** real-time co-editing (concurrent edits are detected and resolved, not merged); comments and version history; sign-up and password reset; images and tables; durable storage on the free hosting tier (data resets when the free instance restarts; see the README).

**Next 2–4 hours:** version history with restore, then an SSE push replacing polling plus presence, then Markdown/PDF export and import into an existing document, then a durable volume and CI. Details are in ARCHITECTURE.md.
