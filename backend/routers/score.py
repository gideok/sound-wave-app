from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import subprocess
import tempfile
import shutil
import time
import datetime
import math
import os
import zipfile
from typing import Optional

from services.files import create_temp_dir, safe_rmtree

router = APIRouter()

try:
	from demucs import separate  # noqa: F401
	_DEMUCS_AVAILABLE = True
except Exception:
	_DEMUCS_AVAILABLE = False


def _hz_to_midi(hz: float) -> Optional[int]:
	try:
		if hz <= 0 or not math.isfinite(hz):
			return None
		return int(round(69 + 12 * math.log2(hz / 440.0)))
	except Exception:
		return None


@router.post("/audio/generate-score")
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
	tmp_dir = create_temp_dir("score_")
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

		# Convert MIDI to MusicXML via music21 (optional)
		musicxml_path = None
		try:
			from music21 import converter  # type: ignore
			s = converter.parse(str(midi_path))
			musicxml_path = tmp_dir / "vocal_melody.musicxml"
			s.write('musicxml', fp=str(musicxml_path))
			tlog(f"MusicXML written: {musicxml_path.name}")
		except Exception as _:
			tlog("music21 not available; skipping MusicXML generation.")

		# Try to render PDF from MusicXML using MuseScore or Verovio/CairoSVG if MusicXML exists
		pdf_path = tmp_dir / "vocal_melody.pdf"
		if musicxml_path and Path(musicxml_path).exists():
			tlog("attempting PDF generation from MusicXML...")
			
			# Try MuseScore first
			musescore_candidates = [
				shutil.which("MuseScore4.exe"),
				shutil.which("MuseScore3.exe"), 
				shutil.which("MuseScore.exe"),
				shutil.which("musescore4"),
				shutil.which("musescore3"),
				shutil.which("musescore"),
				shutil.which("mscore"),
			# Additional Windows paths
			r"C:\Program Files\MuseScore 4\bin\MuseScore4.exe",
			r"C:\Program Files\MuseScore 3\bin\MuseScore3.exe",
			r"C:\Program Files (x86)\MuseScore 4\bin\MuseScore4.exe",
			r"C:\Program Files (x86)\MuseScore 3\bin\MuseScore3.exe",
			# Portable MuseScore locations
			str(Path.cwd() / "MuseScore4" / "MuseScore4.exe"),
			str(Path.cwd() / "MuseScore3" / "MuseScore3.exe"),
			]
			
			musescore_exe = None
			for candidate in musescore_candidates:
				if candidate and Path(candidate).exists():
					musescore_exe = candidate
					break
			
			if musescore_exe:
				try:
					tlog(f"trying MuseScore at: {musescore_exe}")
					# MuseScore CLI: musescore -o out.pdf in.musicxml
					cmd_pdf = [musescore_exe, "-o", str(pdf_path), str(musicxml_path)]
					# Run MuseScore in headless/offscreen mode where possible to avoid GUI issues
					env = os.environ.copy()
					env.setdefault("QT_QPA_PLATFORM", "offscreen")
					proc_pdf = subprocess.run(
						cmd_pdf, 
						stdout=subprocess.PIPE, 
						stderr=subprocess.PIPE, 
						text=True, 
						encoding="utf-8", 
						errors="ignore",
						timeout=60,  # 60 second timeout
						cwd=str(tmp_dir),
						env=env,
					)
					if proc_pdf.returncode == 0 and pdf_path.exists():
						tlog(f"PDF rendered with MuseScore: {pdf_path.name}")
					else:
						tlog(f"MuseScore failed (code {proc_pdf.returncode}): {proc_pdf.stderr}")
						tlog("trying fallback methods...")
				except subprocess.TimeoutExpired:
					tlog("MuseScore timed out, trying fallback...")
				except Exception as e:
					tlog(f"MuseScore error: {e}, trying fallback...")
			else:
				tlog("MuseScore not found, trying fallback methods...")
			
			# Fallback: Verovio (MusicXML->SVG) + CairoSVG (SVG->PDF)
			if not pdf_path.exists():
				try:
					tlog("trying Verovio + CairoSVG...")
					from verovio import toolkit as vr_toolkit  # type: ignore
					import cairosvg  # type: ignore
					
					# Configure Verovio (A4-ish page, auto height, reasonable scale)
					tk = vr_toolkit.Toolkit()
					tk.setOptions({
						"pageHeight": 2970,   # ~ A4 at 10 units/mm
						"pageWidth": 2100,
						"adjustPageHeight": True,
						"scale": 50,
						"header": "none",
						"footer": "none"
					})
					
					ok = tk.loadFile(str(musicxml_path))
					if not ok:
						raise RuntimeError("Verovio failed to load MusicXML")
					
					svg = tk.renderToSVG(1)
					if not svg:
						raise RuntimeError("Verovio failed to render SVG")
					
					# Convert SVG(s) to a multi-page PDF when needed
					try:
						page_count = getattr(tk, 'getPageCount', lambda: 1)()
					except Exception:
						page_count = 1

					if page_count <= 1:
						# Single page direct convert
						cairosvg.svg2pdf(bytestring=svg.encode('utf-8'), write_to=str(pdf_path))
					else:
						# Multi-page: render each SVG page to PNG then compose a PDF with reportlab
						from io import BytesIO
						from reportlab.pdfgen import canvas as rl_canvas  # type: ignore
						from reportlab.lib.pagesizes import A4  # type: ignore
						from reportlab.lib.utils import ImageReader  # type: ignore
						pdf_buf = BytesIO()
						c = rl_canvas.Canvas(str(pdf_path), pagesize=A4)
						page_w, page_h = A4
						margin = 36  # 0.5 inch margins
						max_w = page_w - margin * 2
						max_h = page_h - margin * 2
						for p in range(1, page_count + 1):
							svg_p = tk.renderToSVG(p)
							png_bytes = cairosvg.svg2png(bytestring=svg_p.encode('utf-8'))
							img = ImageReader(BytesIO(png_bytes))
							# Get image size
							img_w, img_h = img.getSize()
							# Fit to page respecting aspect
							scale = min(max_w / img_w, max_h / img_h)
							draw_w = img_w * scale
							draw_h = img_h * scale
							x = (page_w - draw_w) / 2
							y = (page_h - draw_h) / 2
							c.drawImage(img, x, y, width=draw_w, height=draw_h)
							if p < page_count:
								c.showPage()
						c.save()

					if pdf_path.exists():
						tlog(f"PDF rendered with Verovio/CairoSVG: {pdf_path.name} (pages={page_count})")
					else:
						raise RuntimeError("PDF file not created")
						
				except ImportError as e:
					tlog(f"Verovio/CairoSVG not available: {e}")
					tlog("install with: pip install verovio cairosvg")
				except Exception as e:
					tlog(f"Verovio/CairoSVG failed: {e}")
			
			# Final fallback: Simple HTML-based PDF using weasyprint or reportlab
			if not pdf_path.exists():
				try:
					tlog("trying simple HTML-to-PDF conversion...")
					
					# Create a simple HTML representation of the MIDI data
					html_content = f"""
					<!DOCTYPE html>
					<html>
					<head>
						<title>Vocal Score</title>
						<style>
							body {{ font-family: Arial, sans-serif; margin: 20px; }}
							.note {{ display: inline-block; margin: 2px; padding: 4px; border: 1px solid #ccc; }}
							.measure {{ margin: 10px 0; }}
						</style>
					</head>
					<body>
						<h1>Vocal Score</h1>
						<p>Generated from: {Path(input_path).name}</p>
						<p>MIDI file: {midi_path.name}</p>
						{f'<p>MusicXML file: {Path(musicxml_path).name}</p>' if musicxml_path else ''}
						<p>This is a simplified representation. Please use the MIDI or MusicXML files with music notation software for full score display.</p>
						
						<div class="notes">
							<p><strong>Note:</strong> Install MuseScore for better PDF generation:</p>
							<ul>
								<li>Download from <a href="https://musescore.org">https://musescore.org</a></li>
								<li>Or install Verovio/CairoSVG: <code>pip install verovio cairosvg</code></li>
							</ul>
						</div>
					</body>
					</html>
					"""
					
					# Try weasyprint first
					try:
						import weasyprint  # type: ignore
						weasyprint.HTML(string=html_content).write_pdf(str(pdf_path))
						if pdf_path.exists():
							tlog(f"PDF created with weasyprint: {pdf_path.name}")
					except ImportError:
						# Fallback to wkhtmltopdf if available
						try:
							import pdfkit  # type: ignore
							pdfkit.from_string(html_content, str(pdf_path))
							if pdf_path.exists():
								tlog(f"PDF created with wkhtmltopdf: {pdf_path.name}")
						except ImportError:
							# Last resort: create a text-based PDF with reportlab
							try:
								from reportlab.pdfgen import canvas  # type: ignore
								from reportlab.lib.pagesizes import letter  # type: ignore
								
								c = canvas.Canvas(str(pdf_path), pagesize=letter)
								width, height = letter
								
								c.drawString(50, height - 50, f"Vocal Score - {Path(input_path).name}")
								c.drawString(50, height - 80, f"Generated MIDI: {midi_path.name}")
								if musicxml_path:
									c.drawString(50, height - 110, f"Generated MusicXML: {Path(musicxml_path).name}")
								
								c.drawString(50, height - 150, "This is a placeholder PDF.")
								c.drawString(50, height - 180, "Please use the MIDI or MusicXML files with music notation software.")
								c.drawString(50, height - 210, "For better PDF generation, install MuseScore from https://musescore.org")
								
								c.save()
								if pdf_path.exists():
									tlog(f"Basic PDF created with reportlab: {pdf_path.name}")
							except ImportError:
								tlog("No PDF generation libraries available. Install: pip install reportlab weasyprint")
								
				except Exception as e:
					tlog(f"Simple PDF generation failed: {e}")
		
		if not pdf_path.exists():
			tlog("PDF generation failed with all methods. ZIP will contain MIDI and MusicXML only.")
		else:
			tlog(f"PDF successfully generated: {pdf_path.stat().st_size} bytes")

		# Zip
		zip_path = tmp_dir / "vocal_score.zip"
		with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
			zipf.write(midi_path, midi_path.name)
			if musicxml_path and Path(musicxml_path).exists():
				zipf.write(musicxml_path, Path(musicxml_path).name)
			if pdf_path.exists():
				zipf.write(pdf_path, pdf_path.name)
		total = time.time() - start_ts
		mins = int(total // 60); secs = int(total % 60)
		tlog(f"score done in {mins}m {secs}s ({total:.1f}s)")

		return FileResponse(path=str(zip_path), filename=f"{Path(input_path).stem}_vocal_score.zip", media_type="application/zip")

	except HTTPException:
		safe_rmtree(tmp_dir)
		raise
	except Exception as e:
		safe_rmtree(tmp_dir)
		raise HTTPException(status_code=500, detail=str(e))
