// Vercel serverless function: all /api/* requests are rewritten here (see vercel.json).
import type { IncomingMessage, ServerResponse } from "node:http";

// The server is imported lazily so a startup failure is reported as a JSON error
// instead of an opaque FUNCTION_INVOCATION_FAILED.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const { default: serve } = await import("../server/vercel.js");
    await serve(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    // TEMP diagnostics: include the startup error while debugging the first deploy
    res.end(JSON.stringify({ error: "Server failed to start", detail: String((err as Error)?.stack ?? err) }));
  }
}
