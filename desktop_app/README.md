# MacroTracker Desktop (macOS & Windows)

Dedicated desktop application packages for macOS and Windows.

## Quick Option 1: Native Python Desktop Launcher (Zero Dependencies)
Run directly with standard Python 3:
```bash
python3 desktop_launcher.py
```
This boots the local server and opens your native desktop browser window configured to `http://localhost:8000`.

## Option 2: Electron Desktop App Window
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run Electron:
   ```bash
   npm start
   ```
3. Build standalone `.app` / `.exe` installer:
   ```bash
   npm run dist
   ```
