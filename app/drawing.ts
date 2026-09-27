export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; color: string; width: number; erase: boolean };
export const W = 1200;
export const H = 675;

type Rect = { left: number; top: number; width: number; height: number };

// Keep outside samples: the canvas clips the actual path, rather than projecting
// movement onto its border. This also preserves correct exit/re-entry geometry.
export function mapPointer(point: { clientX: number; clientY: number }, rect: Rect): Point | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = ((point.clientX - rect.left) / rect.width) * W;
  const y = ((point.clientY - rect.top) / rect.height) * H;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

export function mapHand(point: Point): Point | null {
  const mapped = { x: (1 - point.x) * W, y: point.y * H };
  return Number.isFinite(mapped.x) && Number.isFinite(mapped.y) ? mapped : null;
}

// A short, time-based filter calms stationary tracking without the old
// half-frame blend lag during fast movement. Reset it between gestures.
export function smoothHand(raw: Point, previous: Point | null, elapsedMs: number): Point {
  if (!previous) return raw;
  const dt = Math.max(1, elapsedMs);
  const speed = Math.hypot(raw.x - previous.x, raw.y - previous.y) / dt;
  const tau = speed > 1 ? 2 : 8;
  const alpha = 1 - Math.exp(-dt / tau);
  return { x: previous.x + (raw.x - previous.x) * alpha, y: previous.y + (raw.y - previous.y) * alpha };
}

export function appendPoint(stroke: Stroke, point: Point): boolean {
  const previous = stroke.points.at(-1);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
      (previous?.x === point.x && previous.y === point.y)) return false;
  stroke.points.push(point);
  return true;
}

export function pointerSamples(event: PointerEvent): PointerEvent[] {
  const samples = event.getCoalescedEvents?.() ?? [];
  // Some implementations return no samples; always include the dispatched endpoint.
  return [...samples, event];
}

// Render only the new suffix, including its connection to the previous sample.
// Coordinates remain independent of bitmap resolution and CSS aspect ratio.
export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, start = 0) {
  const points = stroke.points;
  if (start >= points.length) return;
  const sx = ctx.canvas.width / W;
  const sy = ctx.canvas.height / H;
  ctx.save();
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width * Math.min(sx, sy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (start === 0) {
    ctx.arc(points[0].x * sx, points[0].y * sy, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
  }
  const first = points[Math.max(0, start - 1)];
  ctx.moveTo(first.x * sx, first.y * sy);
  for (let i = Math.max(1, start); i < points.length; i++)
    ctx.lineTo(points[i].x * sx, points[i].y * sy);
  ctx.stroke();
  ctx.restore();
}
