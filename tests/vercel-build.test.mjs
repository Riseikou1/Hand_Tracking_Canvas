import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("the Vercel build includes a page and local hand tracking assets", async () => {
  const root = new URL("../dist-vercel/", import.meta.url);
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /<title>AirDraw — Make a mark in the air<\/title>/);
  assert.match(html, /\/assets\/index-[\w-]+\.js/);
  assert.ok(
    (await stat(new URL("mediapipe/hand_landmarker.task", root))).size >
      1_000_000,
  );
  assert.ok(
    (await stat(new URL("mediapipe/vision_wasm_internal.wasm", root))).size >
      1_000_000,
  );
});
