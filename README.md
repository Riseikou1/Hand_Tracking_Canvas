# AirDraw

A browser based drawing studio adapted from `Virtual_Painter.py`. The web app runs hand tracking in the browser; camera frames are not uploaded to the app. It also works with a mouse, trackpad, or touch screen.

## Web app

- **One index finger:** draw.
- **Index and middle fingers:** pause drawing. Hover over a swatch or eraser at the top of the canvas to select it.
- **Mouse or touch:** drag directly on the canvas.
- Adjust brush size, undo, clear, or export a white background PNG from the right panel.
- Keyboard shortcuts: **B** brush, **E** eraser, **Ctrl/Cmd + Z** undo.

The camera needs browser permission and a secure context (HTTPS or localhost). The first camera start loads the hand tracking model. The model and runtime files are served from this project.

### Run locally

Use Node.js 22.13 or newer:

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

### Deploy to Vercel

The repository also includes a static Vite build for Vercel. Import the GitHub repository and select the **Vite** preset with root directory `./`. The checked-in `vercel.json` sets the build command to `npm run build:vercel`, output directory to `dist-vercel`, and install command to `npm ci`. No environment variables are needed. The Cloudflare/Sites build remains available through `npm run build`.

## Desktop Python version

The updated desktop version is included in `desktop/`, alongside its `HandTrackingModule.py` helper. The original source also remains at `~/Documents/Languages/PYTHON/ComputerVision/Projects/Virtual_Painter.py`. It now has a consistent toolbar, undo, clear, brush sizing, keyboard color selection, graceful camera errors, and PNG export.

```bash
python3 -m pip install -r desktop/requirements.txt
cd desktop
python3 Virtual_Painter.py
```

The requirements pin MediaPipe to a release compatible with the desktop hand tracking helper. Use `--camera 1` to select another camera, or `--output /path/to/folder` to change the PNG destination. The default is `~/Pictures/AirDraw`.

In the desktop app, **one index finger** draws, **two fingers** select a color or eraser from the top bar. Press **U** undo, **C** clear, **S** save, **+/-** change size, **E** toggle eraser, **1–5** select colors, **H** toggle help, and **Q** quit.
