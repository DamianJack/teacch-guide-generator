import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import manifest from "../src/app/manifest.ts";
import { GET, runtime } from "../src/app/api/health/route.ts";

test("health endpoint uses Node.js and returns an uncached success response", async () => {
  const response = GET();
  assert.equal(runtime, "nodejs");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("PWA manifest starts at the app shell and references real install icons", () => {
  const appManifest = manifest();
  assert.equal(appManifest.start_url, "/");
  assert.equal(appManifest.display, "standalone");
  for (const size of ["192x192", "512x512"]) {
    assert.ok(appManifest.icons.some((icon) => icon.sizes === size));
  }
  for (const icon of appManifest.icons) {
    assert.ok(existsSync(new URL(`../public${icon.src}`, import.meta.url)), icon.src);
  }
});
