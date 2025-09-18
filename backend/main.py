# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, JSONResponse

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
import threading
import uuid
import re
from typing import Dict, Any, Optional
import json
import math
import datetime
import time

try:
	# Prefer bundled ffmpeg from imageio-ffmpeg if available
	import imageio_ffmpeg  # type: ignore
	_FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
	# ffprobe is adjacent to ffmpeg in imageio-ffmpeg; if not, fallback to PATH
	_FFPROBE_EXE = shutil.which("ffprobe") or _FFMPEG_EXE.replace("ffmpeg", "ffprobe")
except Exception:
	_FFMPEG_EXE = shutil.which("ffmpeg") or "ffmpeg"
	_FFPROBE_EXE = shutil.which("ffprobe") or "ffprobe"

# Stem separation imports
try:
	from demucs import separate
	import torch
	import torchaudio
	_DEMUCS_AVAILABLE = True
	print("Demucs is available")
except ImportError as e:
	_DEMUCS_AVAILABLE = False
	print(f"Demucs not available: {e}")

app = FastAPI()

# CORS 설정: 프론트엔드 개발 서버(http://localhost:5173)에서의 요청을 허용
origins = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
]

app.add_middleware(
	CORSMiddleware,
	allow_origins=origins,
	allow_credentials=True,
	allow_methods=["*"], # 모든 HTTP 메소드 허용
	allow_headers=["*"], # 모든 HTTP 헤더 허용
)

@app.get("/")
def read_root():
	return {"Hello": "World"}

@app.get("/api/status")
def get_status():
	return {"status": "ok", "message": "Backend is running!"}


@app.post("/api/render-waveform")
async def render_waveform(
	bg: BackgroundTasks,
	file: UploadFile = File(...),
	width: int = 1280,
	height: int = 720,
	color: str = "0x5ac8fa",
	background: str = "0x0b1020",
	fps: int = 30,
):
	"""
	업로드된 오디오/비디오 파일을 기반으로 파형 영상(MP4)을 생성하여 반환합니다.
	- ffmpeg의 showwaves 필터를 사용합니다.
	- 배경색, 파형 색상, 해상도, fps를 설정할 수 있습니다.
	"""
	# ffmpeg 확인
	if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
		raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다. ffmpeg 또는 imageio-ffmpeg를 설치하세요.")

	# 임시 파일 준비
	tmp_dir = Path(tempfile.mkdtemp(prefix="wave_render_"))
	input_path = tmp_dir / (Path(file.filename).name or "input")
	output_path = tmp_dir / "output.mp4"

	try:
		# 업로드 저장
		with input_path.open("wb") as f:
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				f.write(chunk)

		# 필터 컴플렉스: 배경색 + showwaves 오버레이
		# 참고: 색상은 0xRRGGBB 형식, 또는 hex "#RRGGBB"도 가능
		# showwaves mode: line/cline/p2p 등 사용 가능
		filter_complex = (
			f"color=c={background}:s={width}x{height}:r={fps}[bg];"
			f"[0:a]aformat=channel_layouts=mono,showwaves=s={width}x{height}:mode=line:colors={color}[sw];"
			f"[bg][sw]overlay=format=rgb"
		)

		# ffmpeg 커맨드 구성
		cmd = [
			_FFMPEG_EXE,
			"-y",
			"-i",
			str(input_path),
			"-filter_complex",
			filter_complex,
			"-map",
			"0:a",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-shortest",
			str(output_path),
		]

		# 실행
		proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
		if proc.returncode != 0 or not output_path.exists():
			detail = proc.stderr.decode(errors="ignore")[-2000:]
			raise HTTPException(status_code=500, detail=f"ffmpeg 실패: {detail}")

		# 응답 및 정리
		def _cleanup():
			try:
				if output_path.exists():
					output_path.unlink()
				if input_path.exists():
					input_path.unlink()
				if tmp_dir.exists():
					shutil.rmtree(tmp_dir, ignore_errors=True)
			except Exception:
				pass

		bg.add_task(_cleanup)
		return FileResponse(
			path=str(output_path),
			filename=f"waveform_{Path(file.filename).stem or 'output'}.mp4",
			media_type="video/mp4",
		)

	except HTTPException:
		# 에러 시 디렉터리 정리
		shutil.rmtree(tmp_dir, ignore_errors=True)
		raise
	except Exception as e:
		shutil.rmtree(tmp_dir, ignore_errors=True)
		raise HTTPException(status_code=500, detail=str(e))


