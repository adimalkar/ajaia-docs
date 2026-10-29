import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app.js";
import { hostedDbFromEnv, openDb } from "./db.js";
import { seedIfEmpty } from "./seed.js";

// Serverless entry: Vercel serves the static client itself, so the app only handles /api/*.
// Schema + seed run once per cold start; the promise is reset if startup fails so the next
// request retries instead of being stuck on a rejected promise.
let ready: Promise<ReturnType<typeof createApp>> | undefined;

async function init() {
  const hosted = hostedDbFromEnv();
  if (!hosted) {
    const seen = Object.keys(process.env).filter((k) => /TURSO|LIBSQL|DATABASE/.test(k));
    throw new Error(`No database configured: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (found: ${seen.join(", ") || "none"})`);
  }
  const db = await openDb(hosted.url, hosted.authToken);
  await seedIfEmpty(db);
  return createApp(db, { secureCookies: true });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  ready ??= init().catch((err) => {
    ready = undefined;
    throw err;
  });
  try {
    const app = await ready;
    app(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "The server is starting up or misconfigured. Please try again shortly." }));
  }
}
