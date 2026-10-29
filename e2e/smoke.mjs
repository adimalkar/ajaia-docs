import { chromium } from "playwright-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Browser smoke test of the main flows against a running server.
// Usage: npm run build && npm start, then: npm run test:e2e
// Env: BASE (default http://localhost:3001), CHROME_PATH (optional, a local Chrome/Chromium binary)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE ?? "http://localhost:3001";
const SHOTS = path.join(root, "docs/screenshots");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const errors = [];
const DOC_TITLE = `Launch checklist ${Date.now().toString(36)}`; // unique so reruns don't collide
const step = (m) => console.log("✔", m);

async function session(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name} console: ${m.text()}`));
  return page;
}

const alice = await session("alice");
await alice.goto(BASE);
await alice.screenshot({ path: `${SHOTS}/01-login.png` });
await alice.getByRole("button", { name: /Alice/ }).click();
await alice.getByRole("heading", { name: "Documents", exact: true }).waitFor();
await alice.screenshot({ path: `${SHOTS}/02-home-alice.png` });
step("login as Alice, home shows owned + shared sections");
const sharedText = await alice.locator(".doc-section").nth(1).innerText();
if (!sharedText.includes("Design review notes") || !sharedText.includes("View only")) throw new Error("seeded shared doc missing");

// Create + rename + format
await alice.getByRole("button", { name: "New document" }).click();
await alice.waitForURL(/\/d\//);
const docUrl = alice.url();
const title = alice.getByLabel("Document title");
await title.fill(DOC_TITLE);
const ed = alice.locator(".tiptap");
await ed.click();
await alice.getByLabel("Text style").selectOption("h1");
await alice.keyboard.type("Launch checklist");
await alice.keyboard.press("Enter");
await alice.keyboard.press("Control+b");
await alice.keyboard.type("Bold intro");
await alice.keyboard.press("Control+b");
await alice.keyboard.type(" then ");
await alice.getByRole("button", { name: "Italic" }).click();
await alice.keyboard.type("italic");
await alice.getByRole("button", { name: "Italic" }).click();
await alice.keyboard.type(" and ");
await alice.getByRole("button", { name: "Underline" }).click();
await alice.keyboard.type("underlined");
await alice.getByRole("button", { name: "Underline" }).click();
await alice.keyboard.press("Enter");
await alice.getByRole("button", { name: "Bulleted list" }).click();
await alice.keyboard.type("First item");
await alice.keyboard.press("Enter");
await alice.keyboard.type("Second item");
await alice.keyboard.press("Enter");
await alice.keyboard.press("Enter");
await alice.getByRole("button", { name: "Numbered list" }).click();
await alice.keyboard.type("Step one");
await alice.locator(".save-status", { hasText: "All changes saved" }).waitFor({ timeout: 5000 });
await alice.evaluate(() => window.scrollTo(0, 0));
await alice.screenshot({ path: `${SHOTS}/03-editor.png` });
step("create, rename, format, autosave");

await alice.reload();
await alice.locator(".tiptap h1").waitFor();
const html = await ed.innerHTML();
for (const tag of ["<h1>", "<strong>Bold intro</strong>", "<em>italic</em>", "<u>underlined</u>", "<ul>", "<ol>"]) {
  if (!html.includes(tag)) throw new Error(`after reload missing ${tag}: ${html}`);
}
if ((await title.inputValue()) !== DOC_TITLE) throw new Error("title not persisted");
step("reload preserves title + formatting");

// Share with Bob as viewer
await alice.getByRole("button", { name: "Share" }).click();
await alice.getByLabel("Email address").fill("bob@ajaia.test");
await alice.getByLabel("Access level").selectOption("viewer");
await alice.locator(".share-form").getByRole("button", { name: "Share" }).click();
await alice.locator(".share-list", { hasText: "Bob Rivera" }).waitFor();
await alice.getByLabel("Email address").fill("nobody@ajaia.test");
await alice.locator(".share-form").getByRole("button", { name: "Share" }).click();
await alice.getByText("No user found with email").waitFor();
await alice.screenshot({ path: `${SHOTS}/04-share-dialog.png` });
await alice.getByRole("button", { name: "Close" }).click();
step("share dialog: grant viewer, unknown email error");

const bob = await session("bob");
await bob.goto(docUrl); // deep link -> login -> lands on the doc
await bob.getByRole("button", { name: /Bob/ }).click();
await bob.locator(".tiptap h1").waitFor();
if (await bob.locator(".toolbar").count()) throw new Error("viewer sees toolbar");
if ((await bob.locator(".tiptap").getAttribute("contenteditable")) !== "false") throw new Error("viewer can edit");
await bob.getByText("You have view-only access").waitFor();
await bob.screenshot({ path: `${SHOTS}/05-bob-viewer.png` });
step("Bob opens share link as viewer, read-only");

// Alice edits; Bob sees it via polling
await ed.locator("ol li").last().click();
await alice.waitForTimeout(150);
await alice.keyboard.press("End");
await alice.keyboard.press("Enter");
await alice.keyboard.type("Live update from Alice");
await alice.locator(".save-status", { hasText: "All changes saved" }).waitFor({ timeout: 5000 });
await bob.locator(".tiptap", { hasText: "Live update from Alice" }).waitFor({ timeout: 8000 });
step("viewer receives owner's saved changes via polling");

// Upgrade to editor -> Bob gets toolbar without reload
await alice.getByRole("button", { name: "Share" }).click();
await alice.getByLabel("Access for Bob Rivera").selectOption("editor");
await alice.waitForTimeout(400);
await alice.getByRole("button", { name: "Close" }).click();
await bob.locator(".toolbar").waitFor({ timeout: 8000 });
step("role upgrade to editor applies live");

// Conflict: Alice goes offline-ish (block saves), Bob saves, Alice saves -> 409 banner
await bob.locator(".tiptap ol li").last().click();
await bob.waitForTimeout(150);
await bob.keyboard.press("End");
await bob.keyboard.type(" (Bob edit)");
// Alice types immediately too; her base version is now stale once Bob saves first
await alice.route("**/api/documents/*", (r) => (r.request().method() === "PATCH" ? setTimeout(() => r.continue(), 1500) : r.continue()));
await ed.locator("p").first().click();
await alice.waitForTimeout(150);
await alice.keyboard.press("Home");
await alice.keyboard.type("Alice edit ");
await bob.locator(".save-status", { hasText: "All changes saved" }).waitFor({ timeout: 5000 });
await alice.getByText("Someone else saved changes").waitFor({ timeout: 8000 });
await alice.screenshot({ path: `${SHOTS}/06-conflict.png` });
await alice.unroute("**/api/documents/*");
await alice.getByRole("button", { name: "Keep mine" }).click();
await alice.locator(".save-status", { hasText: "All changes saved" }).waitFor({ timeout: 5000 });
step("concurrent edit -> conflict banner -> keep mine saves");

// Bob's home: doc under Shared with me
await bob.goto(BASE);
await bob.locator(".doc-section").nth(1).getByText(DOC_TITLE).waitFor();
await bob.screenshot({ path: `${SHOTS}/07-home-bob.png` });
step("Bob's home lists doc under Shared with me");

// Import .docx and .md, and a rejected file
await alice.goto(BASE);
await alice.locator("input[type=file]").setInputFiles(path.join(root, "samples/meeting-notes.docx"));
await alice.waitForURL(/\/d\//);
await alice.locator(".tiptap h1", { hasText: "Meeting Notes" }).waitFor();
if (!(await alice.locator(".tiptap strong", { hasText: "Bold run" }).count())) throw new Error("docx bold lost");
if ((await alice.getByLabel("Document title").inputValue()) !== "meeting notes") throw new Error("docx title");
await alice.screenshot({ path: `${SHOTS}/08-imported-docx.png` });
await alice.goto(BASE);
await alice.locator("input[type=file]").setInputFiles({ name: "bad.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
await alice.getByText(/Couldn't import "bad.pdf"/).waitFor();
await alice.screenshot({ path: `${SHOTS}/09-import-error.png` });
step("import .docx -> new doc; unsupported type shows error");

// Revoke: Bob loses access
const bobAgain = bob;
await bobAgain.goto(docUrl);
await bobAgain.locator(".tiptap").waitFor();
await alice.goto(docUrl);
await alice.getByRole("button", { name: "Share" }).click();
await alice.getByLabel("Remove Bob Rivera").click();
await alice.locator(".share-list", { hasText: "Bob Rivera" }).waitFor({ state: "detached" });
await bobAgain.getByText("Your access to this document was removed").waitFor({ timeout: 8000 });
step("revoke access -> Bob sees access removed");

// Mobile viewport sanity
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const m = await mobile.newPage();
await m.goto(BASE);
await m.screenshot({ path: `${SHOTS}/10-mobile-login.png` });
const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
if (overflow) throw new Error("horizontal overflow on mobile login");
step("mobile login has no horizontal scroll");

// HTTP 4xx responses are expected (401 before login, 404/409/415 from negative paths); real JS errors are not.
const jsErrors = errors.filter((e) => !e.includes("Failed to load resource"));
console.log(jsErrors.length ? `\nJS errors:\n${jsErrors.join("\n")}` : "\nNo JS errors");
await browser.close();
if (jsErrors.length) process.exit(1);
