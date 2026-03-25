#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path

try:
    import yt_dlp
except ImportError:
    print(json.dumps({"error": "Missing dependency: pip install yt-dlp"}))
    sys.exit(1)


def is_storyboard_format(fmt):
    format_id = str(fmt.get("format_id") or "").lower()
    note = str(fmt.get("format_note") or "").lower()
    ext = str(fmt.get("ext") or "").lower()
    protocol = str(fmt.get("protocol") or "").lower()

    return (
        format_id.startswith("sb")
        or "storyboard" in note
        or ext == "mhtml"
        or "mhtml" in protocol
    )


def extract_resolution(fmt):
    height = fmt.get("height")
    if isinstance(height, int):
        return height

    resolution = str(fmt.get("resolution") or "")
    match = re.search(r"(\d{3,4})p", resolution.lower())
    if match:
        return int(match.group(1))

    return None


def build_audio_label(fmt, format_id):
    ext = fmt.get("audio_ext") or fmt.get("ext") or "audio"
    abr = fmt.get("abr")
    note = fmt.get("format_note") or "audio"

    parts = [str(format_id), str(ext)]
    if abr:
        parts.append(f"{int(abr)} kbps")
    parts.append(str(note))
    return " | ".join(parts)


def build_video_label(fmt, format_id, height):
    ext = fmt.get("ext") or "video"
    fps = fmt.get("fps")
    note = fmt.get("format_note")
    has_audio = fmt.get("acodec") not in (None, "none")

    parts = [str(format_id), str(ext)]
    if height:
        parts.append(f"{height}p")
    if fps:
        parts.append(f"{int(fps)}fps")
    if note:
        parts.append(str(note))
    parts.append("with audio" if has_audio else "video only")
    return " | ".join(parts)


def normalize_formats(info):
    out = []
    for f in info.get("formats", []):
        format_id = f.get("format_id")
        vcodec = f.get("vcodec")
        acodec = f.get("acodec")

        if not format_id or is_storyboard_format(f):
            continue

        if vcodec == "none" and acodec not in (None, "none"):
            kind = "audio"
            height = None
            label = build_audio_label(f, format_id)
        elif vcodec not in (None, "none"):
            kind = "video"
            height = extract_resolution(f)
            label = build_video_label(f, format_id, height)
        else:
            continue

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


def normalize_output_dir(output_dir):
    expanded = os.path.expanduser(str(output_dir or "")).strip()
    if not expanded:
        expanded = str(Path.home() / "Downloads" / "TubeTool")
    return expanded


def download(url, output_dir, selected, max_resolution):
    normalized_output_dir = normalize_output_dir(output_dir)
    Path(normalized_output_dir).mkdir(parents=True, exist_ok=True)
    ydl_opts = {
        "outtmpl": os.path.join(normalized_output_dir, "%(title)s.%(ext)s"),
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
