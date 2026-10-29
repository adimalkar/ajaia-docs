// Vercel serverless function: all /api/* requests are rewritten here (see vercel.json).
// It loads the esbuild bundle produced by `npm run build:vercel` (scripts/bundle-server.mjs).
import type { IncomingMessage, ServerResponse } from "node:http";

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

// Imported lazily so a startup failure is reported as a JSON error
// instead of an opaque FUNCTION_INVOCATION_FAILED.
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // @ts-ignore -- build output, generated before Vercel packages this function
    const { default: serve } = (await import("../dist/vercel/server.mjs")) as { default: Handler };
    await serve(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    // Details go to the Vercel function logs, not to the client
    res.end(JSON.stringify({ error: "Server failed to start" }));
  }
}
