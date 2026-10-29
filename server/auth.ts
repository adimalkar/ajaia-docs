import crypto from "node:crypto";
import type { RequestHandler } from "express";
import type { DB } from "./db.js";
import { HttpError } from "./errors.js";

export interface User {
  id: number;
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

export const SESSION_COOKIE = "sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

// Only a hash of the session token is stored, so a leaked DB can't be replayed as cookies.
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function createSession(db: DB, userId: number): { token: string; expires: Date } {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    userId,
    expires.toISOString(),
  );
  return { token, expires };
}

export function destroySession(db: DB, token: string | undefined) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function userForSession(db: DB, token: string | undefined): User | undefined {
  if (!token) return undefined;
  return db
    .prepare(
      `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as User | undefined;
}

export function requireUser(db: DB): RequestHandler {
  return (req, _res, next) => {
    const user = userForSession(db, req.cookies?.[SESSION_COOKIE]);
    if (!user) return next(new HttpError(401, "Please sign in"));
    req.user = user;
    next();
  };
}
