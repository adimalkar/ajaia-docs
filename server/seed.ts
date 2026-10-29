import { hashPassword } from "./auth.js";
import { get, run, type DB } from "./db.js";
import { createDocument, shareDocument } from "./documents.js";

export const DEMO_PASSWORD = "ajaia-demo";

export const DEMO_USERS = [
  { email: "alice@ajaia.test", name: "Alice Chen" },
  { email: "bob@ajaia.test", name: "Bob Rivera" },
  { email: "carol@ajaia.test", name: "Carol Okafor" },
];

const WELCOME_HTML = `
<h1>Q3 Product Brief</h1>
<p>This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> as an <em>editor</em>.
Sign in as Bob to see it under <u>Shared with me</u>.</p>
<h2>Goals</h2>
<ul><li>Ship the lightweight editor</li><li>Validate sharing with two teams</li></ul>
<h2>Open questions</h2>
<ol><li>Do we need comments before launch?</li><li>Which file types matter most?</li></ol>`;

const NOTES_HTML = `
<h1>Design review notes</h1>
<p>Owned by <strong>Bob</strong>, shared with Alice as a <em>viewer</em> — Alice can read but not edit.</p>
<blockquote><p>Keep the editor calm: fewer buttons, clearer save state.</p></blockquote>`;

/**
 * Creates demo users and a couple of shared documents on an empty database.
 * Safe to call on every (serverless) cold start: users are inserted with OR IGNORE and
 * only the start that actually created Alice goes on to create the sample documents.
 */
export async function seedIfEmpty(db: DB) {
  if (await get(db, "SELECT 1 FROM users LIMIT 1")) return;

  const passwordHash = hashPassword(DEMO_PASSWORD);
  const ids: number[] = [];
  let createdFirst = false;
  for (const [i, u] of DEMO_USERS.entries()) {
    const res = await run(db, "INSERT OR IGNORE INTO users (email, name, password_hash) VALUES (?, ?, ?)", [
      u.email,
      u.name,
      passwordHash,
    ]);
    if (i === 0) createdFirst = res.changes === 1;
    ids.push((await get<{ id: number }>(db, "SELECT id FROM users WHERE email = ?", [u.email]))!.id);
  }
  if (!createdFirst) return;

  const [alice, bob] = ids;
  const brief = await createDocument(db, alice, "Q3 Product Brief", WELCOME_HTML.trim());
  await shareDocument(db, brief.id, alice, "bob@ajaia.test", "editor");
  const notes = await createDocument(db, bob, "Design review notes", NOTES_HTML.trim());
  await shareDocument(db, notes.id, bob, "alice@ajaia.test", "viewer");
}