# ----------------------
# 비동기 렌더링 관리
# ----------------------
_JOBS: Dict[str, Dict[str, Any]] = {}
_JOB_LOCK = threading.Lock()
_TIME_RE = re.compile(r"time=(\d+):(\d+):(\d+\.?\d*)")


def _probe_duration_seconds(input_path: Path) -> Optional[float]:
	try:
		cmd = [
			_FFPROBE_EXE,
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


def _job_log(job_id: str, message: str) -> None:
	"""Append a log line to a job and also print to terminal."""
	line = f"[stem:{job_id}] {message}"
	print(line, flush=True)
	with _JOB_LOCK:
		job = _JOBS.get(job_id)
		if job is not None:
			logs = job.setdefault("logs", [])
			logs.append(line)


def _extract_json_from_text(text: str) -> Optional[Dict[str, Any]]:
	try:
		start = text.find("{")
		end = text.rfind("}")
		if start != -1 and end != -1 and end > start:
			block = text[start : end + 1]
			return json.loads(block)
	except Exception:
		return None
	return None


def _measure_lufs_first_pass(input_path: Path, target_i: float = -14.0, target_tp: float = -1.5, target_lra: float = 11.0) -> Dict[str, Any]:
	"""
	Run ffmpeg loudnorm in analysis mode to measure integrated loudness (LUFS), true-peak, and LRA.
	Returns a dict with keys like input_i, input_tp, input_lra, input_thresh, target_offset, etc.
	"""
	def _run_with_filter(filter_expr: str):
		cmd_local = [
			_FFMPEG_EXE,
			"-hide_banner",
			"-nostats",
			"-i",
			str(input_path),
			"-filter:a",
			filter_expr,
			"-f",
			"null",
			"-",
		]
		return subprocess.run(
			cmd_local,
			stdout=subprocess.PIPE,
			stderr=subprocess.PIPE,
			text=True,
			encoding="utf-8",
			errors="ignore",
		)

	# First try high-precision soxr
	filter_soxr = (
		"aresample=48000:resampler=soxr:precision=28,"
		f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}:print_format=json"
	)
	proc = _run_with_filter(filter_soxr)

	# If soxr not available or failed, fallback to default resampler
	if proc.returncode != 0 or not _extract_json_from_text((proc.stderr or "") + (proc.stdout or "")):
		filter_fallback = (
			"aresample=48000,"
			f"loudnorm=I={target_i}:TP={target_tp}:LRA={target_lra}:print_format=json"
		)
		proc = _run_with_filter(filter_fallback)

	combined = (proc.stderr or "") + "\n" + (proc.stdout or "")
	if proc.returncode != 0:
		# include tail of stderr to help diagnose
		tail = "\n".join((proc.stderr or combined).splitlines()[-50:])
		raise RuntimeError(f"ffmpeg loudnorm analysis failed: {tail}")
	json_data = _extract_json_from_text(combined)
	if not json_data:
		# include combined output tail for debugging
		tail = "\n".join(combined.splitlines()[-80:])
		raise RuntimeError(f"Failed to parse loudnorm analysis output. Tail: {tail}")
	return json_data


def _build_loudnorm_filter_second_pass(measured: Dict[str, Any], target_i: float = -14.0, target_tp: float = -1.5, target_lra: float = 11.0) -> str:
	# loudnorm second pass expects these measured params (note case sensitivity)
	input_i = measured.get("input_i") or measured.get("measured_I")
	input_tp = measured.get("input_tp") or measured.get("measured_TP")
	input_lra = measured.get("input_lra") or measured.get("measured_LRA")
	input_thresh = measured.get("input_thresh") or measured.get("measured_thresh")
	target_offset = measured.get("target_offset") or measured.get("offset")
	return (
		"loudnorm="
		f"I={target_i}:TP={target_tp}:LRA={target_lra}:"
		f"measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:"
		f"measured_thresh={input_thresh}:offset={target_offset}:"
		"linear=true:print_format=summary"
	)


# ----------------------
# LUFS 측정 및 정규화 API
# ----------------------

