import crypto from "node:crypto";
import type { DB } from "./db.js";
import { HttpError, notFound } from "./errors.js";

export type ShareRole = "viewer" | "editor";
export type Role = "owner" | ShareRole;

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: string;
  role: Role;
  owner: { id: number; name: string; email: string };
}

export interface DocumentDetail extends DocumentSummary {
  contentHtml: string;
  version: number;
  updatedBy: string | null;
}

export interface Share {
  userId: number;
  name: string;
  email: string;
  role: ShareRole;
}

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

export function getRole(db: DB, docId: string, userId: number): Role | null {
  const row = db
    .prepare(
      `SELECT CASE WHEN d.owner_id = @userId THEN 'owner' ELSE s.role END AS role
       FROM documents d
       LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = @userId
       WHERE d.id = @docId`,
    )
    .get({ docId, userId }) as { role: Role | null } | undefined;
  return row?.role ?? null;
}

/**
 * Throws unless the user has at least `minimum` access. Users with no access get a 404
 * (not a 403) so document IDs can't be probed for existence.
 */
export function assertRole(db: DB, docId: string, userId: number, minimum: Role): Role {
  const role = getRole(db, docId, userId);
  if (!role) throw notFound();
  if (ROLE_RANK[role] < ROLE_RANK[minimum]) {
    const action = minimum === "owner" ? "Only the owner can do that" : "You have view-only access to this document";
    throw new HttpError(403, action);
  }
  return role;
}

const SUMMARY_COLUMNS = `
  d.id, d.title, d.updated_at AS updatedAt,
  o.id AS ownerId, o.name AS ownerName, o.email AS ownerEmail`;

type SummaryRow = {
  id: string;
  title: string;
  updatedAt: string;
  ownerId: number;
  ownerName: string;
  ownerEmail: string;
  role: Role;
};

const toSummary = (r: SummaryRow): DocumentSummary => ({
  id: r.id,
  title: r.title,
  updatedAt: r.updatedAt,
  role: r.role,
  owner: { id: r.ownerId, name: r.ownerName, email: r.ownerEmail },
});

export function listDocuments(db: DB, userId: number) {
  const owned = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, 'owner' AS role FROM documents d JOIN users o ON o.id = d.owner_id
       WHERE d.owner_id = ? ORDER BY d.updated_at DESC`,
    )
    .all(userId) as SummaryRow[];
  const shared = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, s.role AS role FROM document_shares s
       JOIN documents d ON d.id = s.document_id JOIN users o ON o.id = d.owner_id
       WHERE s.user_id = ? ORDER BY d.updated_at DESC`,
    )
    .all(userId) as SummaryRow[];
  return { owned: owned.map(toSummary), shared: shared.map(toSummary) };
}

export function getDocument(db: DB, docId: string, userId: number): DocumentDetail {
  const role = assertRole(db, docId, userId, "viewer");
  const row = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}, d.content_html AS contentHtml, d.version, ub.name AS updatedBy
       FROM documents d JOIN users o ON o.id = d.owner_id LEFT JOIN users ub ON ub.id = d.updated_by
       WHERE d.id = ?`,
    )
    .get(docId) as SummaryRow & { contentHtml: string; version: number; updatedBy: string | null };
  return { ...toSummary({ ...row, role }), contentHtml: row.contentHtml, version: row.version, updatedBy: row.updatedBy };
}

export function createDocument(db: DB, ownerId: number, title: string, contentHtml = ""): DocumentDetail {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO documents (id, owner_id, title, content_html, version, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(id, ownerId, title, contentHtml, now, now, ownerId);
  return getDocument(db, id, ownerId);
}

/**
 * Optimistic concurrency: the write only lands if the caller saw the latest version.
 * Otherwise a 409 tells the client someone else saved in between, instead of silently
 * overwriting their work.
 */
export function updateDocument(
  db: DB,
  docId: string,
  userId: number,
  changes: { title?: string; contentHtml?: string; baseVersion: number },
): DocumentDetail {
  assertRole(db, docId, userId, "editor");
  const result = db
    .prepare(
      `UPDATE documents SET
         title = COALESCE(@title, title),
         content_html = COALESCE(@contentHtml, content_html),
         version = version + 1,
         updated_at = @now,
         updated_by = @userId
       WHERE id = @docId AND version = @baseVersion`,
    )
    .run({
      docId,
      userId,
      title: changes.title ?? null,
      contentHtml: changes.contentHtml ?? null,
      baseVersion: changes.baseVersion,
      now: new Date().toISOString(),
    });
  if (result.changes === 0) {
    throw new HttpError(409, "This document was changed by someone else since you opened it", "VERSION_CONFLICT");
  }
  return getDocument(db, docId, userId);
}

export function deleteDocument(db: DB, docId: string, userId: number) {
  assertRole(db, docId, userId, "owner");
  db.prepare("DELETE FROM documents WHERE id = ?").run(docId);
}

export function listShares(db: DB, docId: string, userId: number): Share[] {
  assertRole(db, docId, userId, "owner");
  return db
    .prepare(
      `SELECT u.id AS userId, u.name, u.email, s.role FROM document_shares s
       JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`,
    )
    .all(docId) as Share[];
}

/** Grants (or changes) access for the user with `email`. Re-sharing updates the role. */
export function shareDocument(db: DB, docId: string, ownerId: number, email: string, role: ShareRole): Share[] {
  assertRole(db, docId, ownerId, "owner");
  const target = db.prepare("SELECT id FROM users WHERE email = ?").get(email.trim()) as { id: number } | undefined;
  if (!target) throw new HttpError(404, `No user found with email ${email}`);
  if (target.id === ownerId) throw new HttpError(400, "You already own this document");
  db.prepare(
    `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(docId, target.id, role, new Date().toISOString());
  return listShares(db, docId, ownerId);
}

export function revokeShare(db: DB, docId: string, ownerId: number, targetUserId: number): Share[] {
  assertRole(db, docId, ownerId, "owner");
  db.prepare("DELETE FROM document_shares WHERE document_id = ? AND user_id = ?").run(docId, targetUserId);
  return listShares(db, docId, ownerId);
}
