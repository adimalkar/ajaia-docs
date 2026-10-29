import fs from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express from "express";
import { requireUser } from "./auth.js";
import type { DB } from "./db.js";
import { errorHandler, HttpError } from "./errors.js";
import { authRoutes } from "./routes/auth.js";
import { documentRoutes } from "./routes/documents.js";

export interface AppOptions {
  /** Directory containing the built client (index.html). Omit to serve the API only. */
  clientDir?: string;
  secureCookies?: boolean;
}

export function createApp(db: DB, { clientDir, secureCookies = false }: AppOptions = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/api/users", requireUser(db), (_req, res) => {
    // Small internal directory used for share suggestions.
    res.json({ users: db.prepare("SELECT id, name, email FROM users ORDER BY name").all() });
  });
  app.use("/api/auth", authRoutes(db, { secureCookies }));
  app.use("/api/documents", requireUser(db), documentRoutes(db));
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  if (clientDir && fs.existsSync(path.join(clientDir, "index.html"))) {
    app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
    // SPA fallback: every non-API route renders the client app
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
