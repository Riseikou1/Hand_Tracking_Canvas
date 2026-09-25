"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

type Status = "off" | "loading" | "on" | "error";

function countRaisedFingers(landmarks: Array<{ x: number; y: number }>) {
  // Direct equivalent of the supplied OpenCV code's tipIds tests. MediaPipe
  // landmarks are normalized x/y values rather than pixel coordinates; their
  // ordering and direction are otherwise the same.
  let count = landmarks[4].x > landmarks[3].x ? 1 : 0;
  for (const tip of [8, 12, 16, 20]) {
    if (landmarks[tip].y < landmarks[tip - 2].y) count++;
  }
  return count;
}

export default function FingerCountPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<HandLandmarker | null>(null);
  const frameRef = useRef(0);
  const sessionRef = useRef(0);
  const [status, setStatus] = useState<Status>("off");
  const [count, setCount] = useState<number | null>(null);
  const [fps, setFps] = useState(0);
  const [message, setMessage] = useState("");

  const stop = () => {
    sessionRef.current++;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("off");
    setCount(null);
    setFps(0);
  };

  const start = async () => {
    if (streamRef.current || status === "loading") return;
    const session = ++sessionRef.current;
    setStatus("loading");
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (session !== sessionRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Camera preview is unavailable.");
      video.srcObject = stream;
      await video.play();
      const vision = await FilesetResolver.forVisionTasks("/mediapipe");
      const opts = { runningMode: "VIDEO" as const, numHands: 1, minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.6 };
      let detector: HandLandmarker;
      try { detector = await HandLandmarker.createFromOptions(vision, { ...opts, baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "GPU" } }); }
      catch { detector = await HandLandmarker.createFromOptions(vision, { ...opts, baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task", delegate: "CPU" } }); }
      if (session !== sessionRef.current) { detector.close(); return; }
      detectorRef.current = detector;
      setStatus("on");
      let lastTime = -1;
      let lastFpsTime = performance.now();
      let frames = 0;
      const track = () => {
        const current = videoRef.current;
        const active = detectorRef.current;
        if (!current || !active || !streamRef.current || session !== sessionRef.current) return;
        if (current.readyState >= 2 && current.currentTime !== lastTime) {
          lastTime = current.currentTime;
          const hands = active.detectForVideo(current, performance.now()).landmarks;
          const hand = hands[0];
          if (!hand || hand.length < 21) setCount(null);
          else setCount(countRaisedFingers(hand));
          frames++;
          const now = performance.now();
          if (now - lastFpsTime >= 500) { setFps(Math.round(frames * 1000 / (now - lastFpsTime))); frames = 0; lastFpsTime = now; }
        }
        frameRef.current = requestAnimationFrame(track);
      };
      frameRef.current = requestAnimationFrame(track);
    } catch (error) {
      if (session !== sessionRef.current) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      detectorRef.current?.close();
      detectorRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not start camera or hand tracking.");
    }
  };

  useEffect(() => () => {
    sessionRef.current++;
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    detectorRef.current?.close();
  }, []);

  const fingerName = count === null ? "Waiting for your hand" : count === 1 ? "One finger up" : `${count} fingers up`;
  return <main className="studio-shell">
    <header className="topbar">
      <Link className="brand" href="/" aria-label="AirDraw home"><span className="brand-logo" aria-hidden="true"/>airdraw<span className="brand-dot">.</span></Link>
      <nav className="topbar-center page-nav" aria-label="Main navigation"><Link href="/">Canvas</Link><Link className="current" href="/fingers">Finger count</Link></nav>
      <Link className="top-action nav-action" href="/">Open canvas <span>↗</span></Link>
    </header>
    <section className="intro fingers-intro"><div><p className="eyebrow">YOUR CREATIVE SPACE / 02</p><h1>Count on your <em>hands.</em></h1><p className="intro-copy">A little live experiment in hand tracking. Hold up a number and watch it appear.</p></div><div className="intro-badge"><span className="badge-orb"/> CAMERA PROCESSING IS LOCAL</div></section>
    <section className="finger-workspace">
      <div className="finger-main-card">
        <div className="canvas-top"><span><i className={`status-dot ${status === "on" ? "live" : ""}`}/>{status === "on" ? "TRACKING LIVE" : "LIVE FINGER COUNT"}</span><span>02 / HAND STUDY</span></div>
        <div className="finger-hero">
          <div className="finger-number-wrap"><div className="finger-number">{count ?? "—"}</div><span className="finger-caption">{fingerName}</span><div className="finger-bars" aria-label={count === null ? "No fingers detected" : `${count} fingers detected`}>{[0,1,2,3,4].map((n)=><i key={n} className={count !== null && n < count ? "raised" : ""}/>)}</div></div>
          <div className="live-preview"><video ref={videoRef} autoPlay muted playsInline/><div className="preview-chip"><i className={`camera-light ${status}`}/>{status === "on" ? "LIVE CAMERA" : status === "loading" ? "CONNECTING" : "CAMERA PREVIEW"}</div>{status !== "on" && <div className="preview-empty"><span>✳</span><b>Your hand, in a moment.</b><small>Start the camera and hold up a hand.</small></div>}</div>
          <div className="fps-pill"><span>PROCESSING SPEED</span><b>{status === "on" ? fps : "—"}<small> FPS</small></b></div>
        </div>
        <div className="canvas-bottom"><span>✦ &nbsp; ONE HAND, FIVE FINGERS</span><span>REAL-TIME TRACKING</span></div>
      </div>
      <aside className="finger-side-card"><div className="panel-heading"><span>02</span><h3>How many?</h3><p>Keep your hand in view, palm facing the camera. The count updates as you move.</p></div><button className="primary-button finger-start" onClick={status === "on" ? stop : start} disabled={status === "loading"}>{status === "on" ? "Stop camera" : status === "loading" ? "Starting camera…" : "Start camera"}<span>↗</span></button>{message && <p className="finger-error" role="alert">{message}</p>}<div className="finger-reference"><div className="control-label"><span>FINGER REFERENCES</span><b>0—5</b></div><div className="finger-thumbs">{[1,2,3,4,5,6].map((n)=><div className="finger-thumb" key={n}><Image src={`/finger-count/${n}.png`} alt={`${n - 1} fingers raised`} width={209} height={207}/><span>{n - 1}</span></div>)}</div></div><div className="panel-note"><span>✳</span><b>Made for the moment</b><p>Quick visual feedback, straight from the camera stream in this tab.</p></div></aside>
    </section>
    <footer className="footer"><span>DRAW FREELY. CREATE ANYTHING.</span><span>YOUR CAMERA STAYS ON YOUR DEVICE &nbsp; · &nbsp; 2026</span></footer>
  </main>;
}