@app.post("/api/audio/measure-lufs")
async def measure_lufs(file: UploadFile = File(...)):
	if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
		raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다. ffmpeg 또는 imageio-ffmpeg를 설치하세요.")

	# Save upload to temp file
	tmp_dir = Path(tempfile.mkdtemp(prefix="lufs_measure_"))
	input_path = tmp_dir / (Path(file.filename).name or "input")
	try:
		with input_path.open("wb") as f:
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				f.write(chunk)

		measured = _measure_lufs_first_pass(input_path)
		return measured
	except Exception as e:
		raise HTTPException(status_code=500, detail=str(e))
	finally:
		try:
			if input_path.exists():
				input_path.unlink()
			if tmp_dir.exists():
				shutil.rmtree(tmp_dir, ignore_errors=True)
		except Exception:
			pass


@app.post("/api/audio/normalize")
async def normalize_audio(
	bg: BackgroundTasks,
	file: UploadFile = File(...),
	target_lufs: float = -14.0,
	target_tp: float = -1.5,
	target_lra: float = 11.0,
	pre_compress: bool = False,
	compress_threshold_db: float = -18.0,
	compress_ratio: float = 3.0,
	compress_attack_ms: int = 20,
	compress_release_ms: int = 200,
):
	"""
	두 패스 loudnorm을 이용하여 -14 LUFS(기본값)로 정규화된 오디오를 반환합니다.
	반환 포맷은 WAV(PCM 16-bit) 입니다.
	"""
	if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
		raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다. ffmpeg 또는 imageio-ffmpeg를 설치하세요.")

	tmp_dir = Path(tempfile.mkdtemp(prefix="normalize_"))
	input_path = tmp_dir / (Path(file.filename).name or "input")
	output_path = tmp_dir / f"{Path(file.filename).stem or 'output'}_norm.wav"

	try:
		# Save upload
		with input_path.open("wb") as f:
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				f.write(chunk)

		# Pass 1: measure
		measured = _measure_lufs_first_pass(input_path, target_i=target_lufs, target_tp=target_tp, target_lra=target_lra)
		# Pass 2: apply with measured params
		filter_second = _build_loudnorm_filter_second_pass(measured, target_i=target_lufs, target_tp=target_tp, target_lra=target_lra)
		# Build optional pre-compression to better approach desired LRA
		pre_chain = []
		if pre_compress:
			# ac compressor before loudnorm to reduce excessive dynamics
			# threshold in dB, ratio unitless
			pre_chain.append(
				f"acompressor=threshold={compress_threshold_db}dB:ratio={compress_ratio}:attack={compress_attack_ms}:release={compress_release_ms}"
			)
		# Match measurement path: apply high-quality resample before loudnorm
		chain = ["aresample=48000:resampler=soxr:precision=28"] + pre_chain + [filter_second]
		apply_filter = ",".join(chain)
		cmd2 = [
			_FFMPEG_EXE,
			"-y",
			"-hide_banner",
			"-i",
			str(input_path),
			"-filter:a",
			apply_filter,
			"-c:a",
			"pcm_s16le",
			str(output_path),
		]
		proc2 = subprocess.run(
			cmd2,
			stdout=subprocess.PIPE,
			stderr=subprocess.PIPE,
			text=True,
			encoding="utf-8",
			errors="ignore",
		)
		if proc2.returncode != 0 or not output_path.exists():
			# Fallback without soxr (in case filter not supported)
			chain_fb = ["aresample=48000"] + pre_chain + [filter_second]
			apply_filter_fb = ",".join(chain_fb)
			cmd2_fb = [
				_FFMPEG_EXE,
				"-y",
				"-hide_banner",
				"-i",
				str(input_path),
				"-filter:a",
				apply_filter_fb,
				"-c:a",
				"pcm_s16le",
				str(output_path),
			]
			proc2 = subprocess.run(
				cmd2_fb,
				stdout=subprocess.PIPE,
				stderr=subprocess.PIPE,
				text=True,
				encoding="utf-8",
				errors="ignore",
			)
			if proc2.returncode != 0 or not output_path.exists():
				detail = (proc2.stderr or "").splitlines()[-50:]
				raise HTTPException(status_code=500, detail="ffmpeg loudnorm failed: " + "\n".join(detail))

		def _cleanup():
			try:
				if output_path.exists():
					output_path.unlink()
				if input_path.exists():
					input_path.unlink()
				if tmp_dir.exists():
					shutil.rmtree(tmp_dir, ignore_errors=True)
			except Exception:
				pass

		bg.add_task(_cleanup)
		return FileResponse(path=str(output_path), filename=str(output_path.name), media_type="audio/wav")

	except HTTPException:
		shutil.rmtree(tmp_dir, ignore_errors=True)
		raise
	except Exception as e:
		shutil.rmtree(tmp_dir, ignore_errors=True)
		raise HTTPException(status_code=500, detail=str(e))

