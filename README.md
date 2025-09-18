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
