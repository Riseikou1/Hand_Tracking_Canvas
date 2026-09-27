import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../app/drawing.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { W, H, mapPointer, mapHand, smoothHand, appendPoint, pointerSamples, paintStroke } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

function context(width = W, height = H) {
  const calls = [];
  const ctx = { canvas: { width, height }, calls };
  for (const name of ['save', 'restore', 'beginPath', 'arc', 'fill', 'moveTo', 'lineTo', 'stroke'])
    ctx[name] = (...args) => calls.push([name, ...args]);
  return ctx;
}
const stroke = (points, erase = false) => ({ points, erase, color: '#123456', width: 10 });

test('mapping uses the displayed rectangle at desktop and mobile sizes, including every border', () => {
  for (const rect of [{ left: 100, top: 200, width: 900, height: 500 }, { left: 14, top: 300, width: 347, height: 450 }]) {
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
      const mapped = mapPointer({ clientX: rect.left + u * rect.width, clientY: rect.top + v * rect.height }, rect);
      assert.deepEqual(mapped, { x: u * W, y: v * H });
    }
  }
});

test('outside movement is not clamped into artificial border strokes; invalid geometry is ignored', () => {
  const rect = { left: 0, top: 0, width: W, height: H };
  const outside = mapPointer({ clientX: -100, clientY: H + 50 }, rect);
  assert.equal(outside.x, -100);
  assert.ok(Math.abs(outside.y - (H + 50)) < 1e-9);
  assert.equal(mapPointer({ clientX: 0, clientY: 0 }, { ...rect, width: 0 }), null);
  assert.equal(mapPointer({ clientX: NaN, clientY: 0 }, rect), null);
});

test('hand mapping mirrors horizontal positions and retains valid top and outside input', () => {
  assert.deepEqual(mapHand({ x: 0, y: 0 }), { x: W, y: 0 });
  assert.deepEqual(mapHand({ x: 1, y: 1 }), { x: 0, y: H });
  assert.equal(mapHand({ x: Infinity, y: 0 }), null);
  assert.ok(mapHand({ x: -0.1, y: 0 }).x > W);
});

test('coalesced samples preserve order and include the release endpoint with a fallback', () => {
  const a = { clientX: 1 }, b = { clientX: 2 };
  const event = { clientX: 3, getCoalescedEvents: () => [a, b] };
  assert.deepEqual(pointerSamples(event), [a, b, event]);
  const fallback = { clientX: 4 };
  assert.deepEqual(pointerSamples(fallback), [fallback]);
});

test('stroke storage drops duplicate/nonfinite points without discarding short movements', () => {
  const s = stroke([{ x: 0, y: 0 }]);
  assert.equal(appendPoint(s, { x: 0, y: 0 }), false);
  assert.equal(appendPoint(s, { x: NaN, y: 0 }), false);
  assert.equal(appendPoint(s, { x: 0.001, y: 0 }), true);
  assert.equal(s.points.length, 2);
});

test('dots, connected suffixes, round joins, and eraser replay use identical geometry', () => {
  const points = [{ x: 0, y: 0 }, { x: 50, y: 25 }, { x: 100, y: 50 }];
  const ctx = context();
  paintStroke(ctx, stroke(points), 2);
  assert.deepEqual(ctx.calls.filter(c => ['moveTo', 'lineTo'].includes(c[0])), [['moveTo', 50, 25], ['lineTo', 100, 50]]);
  assert.equal(ctx.lineCap, 'round');
  assert.equal(ctx.lineJoin, 'round');
  const dot = context();
  paintStroke(dot, stroke([points[0]]));
  assert.deepEqual(dot.calls.find(c => c[0] === 'arc').slice(1, 4), [0, 0, 5]);
  const erased = context();
  paintStroke(erased, stroke(points, true));
  assert.equal(erased.globalCompositeOperation, 'destination-out');
  const ink = context();
  paintStroke(ink, stroke(points));
  assert.equal(ink.globalCompositeOperation, 'source-over');
  assert.deepEqual(erased.calls, ink.calls);
});

test('responsive bitmap mapping preserves edge coordinates and circular brushes at DPR 2', () => {
  const ctx = context(600, 900);
  paintStroke(ctx, stroke([{ x: W, y: H }]));
  assert.deepEqual(ctx.calls.find(c => c[0] === 'arc').slice(1, 4), [600, 900, 2.5]);
  const exportCtx = context(W * 2, H * 2);
  paintStroke(exportCtx, stroke([{ x: W, y: H }]));
  assert.deepEqual(exportCtx.calls.find(c => c[0] === 'arc').slice(1, 4), [W * 2, H * 2, 10]);
});

test('a long stroke paints only new samples per frame rather than replaying its history', () => {
  const s = stroke(Array.from({ length: 100000 }, (_, i) => ({ x: i, y: i % H })));
  const ctx = context();
  paintStroke(ctx, s, 99990);
  assert.equal(ctx.calls.filter(c => c[0] === 'lineTo').length, 10);
  assert.equal(ctx.calls.filter(c => c[0] === 'stroke').length, 1);
  const idle = context();
  paintStroke(idle, s, s.points.length);
  assert.equal(idle.calls.length, 0);
});

 test('hand filtering resets without stale bridges and follows fast motion with low delay', () => {
  const raw = { x: 100, y: 200 };
  assert.deepEqual(smoothHand(raw, null, 33), raw);
  const fast = smoothHand(raw, { x: 0, y: 0 }, 16);
  assert.ok(Math.abs(fast.x - raw.x) < 0.1);
  const still = smoothHand({ x: 1, y: 0 }, { x: 0, y: 0 }, 8);
  assert.ok(still.x > 0 && still.x < 1);
  const once = smoothHand({ x: 1, y: 0 }, { x: 0, y: 0 }, 16);
  const twice = smoothHand({ x: 1, y: 0 }, still, 8);
  assert.ok(Math.abs(once.x - twice.x) < 1e-9);
});