def _run_ffmpeg_async(job_id: str, input_path: Path, output_path: Path, width: int, height: int, color: str, background: str, fps: int):
	try:
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if not job:
				return
			job["status"] = "running"
			job["progress"] = 0.0

		duration = _probe_duration_seconds(input_path)

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
			"-map",
			"0:a",
			"-c:v",
			"libx264",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-shortest",
			str(output_path),
		]

		# Force UTF-8 decoding to avoid Windows cp949 decode issues
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
				with _JOB_LOCK:
					job = _JOBS.get(job_id)
					if job:
						job["progress"] = progress
		proc.wait()

		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if not job:
				return
			if proc.returncode == 0 and output_path.exists():
				job["status"] = "completed"
				job["progress"] = 1.0
			else:
				job["status"] = "failed"
				job["error"] = "ffmpeg failed"
	except Exception as e:
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["status"] = "failed"
				job["error"] = str(e)


@app.post("/api/render/start")
async def render_start(
	file: UploadFile = File(...),
	width: int = 1280,
	height: int = 720,
	color: str = "0x5ac8fa",
	background: str = "0x0b1020",
	fps: int = 30,
):
	# ffmpeg 확인
	if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
		raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다. ffmpeg 또는 imageio-ffmpeg를 설치하세요.")

	tmp_dir = Path(tempfile.mkdtemp(prefix="wave_job_"))
	input_path = tmp_dir / (Path(file.filename).name or "input")
	output_path = tmp_dir / "output.mp4"

	with input_path.open("wb") as f:
		while True:
			chunk = await file.read(1024 * 1024)
			if not chunk:
				break
			f.write(chunk)

	job_id = str(uuid.uuid4())
	with _JOB_LOCK:
		_JOBS[job_id] = {
			"status": "queued",
			"progress": 0.0,
			"tmp_dir": str(tmp_dir),
			"input_path": str(input_path),
			"output_path": str(output_path),
			"error": None,
		}

	thread = threading.Thread(
		target=_run_ffmpeg_async,
		args=(job_id, input_path, output_path, width, height, color, background, fps),
		daemon=True,
	)
	thread.start()

	return {"job_id": job_id}


@app.get("/api/render/progress")
def render_progress(job_id: str = Query(...)):
	with _JOB_LOCK:
		job = _JOBS.get(job_id)
		if not job:
			return JSONResponse({"error": "job not found"}, status_code=404)
		return {
			"status": job.get("status"),
			"progress": job.get("progress"),
			"error": job.get("error"),
		}


@app.get("/api/render/result")
def render_result(bg: BackgroundTasks, job_id: str = Query(...)):
	with _JOB_LOCK:
		job = _JOBS.get(job_id)
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
			with _JOB_LOCK:
				_JOBS.pop(job_id, None)
			if output_path.exists():
				output_path.unlink()
			if input_path.exists():
				input_path.unlink()
			if tmp_dir.exists():
				shutil.rmtree(tmp_dir, ignore_errors=True)
		except Exception:
			pass

	bg.add_task(_cleanup)
	return FileResponse(path=str(output_path), filename=f"waveform_{Path(input_path).stem or 'output'}.mp4", media_type="video/mp4")


# ----------------------
# Stem Separation API
# ----------------------

