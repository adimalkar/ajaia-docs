import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDb } from "./db.js";
import { seedIfEmpty } from "./seed.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";

const dataDir = process.env.DATA_DIR ?? path.resolve("data");
fs.mkdirSync(dataDir, { recursive: true });
const db = openDb(path.join(dataDir, "docs.db"));
seedIfEmpty(db);

// In production the compiled server lives in dist/server and the client build in dist/client.
const clientDir = process.env.CLIENT_DIR ?? path.resolve(here, "../client");
const app = createApp(db, { clientDir: isProd ? clientDir : undefined, secureCookies: isProd });

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Ajaia Docs listening on http://localhost:${port} (data: ${dataDir})`);
});
