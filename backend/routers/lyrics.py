from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
from pathlib import Path
import subprocess
import tempfile
import shutil
import time
import datetime
import zipfile
import importlib
import re
import string

from services.files import create_temp_dir, safe_rmtree
from services.ffmpeg import resolve_binaries

router = APIRouter()

_FFMPEG_EXE, _FFPROBE_EXE = resolve_binaries()

try:
	from demucs import separate  # noqa: F401
	_DEMUCS_AVAILABLE = True
except Exception:
	_DEMUCS_AVAILABLE = False


def _write_lrc(segments, path: Path):
	# Write with UTF-8 BOM to improve compatibility with default Windows editors
	with path.open('w', encoding='utf-8-sig') as f:
		for seg in segments:
			start = seg['start']
			m = int(start // 60)
			s = int(start % 60)
			cs = int((start - int(start)) * 100)
			ts = f"[{m:02d}:{s:02d}.{cs:02d}]"
			f.write(ts + seg['text'].strip() + "\n")


@router.post("/audio/extract-lyrics")
async def extract_lyrics(
	file: UploadFile = File(...),
	language: str = Form("auto"),  # auto | ko | en
	model_size: str = Form("small"),  # tiny|base|small|medium|large-v3
	boost_vocals: bool = Form(True),
	return_lrc_only: bool = Form(False),
):
	"""Separate vocals with Demucs then transcribe using Faster-Whisper with robust settings.
	Returns ZIP (.lrc + .txt). Set boost_vocals=True to pre-filter/normalize for better recall.
	"""
	if not _DEMUCS_AVAILABLE:
		raise HTTPException(status_code=500, detail="Demucs가 설치되지 않았습니다.")

	work = create_temp_dir("lyrics_")
	input_path = work / (Path(file.filename).name or "input")
	out_dir = work / "out"; out_dir.mkdir(exist_ok=True)
	try:
		start_ts = time.time()
		def tlog(msg: str):
			print(f"[lyrics {datetime.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)
		tlog(f"starting lyrics extraction (model={model_size}, lang={language}, boost={boost_vocals})")
		# save upload
		with input_path.open('wb') as f:
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				f.write(chunk)

		# demucs vocals
		vocals_wav = out_dir / "vocals.wav"
		cmd = ["python", "-m", "demucs.separate", "-n", "htdemucs", "-d", "cpu", "-o", str(out_dir), str(input_path)]
		proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
		if proc.returncode != 0:
			raise HTTPException(status_code=500, detail="Demucs 실행 실패")
		# locate vocals
		found = None
		for p in out_dir.rglob('*.wav'):
			if p.stem.lower() == 'vocals':
				found = p; break
		if not found:
			raise HTTPException(status_code=500, detail="보컬 파일을 찾지 못했습니다.")

		# optional pre-processing to boost vocal intelligibility
		clean_path = out_dir / "clean.wav"
		if boost_vocals:
			# bandpass + de-ess-ish high shelf, normalize
			ff = [
				_FFMPEG_EXE, "-y", "-i", str(found),
				"-af",
				"highpass=f=100, lowpass=f=8000, acompressor=threshold=-20dB:ratio=3:attack=5:release=50, loudnorm=I=-16:TP=-1.5:LRA=11",
				"-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(clean_path)
			]
			proc2 = subprocess.run(ff, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
			if proc2.returncode == 0 and clean_path.exists():
				audio_for_asr = str(clean_path)
			else:
				audio_for_asr = str(found)
		else:
			audio_for_asr = str(found)

		# transcribe with robust settings
		try:
			fw = importlib.import_module("faster_whisper")
			WhisperModel = getattr(fw, "WhisperModel")
		except Exception:
			raise HTTPException(status_code=500, detail="faster-whisper가 설치되지 않았습니다. pip install faster-whisper")
		device = "cuda" if shutil.which("nvidia-smi") else "cpu"
		compute_type = "int8" if device == "cpu" else "float16"
		model = WhisperModel(model_size, device=device, compute_type=compute_type)
		lang = None
		if language.lower() in ("ko", "en"):
			lang = language.lower()
		vad_params = {"min_silence_duration_ms": 200}
		segments, info = model.transcribe(
			audio_for_asr,
			language=lang,
			vad_filter=True,
			vad_parameters=vad_params,
			beam_size=5,
			temperature=[0.0, 0.2, 0.4],
			patience=0.1,
			best_of=5,
			no_speech_threshold=0.4,
			condition_on_previous_text=True,
			word_timestamps=False,
			chunk_length=30,
			prepend_punctuations='¿([{"\'""',
			append_punctuations='。．！!?,。',
		)

		seg_list = []
		full_text = []
		for seg in segments:
			text = seg.text or ""
			seg_list.append({"start": float(seg.start or 0.0), "end": float(seg.end or 0.0), "text": text})
			full_text.append(text)

		# Fallback retry without Demucs/VAD if we captured too little text
		if len(" ".join(full_text).strip()) < 10:
			segments2, _ = model.transcribe(str(input_path), language=lang, vad_filter=False, beam_size=5, temperature=[0.0,0.2,0.4], chunk_length=30)
			seg_list = []
			full_text = []
			for seg in segments2:
				text = seg.text or ""
				seg_list.append({"start": float(seg.start or 0.0), "end": float(seg.end or 0.0), "text": text})
				full_text.append(text)

		lrc_path = work / "lyrics.lrc"
		txt_path = work / "lyrics.txt"
		_write_lrc(seg_list, lrc_path)
		with txt_path.open('w', encoding='utf-8') as f:
			f.write(" ".join(full_text).strip())

		zip_path = work / "lyrics.zip"
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
			zipf.write(lrc_path, lrc_path.name)
			zipf.write(txt_path, txt_path.name)

		if return_lrc_only and lrc_path.exists():
			tlog("returning LRC only")
			# Explicit charset for safer rendering on clients
			return FileResponse(
				path=str(lrc_path),
				filename=f"{Path(input_path).stem}.lrc",
				media_type="text/plain; charset=utf-8",
				headers={"Content-Type": "text/plain; charset=utf-8"},
			)
		elapsed = time.time() - start_ts
		mins = int(elapsed // 60); secs = int(elapsed % 60)
		tlog(f"lyrics extraction done in {mins}m {secs}s ({elapsed:.1f}s)")
		return FileResponse(path=str(zip_path), filename=f"{Path(input_path).stem}_lyrics.zip", media_type="application/zip")
	except HTTPException:
		safe_rmtree(work)
		raise
	except Exception as e:
		safe_rmtree(work)
		raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio/align-lyrics")
async def align_lyrics(
	file: UploadFile = File(...),  # audio file
	lyrics_text: str = Form(...),  # plain text lyrics provided by user
	language: str = Form("auto"),
	model_size: str = Form("small"),
):
	"""Align user-provided lyrics to audio and produce an .lrc file. Terminal logs include step-by-step progress."""
	work = create_temp_dir("align_")
	input_path = work / (Path(file.filename).name or "input")
	zip_path = work / "aligned_output.zip"
	try:
		start_ts = time.time()
		def tlog(msg: str):
			print(f"[align {datetime.datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)

		tlog("saving upload…")
		with input_path.open('wb') as f:
			while True:
				chunk = await file.read(1024 * 1024)
				if not chunk:
					break
				f.write(chunk)

		# pre-process: mono 16k for stable alignment
		proc_path = work / "proc.wav"
		cmd = [_FFMPEG_EXE, "-y", "-i", str(input_path), "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(proc_path)]
		proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='ignore')
		if proc.returncode != 0:
			tlog("ffmpeg preprocessing failed")
			raise HTTPException(status_code=500, detail="오디오 전처리 실패")
		tlog("audio preprocessed to 16k mono")

		# Transcribe with timestamps (word-level is optional; line-level sufficient)
		try:
			fw = importlib.import_module("faster_whisper")
			WhisperModel = getattr(fw, "WhisperModel")
		except Exception:
			raise HTTPException(status_code=500, detail="faster-whisper가 설치되지 않았습니다. pip install faster-whisper")
		device = "cuda" if shutil.which("nvidia-smi") else "cpu"
		compute_type = "int8" if device == "cpu" else "float16"
		model = WhisperModel(model_size, device=device, compute_type=compute_type)
		lang = None
		if language.lower() in ("ko", "en"):
			lang = language.lower()
		tlog("transcribing audio for alignment…")
		segments, _ = model.transcribe(
			str(proc_path),
			language=lang,
			vad_filter=False,
			word_timestamps=True,
			chunk_length=30,  # Smaller chunks for better word-level accuracy
			condition_on_previous_text=True,
			beam_size=5,
			temperature=[0.0, 0.1, 0.2],  # Lower temperatures for more consistent output
			no_speech_threshold=0.25,  # Lower threshold to catch more speech
			compression_ratio_threshold=2.0,  # Avoid over-compression
			log_prob_threshold=-1.0,  # More permissive log probability
		)

		# Collect word-level anchors across the whole track
		word_times = []  # list of (start, text)
		seg_list = list(segments)
		for seg in seg_list:
			if getattr(seg, 'words', None):
				for w in seg.words:
					if w and (w.start is not None) and (w.word is not None):
						word_times.append((float(w.start), str(w.word)))
			else:
				# fallback to segment start if word timing not available
				word_times.append((float(seg.start or 0.0), seg.text or ""))
		
		tlog(f"collected {len(word_times)} word timing anchors from {len(seg_list)} segments")
		if word_times:
			tlog(f"first few words: {word_times[:5]}")
			tlog(f"last few words: {word_times[-5:]}")

		# Build alignment using improved word-level matching
		lines = [ln.strip() for ln in lyrics_text.splitlines() if ln.strip()]
		pairs = []  # (time, text)
		track_end = float(seg_list[-1].end or 0.0) if seg_list else 0.0
		
		if not word_times:
			# Fallback: map to segment starts, spread remaining lines to the end
			anchors = [float(s.start or 0.0) for s in seg_list] if seg_list else [0.0]
			if track_end <= 0.0 and seg_list:
				track_end = float(seg_list[-1].end or anchors[-1])
			for i, line in enumerate(lines):
				if i < len(anchors):
					pairs.append((anchors[i], line))
				else:
					remaining = len(lines) - i
					start_time = anchors[-1] if anchors else 0.0
					span = max(0.0, track_end - start_time)
					gap = max(0.35, span / max(remaining, 1))
					pairs.append((start_time + (i - (len(anchors) - 1)) * gap, line))
		else:
			# Improved alignment using word-level similarity matching
			def _normalize_text(text: str) -> str:
				"""Normalize text for better matching (lowercase, remove punctuation)"""
				return ''.join(c.lower() for c in text if c not in string.punctuation).strip()
			
			def _find_best_match(line_words: list[str], word_times: list, start_idx: int = 0) -> int:
				"""Find the best starting position in word_times for the given line words"""
				if not line_words or not word_times:
					return start_idx
				
				best_score = -1
				best_idx = start_idx
				
				# Look for the best sequence match within a reasonable window
				search_end = min(len(word_times), start_idx + len(line_words) * 3)
				for i in range(start_idx, search_end):
					if i >= len(word_times):
						break
					
					score = 0
					matches = 0
					# Check how many consecutive words match
					for j, line_word in enumerate(line_words):
						if i + j >= len(word_times):
							break
						
						transcribed_word = _normalize_text(word_times[i + j][1])
						line_word_norm = _normalize_text(line_word)
						
						# Exact match gets highest score
						if line_word_norm == transcribed_word:
							score += 10
							matches += 1
						# Partial match (contains or contained)
						elif line_word_norm in transcribed_word or transcribed_word in line_word_norm:
							score += 5
							matches += 1
						# Similar length bonus
						elif abs(len(line_word_norm) - len(transcribed_word)) <= 2:
							score += 1
					
					# Bonus for consecutive matches
					if matches > 0:
						score += matches * 2
					
					if score > best_score:
						best_score = score
						best_idx = i
				
				return best_idx
			
			def _tokenize(text: str) -> list[str]:
				"""Split text into words, handling various punctuation"""
				words = re.findall(r'\b\w+\b', text.lower())
				return [w for w in words if w]
			
			# Process each line with improved matching
			used_positions = set()
			current_search_start = 0
			
			tlog(f"aligning {len(lines)} lyrics lines with {len(word_times)} word anchors")
			
			for i, line in enumerate(lines):
				line_words = _tokenize(line)
				
				if not line_words:
					# Empty line, use time interpolation
					if i == 0:
						pairs.append((0.0, line))
					elif i == len(lines) - 1:
						pairs.append((track_end, line))
					else:
						# Interpolate between previous and next
						prev_time = pairs[-1][0] if pairs else 0.0
						next_time = track_end
						pairs.append((prev_time + 1.0, line))
					tlog(f"line {i+1}: empty line -> {pairs[-1][0]:.2f}s")
					continue
				
				# Find best match position for this line
				match_idx = _find_best_match(line_words, word_times, current_search_start)
				
				# Ensure we don't go backwards (unless necessary)
				if match_idx < current_search_start and current_search_start < len(word_times):
					match_idx = current_search_start
				
				# Get timestamp from matched position
				if match_idx < len(word_times):
					timecode = word_times[match_idx][0]
					pairs.append((timecode, line))
					
					# Update search start for next line
					# Advance by estimated line length, but not too far
					advance = min(len(line_words), max(1, len(line_words) // 2))
					current_search_start = min(match_idx + advance, len(word_times) - 1)
					
					# Debug log for alignment
					matched_words = [word_times[j][1] for j in range(match_idx, min(match_idx + len(line_words), len(word_times)))]
					tlog(f"line {i+1}: '{line[:50]}' -> {timecode:.2f}s (matched: {' '.join(matched_words[:5])})")
				else:
					# Fallback: extrapolate from last known position
					if pairs:
						last_time = pairs[-1][0]
						estimated_duration = 2.0  # seconds per line fallback
						pairs.append((last_time + estimated_duration, line))
					else:
						pairs.append((0.0, line))
					tlog(f"line {i+1}: '{line[:50]}' -> {pairs[-1][0]:.2f}s (fallback)")
			
			# Post-process: ensure timestamps are monotonically increasing
			for i in range(1, len(pairs)):
				if pairs[i][0] <= pairs[i-1][0]:
					# Add small increment to maintain order
					pairs[i] = (pairs[i-1][0] + 0.5, pairs[i][1])

		lrc_path = work / "aligned_lyrics.lrc"
		with lrc_path.open('w', encoding='utf-8-sig') as f:
			for t, text in pairs:
				m = int(t // 60); s = int(t % 60); cs = int((t - int(t)) * 100)
				f.write(f"[{m:02d}:{s:02d}.{cs:02d}]" + text + "\n")
		tlog(f"lrc written: {lrc_path.name}")

		# Package ZIP with LRC and 16k mono audio used
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
			zipf.write(lrc_path, lrc_path.name)
			zipf.write(proc_path, proc_path.name)
		elapsed = time.time() - start_ts
		mins = int(elapsed // 60); secs = int(elapsed % 60)
		tlog(f"alignment done in {mins}m {secs}s ({elapsed:.1f}s)")
		return FileResponse(path=str(zip_path), filename=f"{Path(input_path).stem}_aligned.zip", media_type="application/zip")
	except HTTPException:
		safe_rmtree(work)
		raise
	except Exception as e:
		safe_rmtree(work)
		raise HTTPException(status_code=500, detail=str(e))
