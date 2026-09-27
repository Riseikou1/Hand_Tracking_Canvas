"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

import { W, H, appendPoint, mapPointer, mapHand, smoothHand, paintStroke, pointerSamples, type Point, type Stroke } from "./drawing";
type Tool = "brush" | "eraser";
type CameraState = "off" | "loading" | "on" | "error";

const colors = [
  { name: "Coral", value: "#ef6f57" },
  { name: "Blue", value: "#6385c8" },
  { name: "Sage", value: "#6e9b79" },
  { name: "Ochre", value: "#e2ae55" },
  { name: "Ink", value: "#26362f" },
];
const model = "/mediapipe/hand_landmarker.task";

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<HandLandmarker | null>(null);
  const frameRef = useRef<number>(0);
  const cameraSessionRef = useRef(0);
  const cameraStartingRef = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const activeRef = useRef<Stroke | null>(null);
  const handPointRef = useRef<Point | null>(null);
  const handTimeRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const paintFrameRef = useRef(0);
  const paintedRef = useRef(0);
  const lastSelectRef = useRef(0);
  const modeRef = useRef<"pointer" | "hand" | null>(null);
  const settingsRef = useRef({
    tool: "brush" as Tool,
    color: colors[0].value,
    size: 10,
  });
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState(colors[0].value);
  const [size, setSize] = useState(10);
  const [camera, setCamera] = useState<CameraState>("off");
  const [gesture, setGesture] = useState("Camera off");
  const [strokeCount, setStrokeCount] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    settingsRef.current = { tool, color, size };
  }, [tool, color, size]);

  const render = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (const stroke of strokesRef.current) {
      paintStroke(ctx, stroke);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      render();
      paintedRef.current = activeRef.current?.points.length ?? 0;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    resize();
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [render]);

  const flushPaint = useCallback(() => {
    cancelAnimationFrame(paintFrameRef.current);
    paintFrameRef.current = 0;
    const ctx = canvasRef.current?.getContext("2d");
    const stroke = activeRef.current;
    if (ctx && stroke) {
      paintStroke(ctx, stroke, paintedRef.current);
      paintedRef.current = stroke.points.length;
    }
  }, []);

  const finishStroke = useCallback(() => {
    flushPaint();
    pointerIdRef.current = null;
    if (activeRef.current) {
      activeRef.current = null;
      modeRef.current = null;
      setStrokeCount(strokesRef.current.length);
    }
  }, [flushPaint]);
  const finishHandStroke = useCallback(() => {
    if (modeRef.current === "hand") finishStroke();
    handPointRef.current = null;
  }, [finishStroke]);

  const beginStroke = useCallback((point: Point, input: "pointer" | "hand") => {
    if (activeRef.current && modeRef.current !== input) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    if (!activeRef.current) {
      const settings = settingsRef.current;
      const stroke = {
        points: [point],
        color: settings.color,
        width: settings.tool === "eraser" ? settings.size * 4 : settings.size,
        erase: settings.tool === "eraser",
      };
      activeRef.current = stroke;
      modeRef.current = input;
      strokesRef.current.push(stroke);
      setStrokeCount(strokesRef.current.length);
      setShowHint(false);
      paintedRef.current = 0;
    } else {
      appendPoint(activeRef.current, point);
    }
    if (!paintFrameRef.current)
      paintFrameRef.current = requestAnimationFrame(flushPaint);
  }, [flushPaint]);

  const addPointerSamples = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    for (const sample of pointerSamples(event.nativeEvent)) {
      const point = mapPointer(sample, rect);
      if (point) beginStroke(point, "pointer");
    }
  };

  const chooseColor = (value: string) => {
    finishStroke();
    settingsRef.current = { ...settingsRef.current, color: value, tool: "brush" };
    setColor(value);
    setTool("brush");
  };
  const chooseTool = (value: Tool) => {
    finishStroke();
    settingsRef.current = { ...settingsRef.current, tool: value };
    setTool(value);
  };

  const stopCamera = useCallback(() => {
    cameraSessionRef.current += 1;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const cursor = document.getElementById("hand-cursor");
    if (cursor) cursor.style.opacity = "0";
    finishHandStroke();
    setCamera("off");
    setGesture("Camera off");
  }, [finishHandStroke]);

  const startCamera = async () => {
    if (cameraStartingRef.current || streamRef.current) return;
    cameraStartingRef.current = true;
    const session = ++cameraSessionRef.current;
    setMessage("");
    setCamera("loading");
    setGesture("Starting camera…");
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("This browser cannot access a camera.");
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (session !== cameraSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      video.srcObject = stream;
      await video.play();
      const vision = await FilesetResolver.forVisionTasks("/mediapipe");
      if (session !== cameraSessionRef.current) return;
      const options = {
        runningMode: "VIDEO" as const,
        numHands: 1,
        minHandDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      };
      let detector: HandLandmarker;
      let activeDelegate: "GPU" | "CPU" = "GPU";
      try {
        detector = await HandLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: model, delegate: "GPU" },
        });
      } catch {
        activeDelegate = "CPU";
        detector = await HandLandmarker.createFromOptions(vision, {
          ...options,
          baseOptions: { modelAssetPath: model, delegate: "CPU" },
        });
      }
      if (session !== cameraSessionRef.current) {
        detector.close();
        return;
      }
      detectorRef.current = detector;
      setCamera("on");
      setShowHint(false);
      setGesture("Show your hand");
      let previousVideoTime = -1;
      const stopTracking = (error: unknown) => {
        console.error("AirDraw hand tracking stopped.", error);
        stopCamera();
        setCamera("error");
        setGesture("Tracking stopped");
        setMessage(
          "Hand tracking could not process the camera feed. Restart the camera, check camera permissions, or use mouse or touch drawing.",
        );
      };
      const track = () => {
        const currentVideo = videoRef.current;
        const landmarker = detectorRef.current;
        if (!currentVideo || !landmarker || !streamRef.current) return;
        if (
          currentVideo.readyState >= 2 &&
          currentVideo.currentTime !== previousVideoTime
        ) {
          previousVideoTime = currentVideo.currentTime;
          let result: ReturnType<HandLandmarker["detectForVideo"]>;
          try {
            result = landmarker.detectForVideo(currentVideo, performance.now());
          } catch (trackingError) {
            if (activeDelegate === "GPU") {
              console.warn("AirDraw GPU hand tracking failed; retrying on CPU.", trackingError);
              landmarker.close();
              detectorRef.current = null;
              setGesture("Switching to compatibility tracking…");
              void HandLandmarker.createFromOptions(vision, {
                  ...options,
                  baseOptions: { modelAssetPath: model, delegate: "CPU" },
                }).then((cpuDetector) => {
                if (session !== cameraSessionRef.current) {
                  cpuDetector.close();
                  return;
                }
                activeDelegate = "CPU";
                detectorRef.current = cpuDetector;
                setGesture("Tracking ready · show your hand");
                frameRef.current = requestAnimationFrame(track);
                }).catch((recoveryError: unknown) => {
                  if (session === cameraSessionRef.current) stopTracking(recoveryError);
                });
              return;
            }
            stopTracking(trackingError);
            return;
          }
          const hand = result.landmarks[0];
          if (hand) {
            const index = hand[8];
            const middle = hand[12];
            const indexUp = index.y < hand[6].y - 0.025;
            const middleUp = middle.y < hand[10].y - 0.025;
            const raw = mapHand(index);
            if (!raw) { finishHandStroke(); frameRef.current = requestAnimationFrame(track); return; }
            const now = performance.now();
            const point = smoothHand(raw, handPointRef.current, now - handTimeRef.current);
            handPointRef.current = point;
            handTimeRef.current = now;
            const stage = canvasRef.current?.getBoundingClientRect();
            const px = stage ? stage.left + (point.x / W) * stage.width : 0;
            const py = stage ? stage.top + (point.y / H) * stage.height : 0;
            const palette = document.querySelector(".gesture-palette")?.getBoundingClientRect();
            const overPalette = !!stage && !!palette && px >= palette.left && px <= palette.right && py >= palette.top && py <= palette.bottom;
            const cursor = document.getElementById("hand-cursor");
            if (cursor) {
              cursor.style.left = (point.x / W) * 100 + "%";
              cursor.style.top = (point.y / H) * 100 + "%";
              cursor.style.opacity = "1";
            }
            if (indexUp && middleUp) {
              finishHandStroke();
              setGesture("Select mode · hover over a color");
              if (
                overPalette &&
                performance.now() - lastSelectRef.current > 650
              ) {
                if (stage) {
                  const buttons = document.querySelectorAll<HTMLButtonElement>(
                    ".gesture-palette button",
                  );
                  for (const button of buttons) {
                    const rect = button.getBoundingClientRect();
                    if (
                      px >= rect.left &&
                      px <= rect.right &&
                      py >= rect.top &&
                      py <= rect.bottom
                    ) {
                      button.click();
                      lastSelectRef.current = performance.now();
                      break;
                    }
                  }
                }
              }
            } else if (indexUp && !middleUp) {
              setGesture("Drawing · index finger");
              if (!overPalette) beginStroke(point, "hand");
              else finishHandStroke();
            } else {
              finishHandStroke();
              setGesture("Raise one finger to draw");
            }
          } else {
            const cursor = document.getElementById("hand-cursor");
            if (cursor) cursor.style.opacity = "0";
            finishHandStroke();
            setGesture("Show your hand");
          }
        }
        frameRef.current = requestAnimationFrame(track);
      };
      frameRef.current = requestAnimationFrame(track);
    } catch (error) {
      if (session !== cameraSessionRef.current) return;
      stream?.getTracks().forEach((track) => track.stop());
      detectorRef.current?.close();
      detectorRef.current = null;
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCamera("error");
      setGesture("Camera unavailable");
      setMessage(
        error instanceof Error
          ? error.message
          : "Camera or hand tracking could not start. You can still draw with your mouse or touch.",
      );
    } finally {
      cameraStartingRef.current = false;
    }
  };

  const undo = () => {
    finishStroke();
    strokesRef.current.pop();
    setStrokeCount(strokesRef.current.length);
    render();
  };
  const clear = () => {
    finishStroke();
    strokesRef.current = [];
    setStrokeCount(0);
    render();
  };
  const download = () => {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = W * 2;
    exportCanvas.height = H * 2;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx || !canvasRef.current) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    flushPaint();
    // Replay vectors at export resolution instead of upscaling the display bitmap.
    const ink = document.createElement("canvas");
    ink.width = W * 2;
    ink.height = H * 2;
    const inkCtx = ink.getContext("2d");
    if (!inkCtx) return;
    for (const stroke of strokesRef.current) paintStroke(inkCtx, stroke);
    ctx.drawImage(ink, 0, 0);
    const link = document.createElement("a");
    link.download = "airdraw-creation.png";
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (typing) return;
      if (meta && key === "z") {
        event.preventDefault();
        undo();
      }
      if (event.key === "Escape") setShowGuide(false);
      if (meta) return;
      if (key === "u") undo();
      if (key === "c") clear();
      if (key === "s") download();
      if (key === "e") chooseTool("eraser");
      if (key === "b") chooseTool("brush");
      if (key === "+" || key === "=") {
        const value = Math.min(35, settingsRef.current.size + 1);
        settingsRef.current = { ...settingsRef.current, size: value };
        setSize(value);
      }
      if (key === "-") {
        const value = Math.max(3, settingsRef.current.size - 1);
        settingsRef.current = { ...settingsRef.current, size: value };
        setSize(value);
      }
      if (/^[1-5]$/.test(key)) chooseColor(colors[Number(key) - 1].value);
      if (key === "h") setShowGuide((visible) => !visible);
      if (key === "q") stopCamera();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(
    () => () => {
      cameraSessionRef.current += 1;
      cancelAnimationFrame(frameRef.current);
      cancelAnimationFrame(paintFrameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      detectorRef.current?.close();
    },
    [],
  );

  return (
    <main className="studio-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="AirDraw home">
          <span className="brand-logo" aria-hidden="true" />airdraw
          <span className="brand-dot">.</span>
        </a>
        <nav className="topbar-center page-nav" aria-label="Main navigation"><a className="current" href="/">Canvas</a><a href="/fingers">Finger count</a></nav>
        <button className="top-action" onClick={() => setShowGuide(true)}>
          How it works <span>↗</span>
        </button>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">YOUR CREATIVE SPACE / 01</p>
          <h1>
            Make a mark <em>in the air.</em>
          </h1>
          <p className="intro-copy">
            Draw with your hands, right in your browser. Turn on your camera and
            let the ideas flow.
          </p>
        </div>
        <div className="intro-badge">
          <span className="badge-orb" /> READY WHEN YOU ARE
        </div>
      </section>
      <section className="workspace">
        <aside className="rail" aria-label="Drawing tools">
          <span className="rail-label">TOOLS</span>
          <button
            title="Brush (B)"
            aria-label="Brush"
            aria-pressed={tool === "brush"}
            onClick={() => chooseTool("brush")}
            className={"tool " + (tool === "brush" ? "selected" : "")}
          >
            ✎
          </button>
          <button
            title="Eraser (E)"
            aria-label="Eraser"
            aria-pressed={tool === "eraser"}
            onClick={() => chooseTool("eraser")}
            className={"tool " + (tool === "eraser" ? "selected" : "")}
          >
            ▱
          </button>
          <span className="rail-divider" />
          {colors.map((item) => (
            <button
              key={item.value}
              title={item.name}
              aria-label={item.name}
              aria-pressed={color === item.value && tool === "brush"}
              className={
                "swatch " +
                (color === item.value && tool === "brush" ? "active" : "")
              }
              style={{ background: item.value }}
              onClick={() => chooseColor(item.value)}
            />
          ))}
        </aside>
        <div className="canvas-card">
          <div className="canvas-top">
            <span>
              <i className={"status-dot " + (camera === "on" ? "live" : "")} />{" "}
              {camera === "on" ? "CAMERA CONNECTED" : "LIVE CANVAS"}
            </span>
            <span>01 / UNTITLED CANVAS</span>
          </div>
          <div className="canvas-stage">
            <div className="gesture-palette">
              <span>SELECT</span>
              {colors.map((item) => (
                <button
                  key={item.value}
                  title={item.name}
                  aria-label={"Select " + item.name}
                  style={{ background: item.value }}
                  onClick={() => chooseColor(item.value)}
                />
              ))}
              <button
                title="Eraser"
                aria-label="Select eraser"
                className="gesture-eraser"
                onClick={() => chooseTool("eraser")}
              >
                ⌫
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={W}
              height={H}
              className="drawing-canvas"
              aria-label="Drawing canvas. Drag to draw."
              onPointerDown={(event) => {
                if (event.button !== 0 || pointerIdRef.current !== null || modeRef.current === "hand") return;
                const point = mapPointer(event, event.currentTarget.getBoundingClientRect());
                if (!point) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                pointerIdRef.current = event.pointerId;
                beginStroke(point, "pointer");
              }}
              onPointerMove={addPointerSamples}
              onPointerUp={(event) => {
                if (pointerIdRef.current !== event.pointerId) return;
                addPointerSamples(event);
                finishStroke();
              }}
              onPointerCancel={(event) => {
                if (pointerIdRef.current === event.pointerId) finishStroke();
              }}
              onLostPointerCapture={(event) => {
                if (pointerIdRef.current === event.pointerId) finishStroke();
              }}
            />
            <div id="hand-cursor" className="hand-cursor" />
            {showHint && (
              <div className="canvas-placeholder">
                <div className="canvas-spark">✳</div>
                <h2>Your canvas is waiting.</h2>
                <p>
                  Start your camera to draw with gestures
                  <br />
                  or use your mouse to try it out.
                </p>
                <button
                  className="primary-button"
                  disabled={camera === "loading"}
                  onClick={
                    camera === "on" ? () => setShowHint(false) : startCamera
                  }
                >
                  {camera === "loading"
                    ? "Starting camera…"
                    : camera === "on"
                      ? "Let's draw"
                      : "Start drawing"}{" "}
                  <span>↗</span>
                </button>
                <button
                  className="quiet-link"
                  onClick={() => setShowHint(false)}
                >
                  Use mouse or touch instead
                </button>
              </div>
            )}
          </div>
          <div className="canvas-bottom">
            <span>✦ &nbsp; YOUR IDEAS, UNLIMITED</span>
            <span>
              {strokeCount} STROKE{strokeCount === 1 ? "" : "S"} ON CANVAS
            </span>
          </div>
        </div>
        <aside className="side-panel">
          <div className="panel-heading">
            <span>01</span>
            <h3>Make it yours</h3>
            <p>Everything you need to get into the flow.</p>
          </div>
          <div className="control-block">
            <div className="control-label">
              <span>BRUSH SIZE</span>
              <b>{size}px</b>
            </div>
            <input
              aria-label="Brush size"
              type="range"
              min="3"
              max="35"
              value={size}
              onChange={(event) => {
                const value = Number(event.target.value);
                settingsRef.current = { ...settingsRef.current, size: value };
                setSize(value);
              }}
            />
            <div className="range-labels">
              <span>FINE</span>
              <span>BOLD</span>
            </div>
          </div>
          <div className="actions">
            <button onClick={undo} disabled={!strokeCount}>
              ↶ <span>Undo</span>
              <small>⌘ Z</small>
            </button>
            <button onClick={clear} disabled={!strokeCount}>
              ✕ <span>Clear canvas</span>
            </button>
            <button onClick={download}>
              ↧ <span>Save as PNG</span>
            </button>
          </div>
          <div className="camera-control">
            <div className="camera-copy">
              <span className={"camera-light " + camera} />
              <b>
                {camera === "on"
                  ? "Camera is on"
                  : camera === "loading"
                    ? "Connecting…"
                    : "Camera is off"}
              </b>
            </div>
            <button
              onClick={camera === "on" ? stopCamera : startCamera}
              disabled={camera === "loading"}
            >
              {camera === "on"
                ? "Stop"
                : camera === "loading"
                  ? "Wait"
                  : "Start"}
            </button>
          </div>
          <div className="video-preview">
            <video ref={videoRef} autoPlay muted playsInline />
            <div>{gesture}</div>
          </div>
          <div className="panel-note">
            <span>✳</span>
            <b>Gesture guide</b>
            <p>
              One finger draws. Two fingers pause and select a color from the
              top of the canvas.
            </p>
          </div>
        </aside>
      </section>
      {message && (
        <div className="toast" role="alert">
          {message}
          <button onClick={() => setMessage("")} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}
      <footer className="footer">
        <span>DRAW FREELY. CREATE ANYTHING.</span>
        <span>YOUR CAMERA STAYS ON YOUR DEVICE &nbsp; · &nbsp; 2026</span>
      </footer>
      {showGuide && (
        <div className="modal-backdrop">
          <button
            className="modal-scrim"
            aria-label="Close guide"
            onClick={() => setShowGuide(false)}
          />
          <div
            className="guide-modal"
            role="dialog"
            aria-modal="true"
            aria-label="How it works"
          >
            <button
              className="modal-close"
              aria-label="Close guide"
              onClick={() => setShowGuide(false)}
            >
              ×
            </button>
            <p className="eyebrow">THE QUICK GUIDE / 01</p>
            <h2>
              Creativity is <em>at your fingertips.</em>
            </h2>
            <div className="guide-steps">
              <div>
                <span>01</span>
                <b>One finger, draw</b>
                <p>
                  Raise your index finger and move your hand to make a mark.
                </p>
              </div>
              <div>
                <span>02</span>
                <b>Two fingers, select</b>
                <p>
                  Raise index and middle fingers. Hover over a color or eraser
                  at the top.
                </p>
              </div>
              <div>
                <span>03</span>
                <b>Make it yours</b>
                <p>
                  Adjust your brush, undo a stroke, or download a crisp PNG.
                </p>
              </div>
            </div>
            <section className="shortcut-section" aria-labelledby="shortcut-heading">
              <h3 id="shortcut-heading">Desktop controls</h3>
              <div className="shortcut-table-wrap">
                <table className="shortcut-table">
                  <thead><tr><th>Action</th><th>Control</th></tr></thead>
                  <tbody>
                    <tr><td>Draw</td><td>Raise one index finger</td></tr>
                    <tr><td>Select color or eraser</td><td>Raise index and middle fingers, then point at the top toolbar</td></tr>
                    <tr><td>Undo / clear / save</td><td><kbd>U</kbd> / <kbd>C</kbd> / <kbd>S</kbd></td></tr>
                    <tr><td>Change brush size</td><td><kbd>+</kbd> / <kbd>−</kbd></td></tr>
                    <tr><td>Toggle eraser</td><td><kbd>E</kbd></td></tr>
                    <tr><td>Select a color</td><td><kbd>1</kbd> through <kbd>5</kbd></td></tr>
                    <tr><td>Toggle help / stop camera</td><td><kbd>H</kbd> / <kbd>Q</kbd></td></tr>
                  </tbody>
                </table>
              </div>
            </section>
            <p className="guide-footnote">
              Select <b>Start drawing</b> to let your browser ask for camera access. Camera access works on HTTPS or localhost. If you blocked it earlier, change this site’s camera permission in your browser settings. No camera? Use your mouse, trackpad, or touch screen.
            </p>
            <button
              className="primary-button"
              onClick={() => setShowGuide(false)}
            >
              Got it ↗
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
