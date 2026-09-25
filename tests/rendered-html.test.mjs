import assert from "node:assert/strict";
import test from "node:test";

test("the production worker serves the AirDraw studio", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("https://airdraw.example/", {
      headers: {
        accept: "text/html",
        host: "airdraw.example",
        "x-forwarded-host": "airdraw.example",
      },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>AirDraw — Make a mark in the air<\/title>/);
  assert.match(html, /Make a mark/);
  assert.match(html, /Your canvas is waiting/);
  assert.match(html, /Start drawing/);
  assert.match(html, /https:\/\/airdraw\.example\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Starter Project/);
});
