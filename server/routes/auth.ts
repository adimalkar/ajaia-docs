import { Router } from "express";
import { z } from "zod";
import { createSession, destroySession, requireUser, SESSION_COOKIE, verifyPassword } from "../auth.js";
import type { DB } from "../db.js";
import { HttpError } from "../errors.js";

const loginBody = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export function authRoutes(db: DB, { secureCookies }: { secureCookies: boolean }) {
  const router = Router();

  router.post("/login", (req, res) => {
    const { email, password } = loginBody.parse(req.body);
    const row = db.prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get(email) as
      | { id: number; email: string; name: string; password_hash: string }
      | undefined;
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, "Incorrect email or password");
    }
    const { token, expires } = createSession(db, row.id);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies, expires });
    res.json({ user: { id: row.id, email: row.email, name: row.name } });
  });

  router.post("/logout", (req, res) => {
    destroySession(db, req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE);
    res.status(204).end();
  });

  router.get("/me", requireUser(db), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
