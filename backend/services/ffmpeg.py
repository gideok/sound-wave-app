import shutil
import subprocess
from pathlib import Path
from typing import Optional


def resolve_binaries() -> tuple[str, str]:
    try:
        import imageio_ffmpeg  # type: ignore
        ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        ffprobe_exe = shutil.which("ffprobe") or ffmpeg_exe.replace("ffmpeg", "ffprobe")
        return ffmpeg_exe, ffprobe_exe or "ffprobe"
    except Exception:
        ffmpeg_exe = shutil.which("ffmpeg") or "ffmpeg"
        ffprobe_exe = shutil.which("ffprobe") or "ffprobe"
        return ffmpeg_exe, ffprobe_exe


def probe_duration_seconds(ffprobe_exe: str, input_path: Path) -> Optional[float]:
    try:
        cmd = [
            ffprobe_exe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(input_path),
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode == 0:
            out = proc.stdout.decode().strip()
            return float(out)
    except Exception:
        return None
    return None


