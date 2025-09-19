from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import subprocess
import tempfile
import shutil
import threading
import re
from typing import Dict, Any, Optional

from services.ffmpeg import resolve_binaries, probe_duration_seconds
from services.files import create_temp_dir, safe_rmtree, safe_unlink
from services.jobs import job_get, job_set, job_update


router = APIRouter()

_FFMPEG_EXE, _FFPROBE_EXE = resolve_binaries()
_TIME_RE = re.compile(r"time=(\d+):(\d+):(\d+\.?\d*)")


@router.post("/render-waveform")
async def render_waveform(
    bg: BackgroundTasks,
    file: UploadFile = File(...),
    width: int = 1280,
    height: int = 720,
    color: str = "0x5ac8fa",
    background: str = "0x0b1020",
    fps: int = 30,
):
    if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
        raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다. ffmpeg 또는 imageio-ffmpeg를 설치하세요.")

    tmp_dir = create_temp_dir("wave_render_")
    input_path = tmp_dir / (Path(file.filename).name or "input")
    output_path = tmp_dir / "output.mp4"

    try:
        with input_path.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)

        filter_complex = (
            f"color=c={background}:s={width}x{height}:r={fps}[bg];"
            f"[0:a]aformat=channel_layouts=mono,showwaves=s={width}x{height}:mode=line:colors={color}[sw];"
            f"[bg][sw]overlay=format=rgb"
        )

        cmd = [
            _FFMPEG_EXE,
            "-y",
            "-i",
            str(input_path),
            "-filter_complex",
            filter_complex,
            "-map", "0:a",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-shortest",
            str(output_path),
        ]

        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode != 0 or not output_path.exists():
            detail = proc.stderr.decode(errors="ignore")[-2000:]
            raise HTTPException(status_code=500, detail=f"ffmpeg 실패: {detail}")

        def _cleanup():
            try:
                safe_unlink(output_path)
                safe_unlink(input_path)
                safe_rmtree(tmp_dir)
            except Exception:
                pass

        bg.add_task(_cleanup)
        return FileResponse(
            path=str(output_path),
            filename=f"waveform_{Path(file.filename).stem or 'output'}.mp4",
            media_type="video/mp4",
        )

    except HTTPException:
        safe_rmtree(tmp_dir)
        raise
    except Exception as e:
        safe_rmtree(tmp_dir)
        raise HTTPException(status_code=500, detail=str(e))


def _run_ffmpeg_async(job_id: str, input_path: Path, output_path: Path, width: int, height: int, color: str, background: str, fps: int):
    try:
        job_update(job_id, {"status": "running", "progress": 0.0})

        duration = probe_duration_seconds(_FFPROBE_EXE, input_path) or 0.0

        filter_complex = (
            f"color=c={background}:s={width}x{height}:r={fps}[bg];"
            f"[0:a]aformat=channel_layouts=mono,showwaves=s={width}x{height}:mode=line:colors={color}[sw];"
            f"[bg][sw]overlay=format=rgb"
        )
        cmd = [
            _FFMPEG_EXE,
            "-y",
            "-i",
            str(input_path),
            "-filter_complex",
            filter_complex,
            "-map", "0:a",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-shortest",
            str(output_path),
        ]

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
        if not proc.stderr:
            raise RuntimeError("ffmpeg stderr stream not available")
        for line in proc.stderr:
            match = _TIME_RE.search(line)
            if match and duration and duration > 0:
                hours = float(match.group(1))
                minutes = float(match.group(2))
                seconds = float(match.group(3))
                current = hours * 3600 + minutes * 60 + seconds
                progress = max(0.0, min(1.0, current / duration))
                job_update(job_id, {"progress": progress})
        proc.wait()

        if proc.returncode == 0 and output_path.exists():
            job_update(job_id, {"status": "completed", "progress": 1.0})
        else:
            job_update(job_id, {"status": "failed", "error": "ffmpeg failed"})
    except Exception as e:
        job_update(job_id, {"status": "failed", "error": str(e)})


