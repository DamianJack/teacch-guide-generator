import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { focusRegionSchema, setStepFocus, editDraft, migrateDraft, newDraft } from "../src/lib/guide.ts";

async function bundleModule(path) {
  const bundle = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
}

test("focus bounds reject invalid AI coordinates and placement stays inside the image", async () => {
  const { placeFocus } = await bundleModule("src/lib/focus.ts");
  for (const [x, y, width, height] of [[0, 0, .35, .35], [1, 1, .2, .6], [-1, 2, 5, -1], [.5, .5, 1, 1]]) {
    const region = placeFocus(x, y, width, height);
    assert.equal(focusRegionSchema.safeParse(region).success, true);
  }
  for (const region of [
    { x: .9, y: 0, width: .2, height: .2 }, { x: 0, y: .9, width: .2, height: .2 },
    { x: -1, y: 0, width: .2, height: .2 }, { x: 0, y: 0, width: 0, height: .2 },
    { x: NaN, y: 0, width: .2, height: .2 }, { x: 0, y: 0, width: Infinity, height: .2 },
  ]) assert.equal(focusRegionSchema.safeParse(region).success, false);
});

test("focus stays per step, survives recovery, can be removed, and revokes approval", () => {
  const step = { id: "s1", text: "Pick up the washer", photoIds: ["p"] };
  const region = { x: .1, y: .2, width: .3, height: .4 };
  const focused = setStepFocus(step, "p", region);
  const draft = { ...newDraft(), steps: [focused, { ...step, id: "s2" }], photos: [{ id: "p" }], approvedRevision: 0 };
  const recovered = migrateDraft(draft);
  assert.deepEqual(recovered.steps[0].focusByPhoto.p, region);
  assert.equal(recovered.steps[1].focusByPhoto, undefined);
  assert.equal(step.focusByPhoto, undefined);
  assert.deepEqual(setStepFocus(focused, "p", null).focusByPhoto, {});
  assert.throws(() => setStepFocus(step, "missing", region));
  assert.equal(editDraft(draft, { steps: [setStepFocus(focused, "p", null)] }).approvedRevision, null);
});

test("shared spotlight renderer dims outside, restores inside, and outlines within image edges", async () => {
  const { drawFocus, stepPhotoKey } = await bundleModule("src/lib/focus.ts");
  const calls = [];
  const context = Object.fromEntries(["drawImage", "fillRect", "save", "beginPath", "ellipse", "clip", "restore", "stroke"].map(name => [name, (...args) => calls.push([name, ...args])]));
  const image = { naturalWidth: 1000, naturalHeight: 500 };
  drawFocus(context, image, { x: 0, y: .2, width: .3, height: .4 });
  assert.deepEqual(calls.slice(0, 6).map(call => call[0]), ["drawImage", "fillRect", "save", "beginPath", "ellipse", "clip"]);
  assert.deepEqual(calls[1], ["fillRect", 0, 0, 1000, 500]);
  assert.deepEqual(calls[4].slice(1, 5), [150, 200, 150, 100]);
  assert.deepEqual(calls.slice(6, 8).map(call => call[0]), ["drawImage", "restore"]);
  const outline = calls.filter(call => call[0] === "ellipse")[1];
  assert.ok(outline[1] - outline[3] > 0);
  assert.equal(calls.filter(call => call[0] === "stroke").length, 2);
  assert.notEqual(stepPhotoKey("s1", "p"), stepPhotoKey("s2", "p"));
  calls.length = 0; drawFocus(context, image);
  assert.deepEqual(calls.map(call => call[0]), ["drawImage"]);
});

test("focus API validates requests and suggestions, preserves null, and handles provider errors", async (t) => {
  t.mock.method(console, "error", () => {});
  const { handleAI } = await bundleModule("src/lib/ai.ts");
  const originalFetch = globalThis.fetch, originalKey = process.env.FIREWORKS_API_KEY, originalModel = process.env.AI_MODEL;
  const input = { facts: { language: "en", title: "", notes: "", materials: [], noMaterials: false },
    steps: [{ id: "s", text: "Pick up the washer", photoIds: ["p"] }], photos: [{ id: "p", data: "data:image/jpeg;base64,/9j/2Q==" }] };
  const request = (body = input, headers = {}) => new Request("http://localhost/api/focus", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const focus = req => handleAI(req, "focus");
  try {
    assert.equal((await focus(request(input, { Origin: "https://other.example" }))).status, 403);
    assert.equal((await focus(request(input, { "Content-Length": "4000000" }))).status, 413);
    assert.equal((await focus(request({ ...input, steps: [{ ...input.steps[0], text: " " }] }))).status, 400);
    assert.equal((await focus(request({ ...input, photos: [...input.photos, { ...input.photos[0], id: "q" }] }))).status, 400);
    assert.equal((await focus(request({ ...input, photos: [{ id: "p", data: "data:image/jpeg;base64,AAAA" }] }))).status, 400);
    delete process.env.FIREWORKS_API_KEY;
    assert.equal((await focus(request())).status, 503);
    process.env.FIREWORKS_API_KEY = "test-key"; process.env.AI_MODEL = "test-vision-model";
    let output = { region: { x: .1, y: .2, width: .3, height: .4 } }, finishReason = "stop";
    globalThis.fetch = async (url, options) => {
      const sent = JSON.parse(options.body);
      assert.equal(sent.model, "test-vision-model");
      assert.equal(sent.response_format.json_schema.name, "focus");
      assert.match(sent.messages[0].content, /untrusted/);
      assert.match(sent.messages[0].content, /top-left/);
      assert.equal(sent.messages[1].content.filter(item => item.type === "image_url").length, 1);
      return Response.json({ choices: [{ finish_reason: finishReason, message: { content: JSON.stringify(output) } }] });
    };
    const success = await focus(request()); assert.equal(success.status, 200); assert.deepEqual(await success.json(), output);
    output = { region: null }; assert.deepEqual(await (await focus(request())).json(), output);
    output = { region: { x: .9, y: .1, width: .2, height: .2 } }; assert.equal((await focus(request())).status, 502);
    output = { region: null }; finishReason = "length"; assert.equal((await focus(request())).status, 502);
    globalThis.fetch = async () => new Response(null, { status: 401 }); assert.equal((await focus(request())).status, 503);
    globalThis.fetch = async () => { throw new Error("offline"); }; assert.equal((await focus(request())).status, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.FIREWORKS_API_KEY; else process.env.FIREWORKS_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = originalModel;
  }
});
