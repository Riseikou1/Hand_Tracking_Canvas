import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const output = new URL("../dist/", import.meta.url);

test("the production bundle keeps app metadata and Vercel SPA routing", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");
  const vercel = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );

  assert.match(html, /<title>AirDraw — Make a mark in the air<\/title>/);
  assert.match(html, /name="description"/);
  assert.match(html, /property="og:image"/);
  assert.match(html, /name="twitter:card"/);
  assert.equal(vercel.outputDirectory, "dist");
  assert.equal(vercel.buildCommand, "npm run build");
  assert.ok(vercel.rewrites.some((rewrite) => rewrite.destination === "/index.html"));
});

test("the production output contains both app bundles and hand tracking assets", async () => {
  const html = await readFile(new URL("index.html", output), "utf8");
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((match) => match[1]);
  assert.ok(scripts.some((script) => script.startsWith("/assets/")));

  for (const path of [
    "mediapipe/hand_landmarker.task",
    "mediapipe/vision_wasm_internal.js",
    "mediapipe/vision_wasm_internal.wasm",
    "mediapipe/vision_wasm_nosimd_internal.js",
    "mediapipe/vision_wasm_nosimd_internal.wasm",
    "finger-count/1.png",
    "finger-count/6.png",
  ]) {
    assert.ok((await stat(new URL(path, output))).size > 0, `${path} is copied`);
  }
});
