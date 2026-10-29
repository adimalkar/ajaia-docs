import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { hostedDbFromEnv, openDb } from "./db.js";
import { seedIfEmpty } from "./seed.js";

// Long-running server for local dev and Docker. On Vercel, see vercel.ts instead.
const here = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

// Defaults to a local SQLite file; set TURSO_DATABASE_URL to use a hosted database instead.
const hosted = hostedDbFromEnv();
let dbUrl = hosted?.url;
if (!dbUrl) {
  const dataDir = process.env.DATA_DIR ?? path.resolve("data");
  fs.mkdirSync(dataDir, { recursive: true });
  dbUrl = `file:${path.join(dataDir, "docs.db")}`;
}
const db = await openDb(dbUrl, hosted?.authToken);
await seedIfEmpty(db);

// In production the compiled server lives in dist/server and the client build in dist/client.
const clientDir = process.env.CLIENT_DIR ?? path.resolve(here, "../client");
const app = createApp(db, { clientDir: isProd ? clientDir : undefined, secureCookies: isProd });

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Ajaia Docs listening on http://localhost:${port} (db: ${dbUrl.startsWith("file:") ? dbUrl : "remote"})`);
});
