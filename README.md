# AirDraw

AirDraw is a hand tracking drawing studio. Make marks with your index finger through a webcam, or draw directly with a mouse, trackpad, or touch screen. Choose colors, erase, undo, and save your work as a PNG.

The project includes a browser app and a desktop Python version.

## Run the browser app

**Requirements:** Node.js 22.13 or newer, npm, and a modern browser. A webcam is optional.

From the project root:

```bash
npm ci
npm run dev
```

Open the local address printed in the terminal. Select **Start drawing** to allow camera access, or **Use mouse or touch instead** to draw without a camera. Browser camera access requires HTTPS or `localhost`.

### Browser controls

| Action | Control |
| --- | --- |
| Draw | Raise one index finger, or drag on the canvas |
| Pause and select | Raise index and middle fingers; hover over a color or eraser at the top of the canvas |
| Change brush size | Use the size slider |
| Undo | Select **Undo** or press **Ctrl/Cmd + Z** |
| Clear | Select **Clear canvas** |
| Save | Select **Save as PNG** |
| Switch tools | Press **B** for brush or **E** for eraser |

Camera frames are processed in the browser and are not uploaded by AirDraw. The hand tracking model is loaded when you start the camera.

## Run the desktop app

**Requirements:** Python 3.12, a webcam, and a terminal.

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r desktop/requirements.txt
python desktop/Virtual_Painter.py
```

On Windows, use `.venv\Scripts\Activate.ps1` in PowerShell or `.venv\Scripts\activate.bat` in Command Prompt, and use `python` in place of `python3`.

### Desktop controls

| Action | Control |
| --- | --- |
| Draw | Raise one index finger |
| Select color or eraser | Raise index and middle fingers, then point at the top toolbar |
| Undo / clear / save | **U** / **C** / **S** |
| Change brush size | **+** / **-** |
| Toggle eraser | **E** |
| Select a color | **1** through **5** |
| Toggle help / quit | **H** / **Q** |

Saved images go to `~/Pictures/AirDraw` by default. Use `--camera 1` for a different camera or `--output /path/to/folder` for a different save location. Run `python desktop/Virtual_Painter.py --help` for all options.

## Project checks

```bash
npm run lint
npm test
```
