from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path
import subprocess
import tempfile
import shutil
import json
from typing import Dict, Any, Optional

from services.files import create_temp_dir, safe_rmtree, safe_unlink
from services.ffmpeg import resolve_binaries

router = APIRouter()

_FFMPEG_EXE, _FFPROBE_EXE = resolve_binaries()


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


@router.post("/audio/measure-lufs")
async def measure_lufs(file: UploadFile = File(...)):
	if not _FFMPEG_EXE or (Path(_FFMPEG_EXE).exists() is False and shutil.which(_FFMPEG_EXE) is None):
		raise HTTPException(status_code=500, detail="ffmpeg 실행 파일을 찾을 수 없습니다. ffmpeg 또는 imageio-ffmpeg를 설치하세요.")

	# Save upload to temp file
	tmp_dir = create_temp_dir("lufs_measure_")
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
			safe_unlink(input_path)
			safe_rmtree(tmp_dir)
		except Exception:
			pass


@router.post("/audio/normalize")
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

	tmp_dir = create_temp_dir("normalize_")
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
				safe_unlink(output_path)
				safe_unlink(input_path)
				safe_rmtree(tmp_dir)
			except Exception:
				pass

		bg.add_task(_cleanup)
		return FileResponse(path=str(output_path), filename=str(output_path.name), media_type="audio/wav")

	except HTTPException:
		safe_rmtree(tmp_dir)
		raise
	except Exception as e:
		safe_rmtree(tmp_dir)
		raise HTTPException(status_code=500, detail=str(e))