def _run_stem_separation(job_id: str, input_path: Path, output_dir: Path, model: str):
	"""Background task for stem separation using Demucs"""
	try:
		_job_log(job_id, f"Job queued. Input: {input_path.name}")
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if not job:
				return
			job["status"] = "running"
			job["progress"] = 0.1
			job["eta"] = None
		_job_log(job_id, "Preparing Demucs...")

		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["progress"] = 0.3
		
		# Demucs로 stem 분리 실행
		# Demucs는 직접 파일을 처리하고 결과를 지정된 디렉터리에 저장합니다
		from demucs import separate
		_job_log(job_id, "Demucs module imported.")
		
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["progress"] = 0.5
		
		# Demucs 모델 매핑
		demucs_model = "htdemucs"  # 기본 모델
		if "4stems" in model:
			demucs_model = "htdemucs"
		elif "5stems" in model:
			demucs_model = "htdemucs_ft"
		_job_log(job_id, f"Selected model: {demucs_model}")
		
		# Demucs로 분리 실행 (stderr를 읽어 진행률 유추)
		cmd = [
			"python", "-m", "demucs.separate",
			"-n", demucs_model,  # model name flag
			"-d", "cpu",
			"-o", str(output_dir),
			str(input_path),
		]
		_job_log(job_id, "Starting Demucs separation...")
		proc = subprocess.Popen(
			cmd,
			stdout=subprocess.PIPE,
			stderr=subprocess.PIPE,
			text=True,
			encoding="utf-8",
			errors="ignore",
		)
		if not proc.stderr:
			raise RuntimeError("Demucs stderr stream not available")
		stage = "prepare"
		while True:
			line = proc.stderr.readline()
			if not line and proc.poll() is not None:
				break
			if not line:
				continue
			lower = line.lower()
			# Heuristic stage mapping
			if "loading" in lower and stage == "prepare":
				stage = "load"
				with _JOB_LOCK:
					job = _JOBS.get(job_id)
					if job:
						job["progress"] = max(job.get("progress", 0.0), 0.2)
				_job_log(job_id, line.strip())
			elif "separating" in lower or "running" in lower:
				stage = "separate"
				with _JOB_LOCK:
					job = _JOBS.get(job_id)
					if job:
						job["progress"] = max(job.get("progress", 0.0), 0.4)
				_job_log(job_id, line.strip())
			elif "done" in lower or "saving" in lower:
				stage = "save"
				with _JOB_LOCK:
					job = _JOBS.get(job_id)
					if job:
						job["progress"] = max(job.get("progress", 0.0), 0.75)
				_job_log(job_id, line.strip())

			# Generic pass-through logging every few lines
			if any(key in lower for key in ["demucs", "torch", "chunks", "batch", "resample", "writing", "file"]):
				_job_log(job_id, line.strip())

		proc.wait()
		if proc.returncode != 0:
			raise RuntimeError("Demucs process failed. See logs above.")
		
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["progress"] = max(job.get("progress", 0.0), 0.85)
		_job_log(job_id, "Collecting separated stems...")
		
		# Demucs는 보통 output_dir / model / <track_name> / *.wav 구조로 저장합니다.
		# 재귀적으로 탐색하여 최상위로 이동
		stem_files = {}
		for stem_file in output_dir.rglob("*.wav"):
			# 무작위 중첩 구조에서도 stem 파일만 수집
			name = stem_file.stem
			# e.g., 'vocals', 'drums', etc.만 허용
			if name.lower() in {"vocals", "drums", "bass", "other", "piano"}:
				new_path = output_dir / f"{name}.wav"
				try:
					if stem_file.resolve() != new_path.resolve():
						shutil.copy2(stem_file, new_path)
					stem_files[name] = str(new_path)
				except Exception:
					pass

		# 불필요한 서브폴더 정리 (모델/트랙 폴더 등)
		for sub in output_dir.iterdir():
			if sub.is_dir():
				shutil.rmtree(sub, ignore_errors=True)

		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["progress"] = max(job.get("progress", 0.0), 0.92)

		# ZIP 파일로 압축
		zip_path = output_dir.parent / "stems.zip"
		import zipfile
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
			for stem_name, stem_path in stem_files.items():
				zipf.write(stem_path, f"{stem_name}.wav")
		_job_log(job_id, f"Created ZIP: {zip_path.name}")

		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["status"] = "completed"
				job["progress"] = 1.0
				job["zip_path"] = str(zip_path)
		_job_log(job_id, "Job completed successfully.")

	except Exception as e:
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["status"] = "failed"
				job["error"] = str(e)
		_job_log(job_id, f"Job failed: {e}")


