// Bundles the serverless entry (server/vercel.ts) into one ESM file for Vercel.
// Bundling resolves CommonJS -> ESM-only dependency chains (sanitize-html -> htmlparser2)
// at build time, because Vercel's runtime loader doesn't support require() of ES modules.
import { build } from "esbuild";

await build({
  entryPoints: ["server/vercel.ts"],
  outfile: "dist/vercel/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // libSQL is loaded via dynamic import and stays a normal node_modules dependency
  external: ["@libsql/*"],
  // Bundled CommonJS code still calls require() for Node built-ins
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "info",
});
