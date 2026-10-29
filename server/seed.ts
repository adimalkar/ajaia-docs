import { hashPassword } from "./auth.js";
import type { DB } from "./db.js";
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

/** Creates demo users and a couple of shared documents on an empty database. Idempotent. */
export function seedIfEmpty(db: DB) {
  const { n } = db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n > 0) return;

  const insert = db.prepare("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)");
  const passwordHash = hashPassword(DEMO_PASSWORD);
  const ids = DEMO_USERS.map((u) => Number(insert.run(u.email, u.name, passwordHash).lastInsertRowid));
  const [alice, bob] = ids;

  const brief = createDocument(db, alice, "Q3 Product Brief", WELCOME_HTML.trim());
  shareDocument(db, brief.id, alice, "bob@ajaia.test", "editor");
  const notes = createDocument(db, bob, "Design review notes", NOTES_HTML.trim());
  shareDocument(db, notes.id, bob, "alice@ajaia.test", "viewer");
}