@app.post("/api/audio/separate-stems")
async def separate_stems(
	file: UploadFile = File(...),
	model: str = "demucs:4stems",  # Default to 4 stems separation
):
	"""
	업로드된 오디오 파일에서 stem을 분리하여 각각의 WAV 파일로 저장합니다.
	사용 가능한 모델:
	- demucs:4stems (vocals, drums, bass, other)
	- demucs:5stems (vocals, drums, bass, piano, other)
	"""
	if not _DEMUCS_AVAILABLE:
		raise HTTPException(
			status_code=500, 
			detail="Demucs가 설치되지 않았습니다. pip install demucs를 실행하세요."
		)

	if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
		raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다.")

	# 임시 디렉터리 준비
	tmp_dir = Path(tempfile.mkdtemp(prefix="stem_separation_"))
	input_path = tmp_dir / (Path(file.filename).name or "input")
	output_dir = tmp_dir / "stems"

	try:
		# 업로드된 파일 저장
		with input_path.open("wb") as f:
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				f.write(chunk)

		# 출력 디렉터리 생성
		output_dir.mkdir(exist_ok=True)

		job_id = str(uuid.uuid4())
		with _JOB_LOCK:
			_JOBS[job_id] = {
				"status": "queued",
				"progress": 0.0,
				"tmp_dir": str(tmp_dir),
				"input_path": str(input_path),
				"output_dir": str(output_dir),
				"model": model,
				"error": None,
			}

		thread = threading.Thread(
			target=_run_stem_separation,
			args=(job_id, input_path, output_dir, model),
			daemon=True,
		)
		thread.start()

		return {"job_id": job_id}

	except Exception as e:
		shutil.rmtree(tmp_dir, ignore_errors=True)
		raise HTTPException(status_code=500, detail=f"Stem 분리 시작 실패: {str(e)}")


@app.get("/api/audio/stem-separation/progress")
def stem_separation_progress(job_id: str = Query(...)):
	"""Stem 분리 진행률 조회"""
	with _JOB_LOCK:
		job = _JOBS.get(job_id)
		if not job:
			return JSONResponse({"error": "job not found"}, status_code=404)
		return {
			"status": job.get("status"),
			"progress": job.get("progress"),
			"error": job.get("error"),
			"logs": job.get("logs", [])[-100:],  # 최근 100라인만
			"eta": job.get("eta"),
		}


@app.get("/api/audio/stem-separation/result")
def stem_separation_result(bg: BackgroundTasks, job_id: str = Query(...)):
	"""Stem 분리 결과 다운로드"""
	with _JOB_LOCK:
		job = _JOBS.get(job_id)
		if not job:
			raise HTTPException(status_code=404, detail="job not found")
		status = job.get("status")
		zip_path = Path(job.get("zip_path"))
		tmp_dir = Path(job.get("tmp_dir"))
		input_path = Path(job.get("input_path"))
		model = job.get("model")
		
		if status != "completed" or not zip_path.exists():
			raise HTTPException(status_code=400, detail="job not completed")

	def _cleanup():
		try:
			with _JOB_LOCK:
				_JOBS.pop(job_id, None)
			if zip_path.exists():
				zip_path.unlink()
			if input_path.exists():
				input_path.unlink()
			if tmp_dir.exists():
				shutil.rmtree(tmp_dir, ignore_errors=True)
		except Exception:
			pass

	bg.add_task(_cleanup)
	
	# 모델 정보에 따른 파일명 생성
	model_name = model.replace("spleeter:", "").replace("-16kHz", "")
	filename = f"stems_{Path(input_path).stem or 'output'}_{model_name}.zip"
	
	return FileResponse(path=str(zip_path), filename=filename, media_type="application/zip")


@app.get("/api/audio/stem-models")
def get_stem_models():
	"""
	사용 가능한 stem 분리 모델 목록을 반환합니다.
	"""
	models = [
		{
			"id": "demucs:4stems",
			"name": "4 Stems (Vocals + Drums + Bass + Other)",
			"description": "보컬, 드럼, 베이스, 기타 음원을 분리합니다.",
			"stems": ["vocals", "drums", "bass", "other"]
		},
		{
			"id": "demucs:5stems",
			"name": "5 Stems (Vocals + Drums + Bass + Piano + Other)", 
			"description": "보컬, 드럼, 베이스, 피아노, 기타 음원을 분리합니다.",
			"stems": ["vocals", "drums", "bass", "piano", "other"]
		}
	]
	
	if not _DEMUCS_AVAILABLE:
		return {
			"available": False, 
			"models": models, 
			"message": "Demucs가 설치되지 않았습니다. pip install demucs를 실행하세요."
		}
	
	return {"available": True, "models": models}


