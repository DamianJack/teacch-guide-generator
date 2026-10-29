import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { approvalIssues, editDraft, migrateDraft, move, newDraft, sameRevision, generationSchema, usedPhotos } from "../src/lib/guide.ts";

test("approval only requires a photo for every step; edits invalidate it", () => {
  const d = { ...newDraft(), title: "Pack a kit", materials: [{ id: "m", name: "Screw", quantity: "4", unit: "pieces" }],
    photos: [{ id: "p", name: "kit.jpg", blob: new Blob(["photo"]) }], steps: [{ id: "s", text: "Put 4 screws in the box.", photoIds: ["p"] }] };
  assert.deepEqual(approvalIssues(d), []);
  assert.deepEqual(approvalIssues({ ...d, title: "", materials: [], steps: [{ ...d.steps[0], text: "" }] }), []);
  assert.ok(approvalIssues({ ...d, steps: [] }).includes("steps"));
  assert.ok(approvalIssues({ ...d, steps: [{ ...d.steps[0], photoIds: ["missing"] }] }).includes("stepContent"));
  assert.ok(approvalIssues({ ...d, steps: [{ ...d.steps[0], photoIds: [] }] }).includes("stepContent"));
  assert.deepEqual(approvalIssues({ ...d, photos: [...d.photos, { id: "q", name: "b.jpg", blob: new Blob(["b"]) }], steps: [{ ...d.steps[0], photoIds: ["p", "q"] }] }), []);
  assert.deepEqual(approvalIssues({ ...d, noMaterials: true, materials: [] }), []);
  const approved = { ...d, approvedRevision: d.revision };
  const changed = editDraft(approved, { title: "Updated task" });
  assert.equal(changed.approvedRevision, null);
  assert.equal(sameRevision(changed, approved), false);
  assert.equal(sameRevision(approved, { ...approved }), true);
});

test("ordering preserves stable photo associations and structured output rejects empty steps", () => {
  const steps = [{ id: "s1", photoIds: ["p1"] }, { id: "s2", photoIds: ["p2", "p3"] }];
  assert.deepEqual(move(steps, 0, 1), [steps[1], steps[0]]);
  assert.deepEqual(move(steps, 0, -1), steps);
  assert.equal(generationSchema.safeParse({ steps: [] }).success, false);
  assert.equal(newDraft().steps.length, 1);
  const photo = id => ({ id, name: `${id}.jpg`, blob: new Blob([id]) });
  assert.deepEqual(usedPhotos([photo("p1"), photo("p2"), photo("p3")], [steps[1]]).map(p => p.id), ["p2", "p3"]);
});

test("drafts saved with one photo per step migrate to step-owned photo lists", () => {
  const legacy = { ...newDraft(), photos: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    steps: [{ id: "s1", text: "A", photoId: "p1" }, { id: "s2", text: "B", photoId: "" }] };
  const migrated = migrateDraft(legacy);
  assert.deepEqual(migrated.steps.slice(0, 2), [{ id: "s1", text: "A", photoIds: ["p1"] }, { id: "s2", text: "B", photoIds: [] }]);
  assert.deepEqual(migrated.steps.slice(2).map(s => s.photoIds), [["p2"], ["p3"]]);
  assert.deepEqual(migrateDraft({ ...legacy, photos: [], steps: [] }).steps.map(s => s.photoIds), [[]]);
});

test("AI boundary rejects invalid requests, provider failures and invented photo references", async () => {
  const bundle = await build({ entryPoints: ["src/lib/ai.ts"], bundle: true, write: false, platform: "node", format: "esm" });
  const { handleAI } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FIREWORKS_API_KEY; const originalModel = process.env.AI_MODEL;
  const request = body => new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const input = { facts: { language: "de", title: "Set packen", notes: "", materials: [], noMaterials: true },
    steps: [{ id: "step-1", text: "", photoIds: ["photo-1"] }], photos: [{ id: "photo-1", data: "data:image/jpeg;base64,/9j/2Q==" }] };
  try {
    assert.equal((await handleAI(request({}))).status, 400);
    assert.equal((await handleAI(request({ ...input, steps: [{ ...input.steps[0], photoIds: [] }] }))).status, 400);
    assert.equal((await handleAI(request({ ...input, steps: [{ ...input.steps[0], photoIds: ["invented"] }] }))).status, 400);
    assert.equal((await handleAI(new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "4000000" }, body: "{}" }))).status, 413);
    delete process.env.FIREWORKS_API_KEY; delete process.env.AI_MODEL;
    assert.equal((await handleAI(request(input))).status, 503);
    process.env.FIREWORKS_API_KEY = "test-key"; process.env.AI_MODEL = "accounts/fireworks/models/deepseek-v4p1-flash";
    let output = { steps: [{ stepId: "step-1", text: "Set packen" }] };
    let finishReason = "stop";
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.fireworks.ai/inference/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      const sent = JSON.parse(options.body);
      assert.equal(sent.model, "accounts/fireworks/models/deepseek-v4p1-flash");
      assert.equal(sent.response_format.type, "json_schema");
      assert.equal(sent.response_format.json_schema.schema.additionalProperties, false);
      const properties = sent.response_format.json_schema.schema.properties;
      assert.deepEqual(properties.steps.items.properties.stepId.enum, ["step-1"]);
      assert.match(sent.messages[0].content, /German/);
      assert.match(sent.messages[1].content[1].text, /Step 1 \(step identifier: step-1\)/);
      assert.equal(sent.messages[1].content[3].type, "image_url");
      assert.equal(sent.messages[1].content[3].image_url.url, input.photos[0].data);
      return Response.json({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(output) } }] });
    };
    const success = await handleAI(request(input));
    assert.equal(success.status, 200); assert.deepEqual(await success.json(), output);
    finishReason = "length";
    assert.equal((await handleAI(request(input))).status, 502);
    finishReason = "stop";
    output = { ...output, steps: [{ stepId: "invented", text: "Do something" }] };
    assert.equal((await handleAI(request(input))).status, 502);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    assert.equal((await handleAI(request(input))).status, 503);
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal((await handleAI(request(input))).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.FIREWORKS_API_KEY; else process.env.FIREWORKS_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = originalModel;
  }
});
