from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import subprocess
import tempfile
import shutil
import threading
import zipfile
from typing import Dict, Any

from services.jobs import job_get, job_set, job_update, job_pop

router = APIRouter()

try:
	from demucs import separate  # noqa: F401
	_DEMUCS_AVAILABLE = True
except Exception:
	_DEMUCS_AVAILABLE = False

# ffmpeg presence is checked to align with original behavior
import shutil as _sh
_FFMPEG_EXE = _sh.which("ffmpeg") or "ffmpeg"


def _job_log(job_id: str, message: str) -> None:
	print(f"[stem:{job_id}] {message}", flush=True)
	from services.jobs import job_append_log
	job_append_log(job_id, message)


def _run_stem_separation(job_id: str, input_path: Path, output_dir: Path, model: str):
	try:
		_job_log(job_id, f"Job queued. Input: {input_path.name}")
		job_update(job_id, {"status": "running", "progress": 0.1, "eta": None})
		_job_log(job_id, "Preparing Demucs...")

		job_update(job_id, {"progress": 0.3})

		from demucs import separate  # ensure import inside thread
		_job_log(job_id, "Demucs module imported.")
		job_update(job_id, {"progress": 0.5})

		demucs_model = "htdemucs" if "4stems" in model else "htdemucs_ft"
		_job_log(job_id, f"Selected model: {demucs_model}")

		cmd = [
			"python", "-m", "demucs.separate",
			"-n", demucs_model,
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
		while True:
			line = proc.stderr.readline()
			if not line and proc.poll() is not None:
				break
			if not line:
				continue
			lower = line.lower()
			if any(key in lower for key in ["loading", "separating", "running", "saving", "done"]):
				_job_log(job_id, line.strip())
		proc.wait()
		if proc.returncode != 0:
			raise RuntimeError("Demucs process failed. See logs above.")

		_job_log(job_id, "Collecting separated stems...")
		stem_files: Dict[str, str] = {}
		for stem_file in output_dir.rglob("*.wav"):
			name = stem_file.stem
			if name.lower() in {"vocals", "drums", "bass", "other", "piano"}:
				new_path = output_dir / f"{name}.wav"
				try:
					if stem_file.resolve() != new_path.resolve():
						shutil.copy2(stem_file, new_path)
					stem_files[name] = str(new_path)
				except Exception:
					pass
		for sub in output_dir.iterdir():
			if sub.is_dir():
				shutil.rmtree(sub, ignore_errors=True)

		zip_path = output_dir.parent / "stems.zip"
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
			for stem_name, stem_path in stem_files.items():
				zipf.write(stem_path, f"{stem_name}.wav")
		_job_log(job_id, f"Created ZIP: {zip_path.name}")

		job_update(job_id, {"status": "completed", "progress": 1.0, "zip_path": str(zip_path)})
		_job_log(job_id, "Job completed successfully.")
	except Exception as e:
		job_update(job_id, {"status": "failed", "error": str(e)})
		_job_log(job_id, f"Job failed: {e}")


@router.post("/audio/separate-stems")
async def separate_stems(
	file: UploadFile = File(...),
	model: str = "demucs:4stems",
):
	if not _DEMUCS_AVAILABLE:
		raise HTTPException(status_code=500, detail="Demucs가 설치되지 않았습니다. pip install demucs를 실행하세요.")
	if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
		raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다.")

	tmp_dir = Path(tempfile.mkdtemp(prefix="stem_separation_"))
	input_path = tmp_dir / (Path(file.filename).name or "input")
	output_dir = tmp_dir / "stems"
	try:
		with input_path.open("wb") as f:
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				f.write(chunk)
		output_dir.mkdir(exist_ok=True)

		import uuid
		job_id = str(uuid.uuid4())
		job_set(job_id, {
			"status": "queued",
			"progress": 0.0,
			"tmp_dir": str(tmp_dir),
			"input_path": str(input_path),
			"output_dir": str(output_dir),
			"model": model,
			"error": None,
		})

		thread = threading.Thread(target=_run_stem_separation, args=(job_id, input_path, output_dir, model), daemon=True)
		thread.start()
		return {"job_id": job_id}
	except Exception as e:
		shutil.rmtree(tmp_dir, ignore_errors=True)
		raise HTTPException(status_code=500, detail=f"Stem 분리 시작 실패: {str(e)}")


@router.get("/audio/stem-separation/progress")
def stem_separation_progress(job_id: str = Query(...)):
	job = job_get(job_id)
	if not job:
		return JSONResponse({"error": "job not found"}, status_code=404)
	return {
		"status": job.get("status"),
		"progress": job.get("progress"),
		"error": job.get("error"),
		"logs": job.get("logs", [])[-100:],
		"eta": job.get("eta"),
	}


@router.get("/audio/stem-separation/result")
def stem_separation_result(bg: BackgroundTasks, job_id: str = Query(...)):
	job = job_get(job_id)
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
			job_pop(job_id)
			if zip_path.exists():
				zip_path.unlink()
			if input_path.exists():
				input_path.unlink()
			if tmp_dir.exists():
				shutil.rmtree(tmp_dir, ignore_errors=True)
		except Exception:
			pass

	bg.add_task(_cleanup)
	model_name = model.replace("spleeter:", "").replace("-16kHz", "")
	filename = f"stems_{Path(input_path).stem or 'output'}_{model_name}.zip"
	return FileResponse(path=str(zip_path), filename=filename, media_type="application/zip")


@router.get("/audio/stem-models")
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
