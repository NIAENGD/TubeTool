#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    print(json.dumps({"error": "Missing dependency: pip install yt-dlp"}))
    sys.exit(1)


def normalize_formats(info):
    out = []
    for f in info.get("formats", []):
        format_id = f.get("format_id")
        vcodec = f.get("vcodec")
        acodec = f.get("acodec")
        height = f.get("height")

        if not format_id:
            continue

        kind = "audio" if vcodec == "none" else "video"
        label = f"{format_id} | {f.get('ext', '?')} | {f.get('format_note', 'unknown')}"
        if height:
            label = f"{label} | {height}p"

        out.append(
            {
                "id": format_id,
                "kind": kind,
                "label": label,
                "resolution": height,
                "has_audio": acodec != "none",
            }
        )
    return out


def as_items(info):
    if "entries" in info and info["entries"]:
        entries = [e for e in info["entries"] if e]
    else:
        entries = [info]

    items = []
    for entry in entries:
        items.append(
            {
                "title": entry.get("title"),
                "webpage_url": entry.get("webpage_url") or entry.get("original_url"),
                "formats": normalize_formats(entry),
            }
        )
    return items


def analyze(url):
    opts = {"quiet": True, "no_warnings": True, "extract_flat": False}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    return {"items": as_items(info)}


def select_format(selected, max_resolution):
    audio_ids = selected.get("audio", [])
    video_ids = selected.get("video", [])

    video_part = "/".join(video_ids) if video_ids else f"bestvideo[height<={max_resolution}]"
    audio_part = "/".join(audio_ids) if audio_ids else "bestaudio"

    return f"{video_part}+{audio_part}/best[height<={max_resolution}]"


def progress_hook(data):
    status = data.get("status", "unknown")
    if status == "downloading":
        total = data.get("total_bytes") or data.get("total_bytes_estimate") or 1
        downloaded = data.get("downloaded_bytes") or 0
        progress = int(downloaded / total * 100)
        event = {
            "type": "progress",
            "status": status,
            "progress": progress,
            "speed": data.get("_speed_str"),
            "eta": data.get("_eta_str"),
        }
        print(json.dumps(event), flush=True)
    elif status == "finished":
        event = {
            "type": "progress",
            "status": "processing",
            "progress": 100,
            "speed": None,
            "eta": None,
        }
        print(json.dumps(event), flush=True)


def download(url, output_dir, selected, max_resolution):
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    ydl_opts = {
        "outtmpl": os.path.join(output_dir, "%(title)s.%(ext)s"),
        "format": select_format(selected, max_resolution),
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [progress_hook],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        output_file = ydl.prepare_filename(info)

    print(json.dumps({"type": "done", "file": output_file}), flush=True)


def main():
    payload = json.loads(sys.stdin.read())
    action = payload.get("action")

    if action == "analyze":
        print(json.dumps(analyze(payload["url"])))
        return

    if action == "download":
        download(
            payload["url"],
            payload.get("outputDir", str(Path.home() / "Downloads" / "TubeTool")),
            payload.get("selected", {}),
            int(payload.get("maxResolution", 1080)),
        )
        return

    print(json.dumps({"error": f"Unknown action: {action}"}))
    sys.exit(1)


if __name__ == "__main__":
    main()
