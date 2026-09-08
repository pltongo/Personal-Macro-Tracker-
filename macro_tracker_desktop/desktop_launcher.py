#!/usr/bin/env python3
"""
Zero-dependency desktop launcher for macOS, Windows, and Linux.
Launches the background server and opens the application in a dedicated window.
"""
import sys
import os
import subprocess
import webbrowser
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE_DIR, "..", "macro_tracker_app")
SERVER_SCRIPT = os.path.join(APP_DIR, "app.py")

def main():
    print("Launching MacroTracker Desktop Server...")
    proc = subprocess.Popen([sys.executable, SERVER_SCRIPT], cwd=APP_DIR)
    time.sleep(1)
    
    url = "http://localhost:8000"
    print(f"Opening MacroTracker at {url}")
    webbrowser.open(url)
    
    try:
        proc.wait()
    except KeyboardInterrupt:
        print("\nClosing MacroTracker Desktop...")
        proc.terminate()

if __name__ == "__main__":
    main()
