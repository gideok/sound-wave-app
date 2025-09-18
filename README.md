# Sound Wave Video Maker

A full-stack application for audio visualization, LUFS analysis/normalization, AI-based stem separation, lyrics processing, and video rendering.

## Features

### 🎵 Audio Processing
- **Audio Visualization**: Real-time waveform visualization with multiple modes (Line, Bars, Spectrum, Circular, Mirrored, RMS, 3D Wave)
- **LUFS Analysis & Normalization**: Measure and normalize audio loudness with dynamic range compression
- **Stem Separation**: AI-powered source separation using Demucs (Vocals, Drums, Bass, Piano, Other)
- **Lyrics Processing**: Extract lyrics from audio and align them with timestamps

### 🎬 Video Rendering
- **Real-time Visualization**: Live audio visualization with customizable settings
- **Video Export**: Render waveform visualizations to MP4 videos
- **Fullscreen Mode**: Immersive visualization experience
- **Customizable Settings**: Adjust colors, dimensions, FPS, and visualization parameters

### 🎤 Advanced Features
- **Vocal Score Generation**: Generate vocal scores from audio
- **Lyrics Alignment**: Upload LRC files or align lyrics with audio timestamps
- **Media Recording**: Record screen while playing audio
- **Keyboard Shortcuts**: Space bar for play/pause control

## Tech Stack

### Frontend
- **React 19** with modern hooks and functional components
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Canvas API** for real-time audio visualization
- **Web Audio API** for audio processing and analysis

### Backend
- **FastAPI** with async support
- **Uvicorn** ASGI server
- **FFmpeg** for audio/video processing
- **Demucs** for AI-based stem separation
- **Librosa** for audio analysis

## Installation & Setup

### Prerequisites
- **Node.js** (for frontend development server)
- **Python 3.13** (project uses virtual environment)
- **FFmpeg** (recommended: use bundled imageio-ffmpeg, or install separately with PATH registration)

### Quick Start (Windows PowerShell)

#### 1. Backend Setup
```powershell
cd backend
./venv/Scripts/Activate.ps1
pip install -r requirements.txt
python main.py
# Server: http://localhost:8000
```

#### 2. Frontend Setup
```powershell
cd frontend
npm install
npm run dev
# Development server: http://localhost:5173
```

#### 3. Batch Scripts (Optional)
Use provided batch scripts for quick startup:
- `start_backend.bat`: Start backend only (includes venv activation)
- `start_frontend.bat`: Start frontend only
- `start_app.bat`: Start both backend and frontend

## Project Structure

```
sound-wave-app/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── routers/                # API route handlers
│   │   ├── audio.py           # Audio processing endpoints
│   │   ├── lyrics.py          # Lyrics processing endpoints
│   │   ├── render.py          # Video rendering endpoints
│   │   ├── score.py           # Vocal score generation
│   │   └── stems.py           # Stem separation endpoints
│   └── services/              # Business logic services
│       ├── ffmpeg.py          # FFmpeg operations
│       ├── files.py           # File handling
│       └── jobs.py            # Background job management
├── frontend/
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── constants/        # Application constants
│   │   └── App.jsx           # Main application component
│   └── package.json
└── README.md
```

## API Endpoints

### Audio Processing
- `POST /api/audio/measure-lufs` - Measure LUFS values
- `POST /api/audio/normalize` - Normalize audio to target LUFS
- `GET /api/audio/stem-models` - Get available stem separation models
- `POST /api/audio/separate-stems` - Start stem separation
- `GET /api/audio/stem-separation/progress` - Get separation progress
- `GET /api/audio/stem-separation/result` - Download separation results

### Lyrics Processing
- `POST /api/lyrics/extract` - Extract lyrics from audio
- `POST /api/lyrics/align` - Align lyrics with audio timestamps
- `POST /api/lyrics/generate-score` - Generate vocal score

### Video Rendering
- `POST /api/render/start` - Start video rendering
- `GET /api/render/progress` - Get rendering progress
- `GET /api/render/result` - Download rendered video

## Usage Guide

### 1. Audio File Upload
- Select an audio file (MP3, WAV, FLAC supported)
- The waveform will be automatically decoded and displayed

### 2. LUFS Analysis & Normalization
- Measure current LUFS, True Peak, and LRA values
- Set target values for normalization
- Apply dynamic range compression if needed
- Download normalized audio as WAV file

### 3. Stem Separation
- Choose separation model (4-stems or 5-stems)
- Start separation process
- Monitor progress in real-time
- Download separated stems as ZIP file

### 4. Lyrics Processing
- **Extract Lyrics**: Generate lyrics from audio using AI
- **Align Lyrics**: Upload LRC file or align lyrics with timestamps
- **Generate Score**: Create vocal score from audio

### 5. Visualization & Rendering
- Select visualization types and layout mode
- Customize colors, dimensions, and settings
- Use fullscreen mode for immersive experience
- Render visualizations to MP4 video

## Key Features

### Real-time Audio Visualization
- Multiple visualization modes with customizable parameters
- Smooth real-time rendering using Canvas API
- Responsive design that adapts to different screen sizes

### Advanced Audio Processing
- LUFS measurement and normalization
- AI-powered stem separation using Demucs
- Dynamic range compression with customizable parameters

### Modern React Architecture
- Custom hooks for state management and side effects
- Component-based architecture with proper separation of concerns
- Performance optimizations with React.memo and useCallback

## Troubleshooting

### Common Issues

1. **Port 8000 already in use (WinError 10048)**
   - Stop existing backend processes and restart
   - Modify port in `uvicorn.run(..., port=new_port)` if needed

2. **Frontend keeps loading**
   - Verify API paths use absolute URLs (`http://localhost:8000/...`)
   - Check CORS settings (configured for `http://localhost:5173`)

3. **PowerShell `| cat` errors**
   - Use `| Out-Host` or `| Tee-Object -FilePath backend.log` instead
   - PowerShell's `cat` has limited compatibility with process output piping

4. **Demucs performance tips**
   - High quality: `htdemucs_ft` / Speed: `htdemucs`
   - Consider `-d cuda` for GPU environments
   - TTA/overlap/segment options planned for future profiles

## Development

### Frontend Development
- Uses Vite for fast HMR (Hot Module Replacement)
- Tailwind CSS for utility-first styling
- Custom hooks for complex state management
- Canvas API for real-time audio visualization

### Backend Development
- FastAPI with automatic API documentation
- Async/await pattern for non-blocking operations
- Background job processing for long-running tasks
- Comprehensive error handling and logging

## License

This project is licensed under the MIT License. Please note that third-party libraries (Demucs, FFmpeg, etc.) have their own licenses.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Acknowledgments

- **Demucs** for AI-based stem separation
- **FFmpeg** for audio/video processing
- **React** and **FastAPI** communities for excellent documentation