# ----------------------
# Vocal-based score generation API
# ----------------------

def _hz_to_midi(hz: float) -> Optional[int]:
	try:
		if hz <= 0 or not math.isfinite(hz):
			return None
		return int(round(69 + 12 * math.log2(hz / 440.0)))
	except Exception:
		return None


@app.post("/api/audio/generate-score")
async def generate_score(
	file: UploadFile = File(...),
	model: str = "demucs:4stems",
	min_note_ms: int = 120,
	voicing_thresh: float = 0.6,
):
	"""
	보컬 기준 악보 생성: Demucs로 보컬 추출 → f0 추정(librosa.pyin) → MIDI + MusicXML 생성하여 ZIP 반환
	"""
	if not _DEMUCS_AVAILABLE:
		raise HTTPException(status_code=500, detail="Demucs가 설치되지 않았습니다.")

	# temp workspace
	tmp_dir = Path(tempfile.mkdtemp(prefix="score_"))
	input_path = tmp_dir / (Path(file.filename).name or "input")
	stems_dir = tmp_dir / "stems"
	stems_dir.mkdir(exist_ok=True)

	try:
		start_ts = time.time()
		def tlog(msg: str):
			print(f"[score {datetime.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

		tlog("received request: saving upload…")
		# save upload
		with input_path.open("wb") as f:
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				f.write(chunk)

		# run demucs to extract vocals only (faster: specify two-stem? demucs doesn't support 2-stem default, so extract all and take vocals)
		from demucs import separate as demucs_separate
		demucs_model = "htdemucs" if "4stems" in model else "htdemucs_ft"
		tlog(f"running Demucs (-n {demucs_model})…")
		cmd = [
			"python", "-m", "demucs.separate",
			"-n", demucs_model,
			"-d", "cpu",
			"-o", str(stems_dir),
			str(input_path),
		]
		proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="ignore")
		if proc.returncode != 0:
			tail = (proc.stderr or "")[-2000:]
			tlog("Demucs failed:\n" + tail)
			raise HTTPException(status_code=500, detail="Demucs 실행 실패")

		# find vocals wav
		vocals_path = None
		for p in stems_dir.rglob("*.wav"):
			if p.stem.lower() == "vocals":
				vocals_path = p
				break
		if not vocals_path:
			tlog("no vocals.wav found in Demucs output")
			raise HTTPException(status_code=500, detail="보컬 파일을 찾지 못했습니다.")
		tlog(f"found vocals: {vocals_path.name}")

		# f0 estimation with librosa.pyin
		import librosa
		import numpy as np
		tlog("loading vocals and estimating f0 (pyin)…")
		y, sr = librosa.load(str(vocals_path), sr=22050, mono=True)
		frame_length = 2048
		hop_length = 256
		f0, voiced_flag, _ = librosa.pyin(y, fmin=librosa.note_to_hz('C2'), fmax=librosa.note_to_hz('C7'), sr=sr, frame_length=frame_length, hop_length=hop_length)
		times = librosa.times_like(f0, sr=sr, hop_length=hop_length)

		# Build note events from f0 sequence
		min_frames = max(1, int((min_note_ms / 1000.0) * sr / hop_length))
		events = []  # (start_time, end_time, midi_note)
		cur_note = None
		cur_start = 0.0
		last_idx = 0
		for idx, (hz, voiced) in enumerate(zip(f0, voiced_flag)):
			midi = _hz_to_midi(hz if voiced else 0.0)
			if cur_note is None:
				cur_note = midi
				cur_start = float(times[idx])
				last_idx = idx
				continue
			# change detection
			if midi != cur_note:
				length_frames = idx - last_idx
				if cur_note is not None and length_frames >= min_frames:
					events.append((cur_start, float(times[idx]), int(cur_note)))
				cur_note = midi
				cur_start = float(times[idx])
				last_idx = idx
		# flush
		if cur_note is not None and (len(times) - 1 - last_idx) >= min_frames:
			events.append((cur_start, float(times[-1]), int(cur_note)))

		# Create MIDI using mido
		from mido import Message, MidiFile, MidiTrack, bpm2tempo
		midi = MidiFile()
		track = MidiTrack(); midi.tracks.append(track)
		tempo = bpm2tempo(120)
		track.append(Message('program_change', program=0, time=0))
		# time mapping
		ticks_per_beat = midi.ticks_per_beat
		seconds_to_ticks = lambda s: int(round((s * 1_000_000) / tempo * ticks_per_beat))
		current_tick = 0
		for start, end, n in events:
			start_ticks = seconds_to_ticks(start)
			delta = max(0, start_ticks - current_tick)
			track.append(Message('note_on', note=int(n), velocity=80, time=delta))
			dur_ticks = max(1, seconds_to_ticks(max(0.01, end - start)))
			track.append(Message('note_off', note=int(n), velocity=64, time=dur_ticks))
			current_tick = start_ticks + dur_ticks
		midi_path = tmp_dir / "vocal_melody.mid"
		midi.save(str(midi_path))
		tlog(f"MIDI written: {midi_path.name}")

		# Convert MIDI to MusicXML via music21
		from music21 import converter
		s = converter.parse(str(midi_path))
		musicxml_path = tmp_dir / "vocal_melody.musicxml"
		s.write('musicxml', fp=str(musicxml_path))
		tlog(f"MusicXML written: {musicxml_path.name}")

		# Try to render PDF from MusicXML using MuseScore, if available
		pdf_path = tmp_dir / "vocal_melody.pdf"
		musescore_candidates = [
			shutil.which("MuseScore4.exe"),
			shutil.which("MuseScore3.exe"),
			shutil.which("MuseScore.exe"),
			shutil.which("musescore4.exe"),
			shutil.which("musescore3.exe"),
			shutil.which("musescore.exe"),
			shutil.which("mscore.exe"),
		]
		musescore_exe = next((p for p in musescore_candidates if p), None)
		if musescore_exe and Path(musescore_exe).exists():
			try:
				# MuseScore CLI: musescore -o out.pdf in.musicxml
				cmd_pdf = [musescore_exe, "-o", str(pdf_path), str(musicxml_path)]
				proc_pdf = subprocess.run(cmd_pdf, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding="utf-8", errors="ignore")
				if proc_pdf.returncode == 0 and pdf_path.exists():
					tlog(f"PDF rendered with MuseScore: {pdf_path.name}")
				else:
					tlog("MuseScore PDF render failed, continuing without PDF.")
			except Exception as _:
				tlog("MuseScore not usable for PDF rendering; skipping.")
		else:
			# Fallback: Verovio (MusicXML->SVG) + CairoSVG (SVG->PDF)
			try:
				from verovio import toolkit as vr_toolkit
				import cairosvg
				# Configure Verovio (A4-ish page, auto height, reasonable scale)
				tk = vr_toolkit.Toolkit()
				tk.setOptions({
					"pageHeight": 2970,   # ~ A4 at 10 units/mm
					"pageWidth": 2100,
					"adjustPageHeight": True,
					"scale": 50
				})
				ok = tk.loadFile(str(musicxml_path))
				if not ok:
					raise RuntimeError("Verovio failed to load MusicXML")
				svg = tk.renderToSVG(1)
				# For multi-page, one could loop pages = krn.getPageCount(); here single page for brevity
				cairosvg.svg2pdf(bytestring=svg.encode('utf-8'), write_to=str(pdf_path))
				tlog(f"PDF rendered with Verovio/CairoSVG: {pdf_path.name}")
			except Exception as _:
				tlog("No MuseScore; Verovio/CairoSVG fallback failed or not installed. PDF skipped.")

		# Zip
		zip_path = tmp_dir / "vocal_score.zip"
		import zipfile
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
			zipf.write(midi_path, midi_path.name)
			zipf.write(musicxml_path, musicxml_path.name)
			if pdf_path.exists():
				zipf.write(pdf_path, pdf_path.name)
		total = time.time() - start_ts
		mins = int(total // 60); secs = int(total % 60)
		tlog(f"score done in {mins}m {secs}s ({total:.1f}s)")

		return FileResponse(path=str(zip_path), filename=f"{Path(input_path).stem}_vocal_score.zip", media_type="application/zip")

	except HTTPException:
		shutil.rmtree(tmp_dir, ignore_errors=True)
		raise
	except Exception as e:
		shutil.rmtree(tmp_dir, ignore_errors=True)
		raise HTTPException(status_code=500, detail=str(e))
if __name__ == "__main__":
	import uvicorn
	uvicorn.run(app, host="0.0.0.0", port=8000, lifespan="off")