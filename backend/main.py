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
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if not job:
				return
			job["status"] = "running"
			job["progress"] = 0.1

		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["progress"] = 0.3
		
		# Demucs로 stem 분리 실행
		# Demucs는 직접 파일을 처리하고 결과를 지정된 디렉터리에 저장합니다
		from demucs import separate
		
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
		
		# Demucs로 분리 실행
		separate.main([
			"--model", demucs_model,
			"--device", "cpu",
			"--out", str(output_dir),
			str(input_path)
		])
		
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["progress"] = 0.8
		
		# Demucs는 모델명 폴더 안에 결과를 저장하므로 찾아서 이동
		model_folder = output_dir / demucs_model
		if model_folder.exists():
			stem_files = {}
			for stem_file in model_folder.glob("*.wav"):
				stem_name = stem_file.stem
				new_path = output_dir / f"{stem_name}.wav"
				stem_file.rename(new_path)
				stem_files[stem_name] = str(new_path)
			
			# 모델 폴더 삭제
			import shutil
			shutil.rmtree(model_folder, ignore_errors=True)
		else:
			# 폴더가 없으면 직접 찾기
			stem_files = {}
			for stem_file in output_dir.glob("*.wav"):
				stem_name = stem_file.stem
				stem_files[stem_name] = str(stem_file)

		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["progress"] = 0.9

		# ZIP 파일로 압축
		zip_path = output_dir.parent / "stems.zip"
		import zipfile
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
			for stem_name, stem_path in stem_files.items():
				zipf.write(stem_path, f"{stem_name}.wav")

		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["status"] = "completed"
				job["progress"] = 1.0
				job["zip_path"] = str(zip_path)

	except Exception as e:
		with _JOB_LOCK:
			job = _JOBS.get(job_id)
			if job:
				job["status"] = "failed"
				job["error"] = str(e)


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


if __name__ == "__main__":
	import uvicorn
	uvicorn.run(app, host="0.0.0.0", port=8000)