def _run_ffmpeg_async_with_visualizations(job_id: str, input_path: Path, output_path: Path, width: int, height: int, color: str, background: str, fps: int, visualization_types: str, visualization_colors: str):
    try:
        job_update(job_id, {"status": "running", "progress": 0.0})

        duration = probe_duration_seconds(_FFPROBE_EXE, input_path) or 0.0
        vis_types = [v.strip() for v in visualization_types.split(',') if v.strip()]
        vis_colors = [c.strip() for c in visualization_colors.split(',') if c.strip()]
        
        # Create color mapping
        color_map = {}
        for i, vis_type in enumerate(vis_types):
            if i < len(vis_colors):
                color_map[vis_type] = vis_colors[i]
            else:
                color_map[vis_type] = color  # fallback to default color

        # Create filter complex based on selected visualizations - simplified single visualization approach
        filter_parts = [f"color=c={background}:s={width}x{height}:r={fps}[bg]"]
        
        # For now, handle only the first selected visualization to avoid complexity
        primary_vis = vis_types[0] if vis_types else 'line'
        primary_color = color_map.get(primary_vis, color)
        
        if primary_vis == 'line':
            # Use basic showwaves without mode option for maximum compatibility
            filter_parts.append(f"[0:a]aformat=channel_layouts=mono,showwaves=s={width}x{height}:colors={primary_color}[vis]")
        elif primary_vis == 'bars':
            # Remove mode=bar option for better compatibility
            filter_parts.append(f"[0:a]aformat=channel_layouts=mono,showwaves=s={width}x{height}:colors={primary_color}[vis]")
        elif primary_vis == 'spectrum':
            # Use basic showwaves without mode option for maximum compatibility
            filter_parts.append(f"[0:a]aformat=channel_layouts=mono,showwaves=s={width}x{height}:colors={primary_color}[vis]")
        else:
            # Default to basic showwaves
            filter_parts.append(f"[0:a]aformat=channel_layouts=mono,showwaves=s={width}x{height}:colors={primary_color}[vis]")
        
        # Simple overlay
        filter_parts.append("[bg][vis]overlay=format=rgb[output]")
        filter_complex = ";".join(filter_parts)
        current_bg = "output"

        cmd = [
            _FFMPEG_EXE,
            "-y",
            "-i",
            str(input_path),
            "-filter_complex",
            filter_complex,
            "-map", f"[{current_bg}]",
            "-map", "0:a",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-shortest",
            str(output_path),
        ]

        # Debug: Log the command
        print(f"FFmpeg command: {' '.join(cmd)}")
        print(f"Filter complex: {filter_complex}")

        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
        
        stderr_output = []
        if proc.stderr:
            for line in proc.stderr:
                stderr_output.append(line)
                match = _TIME_RE.search(line)
                if match and duration and duration > 0:
                    hours = float(match.group(1))
                    minutes = float(match.group(2))
                    seconds = float(match.group(3))
                    current = hours * 3600 + minutes * 60 + seconds
                    progress = max(0.0, min(1.0, current / duration))
                    job_update(job_id, {"progress": progress})
        
        proc.wait()

        if proc.returncode == 0 and output_path.exists():
            job_update(job_id, {"status": "completed", "progress": 1.0})
        else:
            error_msg = "ffmpeg failed"
            if stderr_output:
                error_msg = f"ffmpeg failed: {''.join(stderr_output[-10:])}"  # Last 10 lines
            job_update(job_id, {"status": "failed", "error": error_msg})
    except Exception as e:
        job_update(job_id, {"status": "failed", "error": str(e)})


@router.post("/render/start")
async def render_start(
    file: UploadFile = File(...),
    width: int = 1280,
    height: int = 720,
    color: str = "0x5ac8fa",
    background: str = "0x0b1020",
    fps: int = 30,
    visualization_types: str = Query("line"),  # comma-separated list
    visualization_colors: str = Query(""),  # comma-separated colors for each visualization type
):
    if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
        raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다. ffmpeg 또는 imageio-ffmpeg를 설치하세요.")

    tmp_dir = create_temp_dir("wave_job_")
    input_path = tmp_dir / (Path(file.filename).name or "input")
    output_path = tmp_dir / "output.mp4"

    with input_path.open("wb") as f:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    import uuid
    job_id = str(uuid.uuid4())
    job_set(job_id, {
        "status": "queued",
        "progress": 0.0,
        "tmp_dir": str(tmp_dir),
        "input_path": str(input_path),
        "output_path": str(output_path),
        "error": None,
    })

    thread = threading.Thread(
        target=_run_ffmpeg_async_with_visualizations,
        args=(job_id, input_path, output_path, width, height, color, background, fps, visualization_types, visualization_colors),
        daemon=True,
    )
    thread.start()

    return {"job_id": job_id}


@router.get("/render/progress")
def render_progress(job_id: str = Query(...)):
    job = job_get(job_id)
    if not job:
        return JSONResponse({"error": "job not found"}, status_code=404)
    return {
        "status": job.get("status"),
        "progress": job.get("progress"),
        "error": job.get("error"),
    }


@router.get("/render/result")
def render_result(bg: BackgroundTasks, job_id: str = Query(...)):
    job = job_get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    status = job.get("status")
    output_path = Path(job.get("output_path"))
    tmp_dir = Path(job.get("tmp_dir"))
    input_path = Path(job.get("input_path"))

    if status != "completed" or not output_path.exists():
        raise HTTPException(status_code=400, detail="job not completed")

    def _cleanup():
        try:
            from services.jobs import job_pop
            job_pop(job_id)
            safe_unlink(output_path)
            safe_unlink(input_path)
            safe_rmtree(tmp_dir)
        except Exception:
            pass

    bg.add_task(_cleanup)
    return FileResponse(path=str(output_path), filename=str(output_path.name), media_type="video/mp4")


