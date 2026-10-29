import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { openDb, type DB } from "../db.js";
import { DEMO_PASSWORD, seedIfEmpty } from "../seed.js";

let db: DB;
let app: ReturnType<typeof createApp>;

async function signIn(email: string) {
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email, password: DEMO_PASSWORD }).expect(200);
  return agent;
}

beforeEach(() => {
  db = openDb(":memory:");
  seedIfEmpty(db);
  app = createApp(db);
});

describe("auth", () => {
  it("rejects unauthenticated requests and bad passwords", async () => {
    await request(app).get("/api/documents").expect(401);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "alice@ajaia.test", password: "wrong" })
      .expect(401);
    expect(res.body.error).toMatch(/incorrect/i);
  });
});

describe("sharing and access control", () => {
  it("enforces owner / editor / viewer / no-access across the full share lifecycle", async () => {
    const alice = await signIn("alice@ajaia.test");
    const bob = await signIn("bob@ajaia.test");
    const carol = await signIn("carol@ajaia.test");

    const { body: doc } = await alice.post("/api/documents").send({ title: "Roadmap" }).expect(201);
    expect(doc.role).toBe("owner");

    // Not shared yet: Bob can't see it, and gets a 404 rather than a hint that it exists
    await bob.get(`/api/documents/${doc.id}`).expect(404);
    expect((await bob.get("/api/documents")).body.shared.map((d: { id: string }) => d.id)).not.toContain(doc.id);

    // Viewer: can read, appears under "shared", cannot edit or re-share
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: "bob@ajaia.test", role: "viewer" }).expect(200);
    const bobList = (await bob.get("/api/documents")).body;
    expect(bobList.shared.find((d: { id: string }) => d.id === doc.id)).toMatchObject({
      role: "viewer",
      owner: { email: "alice@ajaia.test" },
    });
    expect(bobList.owned.map((d: { id: string }) => d.id)).not.toContain(doc.id);
    await bob.patch(`/api/documents/${doc.id}`).send({ contentHtml: "<p>hi</p>", baseVersion: 1 }).expect(403);

    // Upgrade to editor: Bob can now edit, but still can't share or delete
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: "bob@ajaia.test", role: "editor" }).expect(200);
    const edited = await bob
      .patch(`/api/documents/${doc.id}`)
      .send({ contentHtml: "<p>Bob was here</p>", baseVersion: 1 })
      .expect(200);
    expect(edited.body).toMatchObject({ version: 2, role: "editor", updatedBy: "Bob Rivera" });
    await bob.post(`/api/documents/${doc.id}/shares`).send({ email: "carol@ajaia.test", role: "viewer" }).expect(403);
    await bob.delete(`/api/documents/${doc.id}`).expect(403);

    // Carol was never granted access
    await carol.get(`/api/documents/${doc.id}`).expect(404);

    // Revoking removes access immediately
    const bobId = (await bob.get("/api/auth/me")).body.user.id;
    await alice.delete(`/api/documents/${doc.id}/shares/${bobId}`).expect(200);
    await bob.get(`/api/documents/${doc.id}`).expect(404);
  });

  it("rejects sharing with unknown users or with yourself", async () => {
    const alice = await signIn("alice@ajaia.test");
    const { body: doc } = await alice.post("/api/documents").send({}).expect(201);
    expect(doc.title).toBe("Untitled document");
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: "nobody@ajaia.test", role: "viewer" }).expect(404);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: "alice@ajaia.test", role: "viewer" }).expect(400);
    await alice.post(`/api/documents/${doc.id}/shares`).send({ email: "bob@ajaia.test", role: "admin" }).expect(400);
  });
});

describe("editing", () => {
  it("persists formatting and rejects stale writes with a 409", async () => {
    const alice = await signIn("alice@ajaia.test");
    const { body: doc } = await alice.post("/api/documents").send({ title: "Draft" }).expect(201);

    const html = "<h2>Heading</h2><p><strong>bold</strong> <em>italic</em> <u>under</u></p><ul><li><p>one</p></li></ul>";
    await alice.patch(`/api/documents/${doc.id}`).send({ contentHtml: html, baseVersion: 1 }).expect(200);
    const reopened = await alice.get(`/api/documents/${doc.id}`).expect(200);
    expect(reopened.body.contentHtml).toBe(html);
    expect(reopened.body.version).toBe(2);

    // A second client still holding version 1 must not silently overwrite version 2
    const stale = await alice.patch(`/api/documents/${doc.id}`).send({ title: "Old", baseVersion: 1 }).expect(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
    expect((await alice.get(`/api/documents/${doc.id}`)).body.title).toBe("Draft");
  });

  it("strips scripts and event handlers from stored HTML", async () => {
    const alice = await signIn("alice@ajaia.test");
    const { body: doc } = await alice.post("/api/documents").send({}).expect(201);
    const { body } = await alice
      .patch(`/api/documents/${doc.id}`)
      .send({
        contentHtml: `<p onclick="steal()">ok<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>`,
        baseVersion: 1,
      })
      .expect(200);
    expect(body.contentHtml).toBe("<p>ok</p><a>x</a>");
  });

  it("validates input", async () => {
    const alice = await signIn("alice@ajaia.test");
    const { body: doc } = await alice.post("/api/documents").send({}).expect(201);
    await alice.patch(`/api/documents/${doc.id}`).send({ baseVersion: 1 }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: "x".repeat(201), baseVersion: 1 }).expect(400);
    await alice.patch(`/api/documents/${doc.id}`).send({ title: "ok" }).expect(400);
  });
});

describe("file import", () => {
  it("turns a Markdown upload into a new formatted document owned by the uploader", async () => {
    const alice = await signIn("alice@ajaia.test");
    const md = "# Launch plan\n\nSome **bold** text.\n\n- first\n- second\n";
    const { body } = await alice
      .post("/api/documents/import")
      .attach("file", Buffer.from(md), "launch_plan.md")
      .expect(201);
    expect(body).toMatchObject({ title: "launch plan", role: "owner" });
    expect(body.contentHtml).toContain("<h1>Launch plan</h1>");
    expect(body.contentHtml).toContain("<strong>bold</strong>");
    expect(body.contentHtml).toMatch(/<ul>\s*<li>first<\/li>/);
  });

  it("escapes plain text and keeps paragraph structure", async () => {
    const alice = await signIn("alice@ajaia.test");
    const { body } = await alice
      .post("/api/documents/import")
      .attach("file", Buffer.from("Hello <world>\nline two\n\nSecond para"), "notes.txt")
      .expect(201);
    expect(body.contentHtml).toBe("<p>Hello &lt;world&gt;<br />line two</p><p>Second para</p>");
  });

  it("rejects unsupported and corrupt files with a clear message", async () => {
    const alice = await signIn("alice@ajaia.test");
    const exe = await alice.post("/api/documents/import").attach("file", Buffer.from("MZ"), "setup.exe").expect(415);
    expect(exe.body.error).toMatch(/Supported: .txt, .md, .markdown, .docx/);
    await alice.post("/api/documents/import").attach("file", Buffer.from("not a zip"), "broken.docx").expect(422);
    await alice.post("/api/documents/import").expect(400);
  });
});
