"""AirDraw desktop studio — webcam painting with hand gestures and keyboard controls.

Run: python Virtual_Painter.py [--camera 0] [--width 1280] [--height 720]
One index finger draws; index + middle selects a tool in the top bar.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

import HandTrackingModule as htm


COLORS = [
    ("CORAL", (87, 111, 239)),
    ("BLUE", (200, 133, 99)),
    ("SAGE", (121, 155, 110)),
    ("OCHRE", (85, 174, 226)),
    ("INK", (47, 54, 38)),
]
TOOLBAR_HEIGHT = 94
WINDOW = "AirDraw Studio"


@dataclass
class Stroke:
    color: tuple[int, int, int]
    width: int
    erase: bool = False
    points: list[tuple[int, int]] = field(default_factory=list)


def draw_strokes(canvas: np.ndarray, strokes: list[Stroke]) -> None:
    """Rebuild the transparent canvas so undo and erasing work consistently."""
    canvas.fill(0)
    for stroke in strokes:
        rgba = (0, 0, 0, 0) if stroke.erase else (*stroke.color, 255)
        if len(stroke.points) == 1:
            cv2.circle(canvas, stroke.points[0], max(1, stroke.width // 2), rgba, -1, cv2.LINE_AA)
        else:
            for start, end in zip(stroke.points, stroke.points[1:]):
                cv2.line(canvas, start, end, rgba, stroke.width, cv2.LINE_AA)


def save_png(canvas: np.ndarray, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"airdraw-{datetime.now():%Y%m%d-%H%M%S-%f}.png"
    white = np.full(canvas.shape[:2] + (3,), 255, dtype=np.uint8)
    alpha = canvas[:, :, 3:4].astype(np.float32) / 255.0
    image = (white * (1 - alpha) + canvas[:, :, :3] * alpha).astype(np.uint8)
    if not cv2.imwrite(str(path), image):
        raise OSError(f"Could not save {path}")
    return path


def draw_toolbar(frame: np.ndarray, active: int, erase: bool, size: int, status: str) -> list[tuple[int, int]]:
    height, width = frame.shape[:2]
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (width, TOOLBAR_HEIGHT), (28, 40, 32), -1)
    cv2.addWeighted(overlay, 0.93, frame, 0.07, 0, frame)
    cv2.putText(frame, "* AIRDRAW", (22, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, "DRAW IN THE AIR", (24, 62), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (169, 200, 170), 1, cv2.LINE_AA)
    left, right = max(200, int(width * 0.24)), max(300, width - 145)
    step = max(42, (right - left) // 6)
    centers = []
    for index, (name, color) in enumerate(COLORS):
        x = left + index * step + step // 2
        centers.append((x - step // 2, x + step // 2))
        cv2.circle(frame, (x, 38), 18, color, -1, cv2.LINE_AA)
        if index == active and not erase:
            cv2.circle(frame, (x, 38), 23, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(frame, name, (x - 18, 76), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (225, 232, 225), 1, cv2.LINE_AA)
    x = left + 5 * step + step // 2
    centers.append((x - step // 2, x + step // 2))
    cv2.rectangle(frame, (x - 17, 21), (x + 17, 55), (90, 104, 93), -1, cv2.LINE_AA)
    if erase:
        cv2.rectangle(frame, (x - 22, 16), (x + 22, 60), (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, "ERASE", (x - 19, 76), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (225, 232, 225), 1, cv2.LINE_AA)
    cv2.putText(frame, f"{size}px", (width - 92, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(frame, status, (width - 130, 66), cv2.FONT_HERSHEY_SIMPLEX, 0.34, (171, 200, 172), 1, cv2.LINE_AA)
    return centers


def main() -> None:
    parser = argparse.ArgumentParser(description="AirDraw desktop hand tracking painter")
    parser.add_argument("--camera", type=int, default=0, help="Camera index (default: 0)")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--height", type=int, default=720)
    parser.add_argument("--output", type=Path, default=Path.home() / "Pictures" / "AirDraw")
    args = parser.parse_args()
    if args.width < 960 or args.height < 360:
        parser.error("Use at least 960x360 so the toolbar and drawing area remain usable.")

    capture = cv2.VideoCapture(args.camera)
    if not capture.isOpened():
        parser.error(f"Cannot open camera {args.camera}. Check its connection and permissions.")
    capture.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
    capture.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
    detector = htm.handDetector(max_num_hands=1, detection_confidence=0.65, tracking_confidence=0.65)
    canvas = np.zeros((args.height, args.width, 4), dtype=np.uint8)
    strokes: list[Stroke] = []
    active: Stroke | None = None
    smooth: tuple[float, float] | None = None
    color_index, erasing, brush_size = 0, False, 12
    help_visible = True
    notice, notice_until = "", 0
    try:
        cv2.namedWindow(WINDOW, cv2.WINDOW_NORMAL)
        while True:
            success, frame = capture.read()
            if not success:
                print("Camera stopped sending frames. Closing AirDraw safely.")
                break
            frame = cv2.flip(cv2.resize(frame, (args.width, args.height)), 1)
            frame = detector.findHands(frame, draw=False)
            landmarks = detector.findPosition(frame, handNo=0, draw=False)
            status = "SHOW HAND"
            if len(landmarks) >= 21:
                fingers = detector.fingersUp()
                x, y = landmarks[8][1:]
                smooth = (x, y) if smooth is None else (smooth[0] * 0.55 + x * 0.45, smooth[1] * 0.55 + y * 0.45)
                point = (int(smooth[0]), int(smooth[1]))
                if fingers[1] and fingers[2]:
                    active = None
                    status = "SELECT"
                    if y < TOOLBAR_HEIGHT:
                        left, right = max(200, int(args.width * 0.24)), max(300, args.width - 145)
                        step = max(42, (right - left) // 6)
                        slot = (x - left) // step
                        if 0 <= slot < 5:
                            color_index, erasing = int(slot), False
                        elif slot == 5:
                            erasing = True
                elif fingers[1] and not fingers[2] and y > TOOLBAR_HEIGHT:
                    status = "ERASING" if erasing else "DRAWING"
                    if active is None:
                        active = Stroke(COLORS[color_index][1], brush_size * 4 if erasing else brush_size, erasing)
                        strokes.append(active)
                    active.points.append(point)
                    if len(active.points) == 1:
                        cv2.circle(canvas, point, active.width // 2, (0, 0, 0, 0) if erasing else (*active.color, 255), -1, cv2.LINE_AA)
                    else:
                        cv2.line(canvas, active.points[-2], point, (0, 0, 0, 0) if erasing else (*active.color, 255), active.width, cv2.LINE_AA)
                else:
                    active = None
                cv2.circle(frame, point, 10 if status == "SELECT" else 7, (95, 132, 240), 2, cv2.LINE_AA)
            else:
                active = None
                smooth = None

            alpha = canvas[:, :, 3:4].astype(np.float32) / 255.0
            frame = (frame * (1 - alpha) + canvas[:, :, :3] * alpha).astype(np.uint8)
            draw_toolbar(frame, color_index, erasing, brush_size, status)
            if help_visible:
                cv2.rectangle(frame, (12, args.height - 49), (min(args.width - 12, 730), args.height - 9), (31, 44, 35), -1)
                cv2.putText(frame, "1 FINGER draw  |  2 FINGERS select  |  U undo  |  C clear  |  S save  |  +/- size  |  H help  |  Q quit", (22, args.height - 24), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (240, 245, 239), 1, cv2.LINE_AA)
            if notice and cv2.getTickCount() < notice_until:
                cv2.putText(frame, notice, (25, TOOLBAR_HEIGHT + 38), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.imshow(WINDOW, frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord("u") and strokes:
                strokes.pop(); active = None; draw_strokes(canvas, strokes)
                notice = "Last stroke undone"
            elif key == ord("c"):
                strokes.clear(); active = None; canvas.fill(0)
                notice = "Canvas cleared"
            elif key == ord("s"):
                try:
                    path = save_png(canvas, args.output)
                    notice = f"Saved: {path.name}"
                    print(f"Saved {path}")
                except OSError as exc:
                    notice = "Could not save image"
                    print(exc)
            elif key in (ord("+"), ord("=")):
                brush_size = min(50, brush_size + 2)
            elif key == ord("-"):
                brush_size = max(2, brush_size - 2)
            elif key == ord("e"):
                erasing = not erasing; active = None
            elif key == ord("h"):
                help_visible = not help_visible
            elif ord("1") <= key <= ord("5"):
                color_index = key - ord("1"); erasing = False; active = None
            if key != 255:
                notice_until = cv2.getTickCount() + int(cv2.getTickFrequency() * 2)
    finally:
        capture.release()
        cv2.destroyAllWindows()
        detector.hands.close()


if __name__ == "__main__":
    main()
