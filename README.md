# MacroTracker Pro - Multi-Platform Suite

A full-stack nutrition and macronutrient tracking platform tailored for personal use, supporting both desktop and mobile platforms with full customization.

## Package Contents

1. **`macro_tracker_app/` (Full-Stack Web App)**
   - Zero-dependency Python backend (`http.server`, SQLite database, natural language nutrition estimation engine).
   - Responsive mobile-first frontend dashboard with dark/light modes.
   - Text & photo meal logging, daily fresh tracking, and end-of-week 7-day averages.
   - One-click CSV and JSON data export.

2. **`macro_tracker_mobile/` (iOS & Android App)**
   - Cross-platform native mobile application built with React Native and Expo.
   - Direct camera photo capture and photo library selection.
   - Mobile macro cards, daily logger, and weekly analytics.

3. **`macro_tracker_desktop/` (macOS & Windows Desktop App)**
   - Native desktop launcher (`desktop_launcher.py`) and Electron desktop app wrapper (`main.js`).
   - Runs the background server and displays the tracker in a dedicated desktop window.
