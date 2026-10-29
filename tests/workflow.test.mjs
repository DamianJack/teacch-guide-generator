import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { approvalIssues, editDraft, move, newDraft, sameRevision, generationSchema } from "../src/lib/guide.ts";

test("approval requires facts, quantities, action photos and answered questions; edits invalidate it", () => {
  const d = { ...newDraft(), title: "Pack a kit", materials: [{ id: "m", name: "Screw", quantity: "4", unit: "pieces" }],
    photos: [{ id: "p", name: "kit.jpg", blob: new Blob(["photo"]) }], steps: [{ id: "s", text: "Put 4 screws in the box.", photoId: "p" }],
    finished: "The box has 4 screws.", next: "Take a break.", help: "Ask the trainer." };
  assert.deepEqual(approvalIssues(d), []);
  assert.ok(approvalIssues({ ...d, materials: [{ ...d.materials[0], quantity: "" }] }).includes("materials"));
  assert.ok(approvalIssues({ ...d, steps: [{ ...d.steps[0], photoId: "missing" }] }).includes("stepContent"));
  assert.ok(approvalIssues({ ...d, questions: [{ question: "How many?", answer: " " }] }).includes("questions"));
  assert.deepEqual(approvalIssues({ ...d, noMaterials: true, materials: [] }), []);
  const approved = { ...d, approvedRevision: d.revision, review: { revision: d.revision, suggestions: [] } };
  const changed = editDraft(approved, { title: "Updated task" });
  assert.equal(changed.approvedRevision, null);
  assert.notEqual(changed.review.revision, changed.revision);
  assert.equal(sameRevision(changed, approved), false);
  assert.equal(sameRevision(approved, { ...approved }), true);
});

test("ordering preserves stable photo associations and structured output rejects empty steps", () => {
  const steps = [{ id: "s1", photoId: "p1" }, { id: "s2", photoId: "p2" }];
  assert.deepEqual(move(steps, 0, 1), [steps[1], steps[0]]);
  assert.deepEqual(move(steps, 0, -1), steps);
  assert.equal(generationSchema.safeParse({ steps: [], finished: "", next: "", help: "", questions: [] }).success, false);
});

test("AI boundary rejects invalid requests, provider failures and invented photo references", async () => {
  const bundle = await build({ entryPoints: ["src/lib/ai.ts"], bundle: true, write: false, platform: "node", format: "esm" });
  const { handleAI } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.FIREWORKS_API_KEY; const originalModel = process.env.AI_MODEL;
  const request = body => new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const input = { facts: { language: "de", title: "Set packen", notes: "", materials: [], noMaterials: true, finished: "", next: "", help: "" },
    steps: [], questions: [], photos: [{ id: "photo-1", data: "data:image/jpeg;base64,/9j/2Q==" }] };
  try {
    assert.equal((await handleAI(request({}), "generate")).status, 400);
    assert.equal((await handleAI(new Request("http://localhost/api/generate", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": "4000000" }, body: "{}" }), "generate")).status, 413);
    delete process.env.FIREWORKS_API_KEY; delete process.env.AI_MODEL;
    assert.equal((await handleAI(request(input), "generate")).status, 503);
    process.env.FIREWORKS_API_KEY = "test-key"; process.env.AI_MODEL = "accounts/fireworks/models/deepseek-v4p1-flash";
    let output = { steps: [{ text: "Set packen", photoId: "photo-1" }], finished: "", next: "", help: "", questions: ["Was gehört in das Set?"] };
    let finishReason = "stop";
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.fireworks.ai/inference/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      const sent = JSON.parse(options.body);
      assert.equal(sent.model, "accounts/fireworks/models/deepseek-v4p1-flash");
      assert.equal(sent.response_format.type, "json_schema");
      assert.equal(sent.response_format.json_schema.schema.additionalProperties, false);
      const properties = sent.response_format.json_schema.schema.properties;
      if (properties.steps) assert.deepEqual(properties.steps.items.properties.photoId.enum, ["photo-1"]);
      else assert.deepEqual(properties.suggestions.items.properties.target.enum, ["title", "materials", "finished", "next", "help"]);
      assert.match(sent.messages[0].content, /German/);
      assert.equal(sent.messages[1].content[2].type, "image_url");
      assert.equal(sent.messages[1].content[2].image_url.url, input.photos[0].data);
      return Response.json({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(output) } }] });
    };
    const success = await handleAI(request(input), "generate");
    assert.equal(success.status, 200); assert.deepEqual(await success.json(), output);
    finishReason = "length";
    assert.equal((await handleAI(request(input), "generate")).status, 502);
    finishReason = "stop";
    output = { ...output, steps: [{ text: "Do something", photoId: "invented" }] };
    assert.equal((await handleAI(request(input), "generate")).status, 502);
    output = { suggestions: [{ target: "help", issue: "Hilfe ergänzen." }], questions: ["Wer hilft?"] };
    const checked = await handleAI(request(input), "check");
    assert.equal(checked.status, 200); assert.deepEqual(await checked.json(), output);
    globalThis.fetch = async () => new Response(null, { status: 401 });
    assert.equal((await handleAI(request(input), "generate")).status, 503);
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal((await handleAI(request(input), "check")).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.FIREWORKS_API_KEY; else process.env.FIREWORKS_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = originalModel;
  }
});
