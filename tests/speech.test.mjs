import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { appendTranscript, SPEECH_LIMITS } from "../src/lib/speech.ts";

test("dictation appends to current text without silently exceeding the field limit", () => {
  assert.equal(appendTranscript("Pack a kit.", " Add four screws. ", 100), "Pack a kit. Add four screws.");
  assert.equal(appendTranscript("Updated while recording.", "Next action.", 100, true), "Updated while recording.\nNext action.");
  assert.equal(appendTranscript("", "Vier Schrauben", 40), "Vier Schrauben");
  assert.equal(appendTranscript("", "Pack a kit.\nAdd screws.", 100), "Pack a kit. Add screws.");
  assert.throws(() => appendTranscript("Existing text", "new speech", 15), /length/);
  assert.throws(() => appendTranscript("Existing text", " ", 40), /empty/);
});

test("speech endpoint bounds audio, protects the key and validates ElevenLabs responses", async () => {
  const bundle = await build({ entryPoints: ["src/app/api/transcribe/route.ts"], bundle: true, write: false, platform: "node", format: "esm" });
  const { POST } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const originalFetch = globalThis.fetch; const originalKey = process.env.ELEVENLABS_API_KEY;
  const request = (language = "de", file = new File([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0])], "recording.webm", { type: "audio/webm;codecs=opus" })) => {
    const form = new FormData(); form.set("file", file); form.set("language", language);
    return new Request("http://localhost/api/transcribe", { method: "POST", body: form });
  };
  try {
    delete process.env.ELEVENLABS_API_KEY;
    assert.equal((await POST(request("fr"))).status, 400);
    assert.equal((await POST(request("de", new File(["not audio"], "bad.webm", { type: "audio/webm" })))).status, 400);
    assert.equal((await POST(new Request("http://localhost/api/transcribe", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body: new Uint8Array(SPEECH_LIMITS.requestBytes + 1) }))).status, 413);
    assert.equal((await POST(request())).status, 503);
    process.env.ELEVENLABS_API_KEY = "private-test-key";
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.elevenlabs.io/v1/speech-to-text");
      assert.equal(options.headers["xi-api-key"], "private-test-key");
      assert.equal(options.body.get("model_id"), "scribe_v2");
      assert.equal(options.body.get("language_code"), "de");
      assert.equal(options.body.get("tag_audio_events"), "false");
      assert.ok(options.body.get("file") instanceof File);
      return Response.json({ text: " Vier Schrauben einlegen. ", words: [] });
    };
    const success = await POST(request());
    assert.equal(success.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await success.json(), { text: "Vier Schrauben einlegen." });
    globalThis.fetch = async () => Response.json({ detail: { status: "missing_permissions" } }, { status: 401 });
    const unauthorized = await POST(request());
    assert.equal(unauthorized.status, 503); assert.deepEqual(await unauthorized.json(), { error: "configuration" });
    globalThis.fetch = async () => Response.json({ text: " " });
    assert.equal((await POST(request())).status, 502);
    globalThis.fetch = async () => { throw new Error("provider failure with private details"); };
    const failure = await POST(request());
    assert.equal(failure.status, 502); assert.deepEqual(await failure.json(), { error: "provider" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = originalKey;
  }
});
