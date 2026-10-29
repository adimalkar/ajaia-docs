import crypto from "node:crypto";
import type { RequestHandler } from "express";
import { get, run, type DB } from "./db.js";
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

export async function createSession(db: DB, userId: number): Promise<{ token: string; expires: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await run(db, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [
    hashToken(token),
    userId,
    expires.toISOString(),
  ]);
  return { token, expires };
}

export async function destroySession(db: DB, token: string | undefined) {
  if (token) await run(db, "DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
}

export function userForSession(db: DB, token: string | undefined): Promise<User | undefined> {
  if (!token) return Promise.resolve(undefined);
  return get<User>(
    db,
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    [hashToken(token), new Date().toISOString()],
  );
}

export function requireUser(db: DB): RequestHandler {
  return async (req, _res, next) => {
    const user = await userForSession(db, req.cookies?.[SESSION_COOKIE]);
    if (!user) return next(new HttpError(401, "Please sign in"));
    req.user = user;
    next();
  };
}
