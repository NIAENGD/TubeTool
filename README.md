# TubeTool (Mac-only)

A simple Electron app focused on macOS that processes YouTube video/playlist links with a Python `yt-dlp` worker.

## Features

- Main page with YouTube link input + **Process**.
- Corner **Downloads** button for tracking all active/completed downloads.
- Supports videos and playlists.
- Selection page allows:
  - multi-select audio formats
  - multi-select video formats
  - select-all for audio and video categories
  - max resolution slider based on source formats
- Download page shows status, progress %, speed, and ETA.

## Prerequisites (macOS)

- Node.js 20+
- Python 3.10+
- `ffmpeg` available in PATH (recommended for best muxing support)

## Setup

```bash
npm install
python3 -m pip install -r requirements.txt
```

## Run (development)

```bash
npm run start
```

## Build macOS app

```bash
npm run build:mac
```

This project intentionally only ships a macOS target in `electron-builder` config.
