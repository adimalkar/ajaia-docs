# AI workflow note

## Tools used

- **Claude Code (Claude Opus 5.5)** in the terminal as the main pair-programmer: scaffolding, implementation, tests, and driving a headless browser for verification.
- **Playwright (headless Chrome)**, driven by Claude Code, to exercise the real UI as two users at once and capture screenshots for visual review.

## Where AI materially sped things up

- **Scaffolding and boilerplate:** Express routes with zod validation, the SQLite schema, TypeScript configs, CSS, and the Dockerfile. Most of the code was first drafted by AI, which left the timebox free for decisions, review and verification.
- **Library API lookups in context:** TipTap 3 and Express 5 differ from the versions most examples use (for example, StarterKit now includes Underline and Link, and Express 5 uses a different wildcard route syntax). The agent read the installed type definitions instead of guessing from memory.
- **Test breadth:** API tests for the full share lifecycle, and a two-browser E2E script, that I would likely have cut short by hand.

## What I changed or rejected

- **A real bug the first draft shipped:** the generated editor called TipTap's `setEditable()`, which emits an `update` event by default. Every time a document opened, the editor autosaved: editors silently bumped the version, and viewers sent a forbidden save that left them stuck, so they never received live updates. The E2E run caught it (a viewer never saw the owner's edits). The fix is `setEditable(x, false)` plus an `isEditable` guard in `onUpdate`.
- **Layout bugs caught only by looking at screenshots:** the toolbar collapsed to ~14px inside a flex column, and the conflict banner scrolled out of view when you were further down a long document. I moved the toolbar and banners into one sticky container so a conflict warning can't be missed.
- **Rejected a speculative "fix":** text typed after a reload landed in the wrong place during the E2E run. Instead of patching the editor (for example, forcing a ProseMirror selection flush), I isolated it with a minimal repro. The cause was Playwright typing in the same tick as the click, before ProseMirror reads the DOM selection, which a human can't do. The fix went into the test (a short settle wait), and the app code stayed unchanged.
- **Scope held deliberately small:** the concurrency design is optimistic versioning plus polling rather than a Yjs/WebSocket build-out, and import creates a new document rather than offering a merge-into-draft UI. The reasoning is in ARCHITECTURE.md.
- **Hosting change mid-build:** the first plan was Render's free tier with an on-disk SQLite file. I rejected it because the service sleeps after 15 minutes and loses data on restart, which is a bad reviewer experience. Moving to Vercel meant the database couldn't live on disk, so the data layer moved to Turso (hosted SQLite) and became async. Before deploying, the agent ran `vercel build` locally, then ran the full browser E2E against the generated serverless function bundle behind a small server that mimics Vercel's routing. That way, module-resolution or native-binary problems would surface locally rather than on the first real deploy.
- **Production-only crash, debugged with evidence, not guesses:** the first Vercel deploy failed every request with `FUNCTION_INVOCATION_FAILED`. The first hypothesis (libSQL's native binary missing from the bundle) led to a reasonable change, switching to libSQL's HTTP client for hosted databases, but it didn't fix the crash. Instead of guessing again, the entry point was changed to catch startup errors and return them, which showed the real cause: `sanitize-html` (CommonJS) calling `require()` on the ESM-only `htmlparser2`, which Node 22 allows locally but Vercel's loader doesn't. The first fix tried was downgrading `sanitize-html`, but `npm audit` then showed that version has known XSS advisories. This library is the app's security boundary for stored HTML, so the downgrade was reverted and the server is bundled with esbuild instead, which keeps every dependency on its patched version. Verification reproduced Vercel's limitation locally with `node --no-experimental-require-module` and reran the full E2E against the bundled function before redeploying.
- **Security defaults kept on purpose:** 404 instead of 403 for documents you can't access, only session-token hashes stored in the database, and one sanitization allowlist shared by import and save.

## How I verified correctness, UX and reliability

1. **API tests** (`npm test`, 11 tests): every role transition (none, viewer, editor, revoked, deleted), owner-only actions, idempotent seeding, the 409 path, XSS payloads, validation errors, and import of good, unsupported, oversized and corrupt files.
2. **Typecheck** across client and server (`npm run typecheck`, strict mode).
3. **Browser E2E** (`npm run test:e2e`, 12 checks) against the local production build, the bundled Vercel function, and the live deployment, with Alice and Bob in separate sessions: formatting survives a reload, a viewer is read-only and receives live updates, a role upgrade applies without a reload, a forced concurrent edit shows the conflict banner and resolves it, .docx import, revoke, and a 390px mobile layout without horizontal scroll. The run fails on any JS exception.
4. **Screenshot review** of every key screen (`docs/screenshots/`). This is how the layout issues above were found; tests alone would have passed.
