# Sound Wave App

오디오 시각화, LUFS 분석/정규화, Demucs 기반 Stem 분리를 제공하는 풀스택 애플리케이션입니다.

## 구성
- 프론트엔드: React (Vite, Tailwind)
- 백엔드: FastAPI (Uvicorn)
- 오디오 처리: FFmpeg, Librosa
- Stem 분리: Demucs (PyTorch)

---

## 사전 준비
- FFmpeg (권장: 자동 번들된 imageio-ffmpeg 사용. 별도 설치 시 PATH 등록)
- Node.js (프론트엔드 개발 서버)
- Python 3.13 (프로젝트 내 가상환경 사용)

---

## 설치 및 실행 (Windows, PowerShell)

### 1) 백엔드 가상환경(venv) 준비
```powershell
cd backend
./venv/Scripts/Activate.ps1
pip install -r requirements.txt
```

### 2) 백엔드 실행 (Demucs 사용)
```powershell
python main.py
# 서버: http://localhost:8000
```
- 종료: Ctrl + C
- 종료 시 ASGI lifespan 로그를 억제하기 위해 `uvicorn.run(..., lifespan="off")` 설정됨

### 3) 프론트엔드 실행
```powershell
cd ..\frontend
npm install
npm run dev
# 개발 서버: http://localhost:5173
```

### 4) 배치 스크립트로 빠른 실행 (선택)
프로젝트 루트 제공 스크립트:
- `start_backend.bat`: 백엔드만 실행 (venv 활성화 포함)
- `start_frontend.bat`: 프론트엔드만 실행
- `start_app.bat`: 백엔드와 프론트엔드 모두 실행

---

## Demucs 기반 Stem 분리

### 사용 가능한 모델
- `demucs:4stems` → Vocals, Drums, Bass, Other
- `demucs:5stems` → Vocals, Drums, Bass, Piano, Other

백엔드는 Demucs CLI를 사용합니다:
- 모델: `-n htdemucs` 또는 `-n htdemucs_ft`
- 디바이스: `-d cpu` (GPU 있다면 추후 `cuda`로 확장 가능)
- 출력 디렉터리: `-o <output_dir>`

### 프론트엔드 동작
1) 파일 업로드 → 2) 모델 선택 → 3) Separate Stems
- 진행률과 백엔드 로그가 실시간 표시
- 완료 시 분리된 WAV들을 ZIP으로 다운로드

### 진행 로그/총 소요시간
- 백엔드 터미널에 세부 로그가 스트리밍됩니다
- 작업 완료 시 총 소요시간(분:초/초)을 출력합니다
- API 조회: `GET /api/audio/stem-separation/progress?job_id=...`
  - `status`, `progress`, `logs`, `duration_sec`, `started_at`, `ended_at`

---

## 주요 API (백엔드)
- `GET /api/status` → 서버 상태
- `GET /api/audio/stem-models` → Demucs 모델 목록
- `POST /api/audio/separate-stems?model=demucs:4stems` → Stem 분리 시작 (업로드 파일 필요)
- `GET /api/audio/stem-separation/progress?job_id=...` → 진행/로그/ETA/소요시간
- `GET /api/audio/stem-separation/result?job_id=...` → 결과 ZIP 다운로드
- `POST /api/audio/measure-lufs` → LUFS 측정
- `POST /api/audio/normalize` → 2-pass loudnorm 정규화 (WAV 반환)

---

## 자주 묻는 문제

### 1) 포트 8000 사용 중 (WinError 10048)
- 기존 백엔드 프로세스 종료 후 재시작
- 필요 시 `uvicorn.run(..., port=새포트)`로 변경

### 2) PowerShell에서 `| cat` 오류
- PowerShell의 `cat`(Get-Content)은 파일 입력용으로, 프로세스 출력과 파이프 호환이 제한됩니다.
- 대신 `| Out-Host` 또는 `| Tee-Object -FilePath backend.log` 사용 권장

### 3) 프론트엔드가 계속 로딩
- API 경로가 절대경로(`http://localhost:8000/...`)인지 확인
- CORS는 `http://localhost:5173` 허용으로 설정됨

### 4) Demucs 품질/성능 팁
- 고품질: `htdemucs_ft` / 속도: `htdemucs`
- (GPU 환경) `-d cuda` 고려
- 오버랩/시프트(TTA)/세그먼트 옵션은 추후 프로파일로 노출 예정

---

## 라이선스
본 저장소의 소스 코드는 프로젝트 목적에 맞게 사용하세요. Demucs 및 서드파티 라이브러리는 각 라이선스를 따릅니다.

# Sound Wave App

음원을 업로드하여 파형 시각화, LUFS 분석, 정규화, 그리고 **Stem 분리** 기능을 제공하는 웹 애플리케이션입니다.

## 주요 기능

### 1. 파형 시각화
- 다양한 파형 시각화 모드 (Line, Bars, Spectrum, Circular, Mirrored, RMS, 3D Wave)
- 실시간 렌더링 및 정적 미리보기
- 커스터마이징 가능한 색상, 크기, 감도 설정
- 풀스크린 모드 지원

### 2. LUFS 분석 및 정규화
- 음원의 LUFS, True Peak, LRA 측정
- 목표 LUFS로 정규화
- 동적 범위 압축 옵션
- WAV 파일로 다운로드

### 3. **Stem 분리 (신규 기능)**
- AI 기반 음원 분리 (Spleeter 사용)
- 다양한 분리 모델 지원:
  - 2 Stems: 보컬 + 기타 음원
  - 4 Stems: 보컬 + 드럼 + 베이스 + 기타 음원  
  - 5 Stems: 보컬 + 드럼 + 베이스 + 피아노 + 기타 음원
- 분리된 각 stem을 개별 WAV 파일로 ZIP 압축하여 다운로드

### 4. 비디오 렌더링
- 파형 시각화를 MP4 비디오로 렌더링
- 비동기 렌더링 지원
- 진행률 표시

## 설치 및 실행

### 백엔드 설정
```bash
cd backend
pip install -r requirements.txt
python main.py
```

### 프론트엔드 설정
```bash
cd frontend
npm install
npm run dev
```

## 기술 스택

### 백엔드
- FastAPI
- Spleeter (TensorFlow 기반)
- FFmpeg
- Python 3.8+

### 프론트엔드
- React 19
- Vite
- Tailwind CSS

## API 엔드포인트

### Stem 분리
- `POST /api/audio/separate-stems` - 음원에서 stem 분리
- `GET /api/audio/stem-models` - 사용 가능한 분리 모델 목록

### 기타
- `POST /api/audio/measure-lufs` - LUFS 측정
- `POST /api/audio/normalize` - 음원 정규화
- `POST /api/render/start` - 비디오 렌더링 시작
- `GET /api/render/progress` - 렌더링 진행률
- `GET /api/render/result` - 렌더링 결과 다운로드

## 사용법

1. **파일 업로드**: 음원 파일을 선택합니다 (MP3, WAV, FLAC 등 지원)
2. **Stem 분리**: 
   - 원하는 분리 모델을 선택합니다
   - "Separate Stems" 버튼을 클릭합니다
   - 처리 완료 후 ZIP 파일이 자동으로 다운로드됩니다
3. **LUFS 분석**: 음원의 음량을 측정하고 정규화할 수 있습니다
4. **시각화**: 다양한 파형 시각화를 실시간으로 확인할 수 있습니다
5. **렌더링**: 파형 시각화를 MP4 비디오로 렌더링할 수 있습니다

## 주의사항

- Stem 분리 기능은 TensorFlow와 Spleeter 라이브러리를 사용합니다
- 첫 실행 시 모델 다운로드로 인해 시간이 걸릴 수 있습니다
- 저작권이 있는 음원의 사용 시 주의하세요
- 처리 시간은 음원 길이와 복잡도에 따라 달라집니다

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.
