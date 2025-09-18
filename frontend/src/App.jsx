import { useEffect, useRef, useState, useCallback } from 'react'
import './App.css'

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [audioUrl, setAudioUrl] = useState('')
  // removed unused audioBuffer state
  const [waveform, setWaveform] = useState([])
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [recordUrl, setRecordUrl] = useState('')
  // removed unused isRenderingMp4 state

  // LUFS analysis/normalization state
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [lufsData, setLufsData] = useState(null)
  const [targetLufs, setTargetLufs] = useState(-15)
  const [targetTp, setTargetTp] = useState(-1.0)
  const [targetLra, setTargetLra] = useState(7)
  const [isNormalizing, setIsNormalizing] = useState(false)
  const [normalizedUrl, setNormalizedUrl] = useState('')
  const [preCompress, setPreCompress] = useState(false)
  const [compThreshold, setCompThreshold] = useState(-18)
  const [compRatio, setCompRatio] = useState(3)
  const [compAttack, setCompAttack] = useState(20)
  const [compRelease, setCompRelease] = useState(200)

  // Render settings
  const [widthPx, setWidthPx] = useState(1280)
  const [heightPx, setHeightPx] = useState(720)
  const [fps, setFps] = useState(30)
  const [waveColor, setWaveColor] = useState('#5ac8fa')
  const [bgColor, setBgColor] = useState('#0b1020')
  const [preset, setPreset] = useState('custom')

  // Async render state
  // removed unused jobId state
  const [jobProgress, setJobProgress] = useState(0)
  const [jobStatus, setJobStatus] = useState('idle')

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Stem separation state
  const [stemModels, setStemModels] = useState([])
  const [selectedStemModel, setSelectedStemModel] = useState('demucs:4stems')
  const [isSeparating, setIsSeparating] = useState(false)
  const [separationProgress, setSeparationProgress] = useState(0)
  const [separationJobId, setSeparationJobId] = useState(null)

  // Real-time visualization settings
  const VIS_TYPES = [
    { id: 'line', label: 'Waveform (Line)' },
    { id: 'bars', label: 'Waveform (Bars)' },
    { id: 'spectrum', label: 'Spectrum (Bars)' },
    { id: 'circular', label: 'Spectrum (Circular)' },
    { id: 'mirrored', label: 'Waveform (Mirrored Bars)' },
    { id: 'rms', label: 'Waveform (RMS Curve)' },
    { id: 'wave3d', label: 'Waveform (3D Ridge)' },
  ]
  const [selectedVis, setSelectedVis] = useState(['line'])
  const [layoutMode, setLayoutMode] = useState('overlay') // 'overlay' | 'split'

  // Per-visual settings
  const [visSettings, setVisSettings] = useState({
    line: { color: '#5ac8fa', thickness: 2, sensitivity: 1.0 },
    bars: { color: '#34c759', thickness: 1, sensitivity: 1.0, columns: 200 },
    spectrum: { color: '#ff9f0a', thickness: 1, sensitivity: 1.0, columns: 128 },
    circular: { color: '#a78bfa', thickness: 2, sensitivity: 1.0, radiusScale: 0.6, segments: 128 },
    mirrored: { color: '#ff375f', thickness: 1, sensitivity: 1.0, columns: 220 },
    rms: { color: '#ffd60a', thickness: 2, window: 32 },
    wave3d: { color: '#5ac8fa', shadow: '#0a1025', highlight: '#9ad8ff', layers: 12, depth: 8, tilt: 0.4, sensitivity: 1.0 },
  })

  const audioRef = useRef(null)
  const canvasRef = useRef(null)
  const splitCanvasRefs = useRef({})
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const fileInputRef = useRef(null)

  // Web Audio analyser
  const analyserCtxRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const freqDataRef = useRef(null)
  const timeDataRef = useRef(null)
  // Peak-hold state for spectrum bars
  const spectrumStateRef = useRef({ peaks: [], hold: [] })

  // Handle file selection
  const onSelectFile = (e) => {
    console.log('onSelectFile called')
    const file = e.target.files?.[0]
    console.log('Selected file:', file)
    
    if (!file) {
      console.log('No file selected')
      return
    }
    
    setSelectedFile(file)
    setRecordUrl('')
    setLufsData(null)
    setNormalizedUrl('')

    const url = URL.createObjectURL(file)
    console.log('Created audio URL:', url)
    setAudioUrl(url)
  }

  // Presets
  const applyPreset = (value) => {
    setPreset(value)
    if (value === '1080p') {
      setWidthPx(1920); setHeightPx(1080)
    } else if (value === '720p') {
      setWidthPx(1280); setHeightPx(720)
    } else if (value === 'square') {
      setWidthPx(1080); setHeightPx(1080)
    } else if (value === 'vertical') {
      setWidthPx(1080); setHeightPx(1920)
    } else {
      // custom - do not change current values
    }
  }

  // Decode audio once audioUrl changes (for static canvas preview)
  useEffect(() => {
    if (!audioUrl) return

    let isCancelled = false
    const decode = async () => {
      try {
        const response = await fetch(audioUrl)
        const arrayBuffer = await response.arrayBuffer()

        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
        if (isCancelled) return
        setDuration(decoded.duration)

        const peaks = computeWaveformPeaks(decoded, 1500)
        setWaveform(peaks)
      } catch (err) {
        console.error('Failed to decode audio', err)
      }
    }

    decode()
    return () => {
      isCancelled = true
    }
  }, [audioUrl])

  // Setup analyser for real-time rendering when audio element available
  useEffect(() => {
    if (!audioRef.current) return

    let audioContext = analyserCtxRef.current
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      analyserCtxRef.current = audioContext
    }

    try {
      if (!sourceNodeRef.current) {
        sourceNodeRef.current = audioContext.createMediaElementSource(audioRef.current)
      }
      if (!analyserNodeRef.current) {
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.85
        analyserNodeRef.current = analyser
      }
      sourceNodeRef.current.connect(analyserNodeRef.current)
      analyserNodeRef.current.connect(audioContext.destination)

      const analyser = analyserNodeRef.current
      timeDataRef.current = new Uint8Array(analyser.fftSize)
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount)
    } catch (err) {
      console.debug('Analyser connect skipped', err)
    }
  }, [])

  // Draw static waveform preview and keep playhead updated
  useEffect(() => {
    drawStaticWaveform()
    const handleResize = () => drawStaticWaveform()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveform])

  // Real-time render loop
  useEffect(() => {
    let rafId
    const tick = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime)
      }
      renderRealtime()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [layoutMode, selectedVis, bgColor, waveColor, visSettings])

  const ensureCanvasSize = (canvas, height = 200) => {
    const dpr = window.devicePixelRatio || 1
    const parent = canvas.parentElement
    const width = Math.max(320, parent ? parent.clientWidth : 640)
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
    }
    const ctx = canvas.getContext('2d')
    ctx.resetTransform()
    ctx.scale(dpr, dpr)
    return { ctx, width, height, dpr }
  }

  const drawStaticWaveform = () => {
    if (layoutMode !== 'overlay') return
    const canvas = canvasRef.current
    if (!canvas) return
    const { ctx, width, height } = ensureCanvasSize(canvas, 200)

    ctx.fillStyle = '#0b1020'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = '#222b4a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    if (!waveform || waveform.length === 0) return

    const barWidth = Math.max(1, Math.floor(width / waveform.length))
    const halfH = height / 2
    ctx.fillStyle = '#5ac8fa'

    for (let i = 0; i < waveform.length; i++) {
      const x = i * barWidth
      const amp = waveform[i]
      const barHeight = amp * (halfH - 6)
      ctx.fillRect(x, halfH - barHeight, barWidth - 1, barHeight * 2)
    }

    if (duration > 0 && audioRef.current) {
      const progress = Math.min(1, audioRef.current.currentTime / duration)
      const x = Math.floor(progress * width)
      ctx.fillStyle = '#ffcc00'
      ctx.fillRect(x, 0, 2, height)
    }
  }

  const renderRealtime = () => {
    const analyser = analyserNodeRef.current
    const timeData = timeDataRef.current
    const freqData = freqDataRef.current
    if (!analyser || !timeData || !freqData) return

    analyser.getByteTimeDomainData(timeData)
    analyser.getByteFrequencyData(freqData)

    if (layoutMode === 'overlay') {
      drawOverlay(canvasRef.current, timeData, freqData)
    } else {
      const container = document.getElementById('split-canvases')
      if (!container) return
      selectedVis.forEach((id) => {
        if (!splitCanvasRefs.current[id]) {
          const el = document.createElement('canvas')
          splitCanvasRefs.current[id] = el
          container.appendChild(el)
        }
        const canvas = splitCanvasRefs.current[id]
        if (id === 'line') drawLine(canvas, timeData, visSettings.line)
        if (id === 'bars') drawBars(canvas, timeData, visSettings.bars)
        if (id === 'spectrum') drawSpectrum(canvas, freqData, visSettings.spectrum)
        if (id === 'circular') drawCircularSpectrum(canvas, freqData, visSettings.circular)
        if (id === 'mirrored') drawMirroredBars(canvas, timeData, visSettings.mirrored)
        if (id === 'rms') drawRmsCurve(canvas, timeData, visSettings.rms)
        if (id === 'wave3d') drawWave3D(canvas, timeData, visSettings.wave3d)
      })
      Object.keys(splitCanvasRefs.current).forEach((id) => {
        if (!selectedVis.includes(id)) {
          const el = splitCanvasRefs.current[id]
          el?.parentElement?.removeChild(el)
          delete splitCanvasRefs.current[id]
        }
      })
    }
  }

  const clearCanvas = (ctx, width, height, bg = '#0b1020') => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
  }

  const drawOverlay = (canvas, timeData, freqData) => {
    if (!canvas) return
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    clearCanvas(ctx, width, height, bgColor)

    ctx.strokeStyle = '#222b4a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, Math.floor(height / 2))
    ctx.lineTo(width, Math.floor(height / 2))
    ctx.stroke()

    if (selectedVis.includes('line')) drawLine(canvas, timeData, visSettings.line)
    if (selectedVis.includes('bars')) drawBars(canvas, timeData, visSettings.bars)
    if (selectedVis.includes('spectrum')) drawSpectrum(canvas, freqData, visSettings.spectrum)
    if (selectedVis.includes('circular')) drawCircularSpectrum(canvas, freqData, visSettings.circular)
    if (selectedVis.includes('mirrored')) drawMirroredBars(canvas, timeData, visSettings.mirrored)
    if (selectedVis.includes('rms')) drawRmsCurve(canvas, timeData, visSettings.rms)
    if (selectedVis.includes('wave3d')) drawWave3D(canvas, timeData, visSettings.wave3d)

    if (duration > 0 && audioRef.current) {
      const progress = Math.min(1, audioRef.current.currentTime / duration)
      const x = Math.floor(progress * width)
      ctx.fillStyle = '#ffcc00'
      ctx.fillRect(x, 0, 2, height)
    }
  }

  const drawLine = (canvas, timeData, settings) => {
    const { color, thickness = 2, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = height / 2
    ctx.lineWidth = thickness
    ctx.strokeStyle = color
    ctx.beginPath()
    const slice = timeData.length / width
    for (let x = 0; x < width; x++) {
      const v = (timeData[Math.floor(x * slice)] / 128.0 - 1.0) * sensitivity
      const y = mid + v * (mid - 8)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  const drawBars = (canvas, timeData, settings) => {
    const { color, columns = 200, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = height / 2
    const barWidth = Math.max(2, Math.floor(width / columns))
    ctx.fillStyle = color
    for (let x = 0; x < width; x += barWidth) {
      const i = Math.floor((x / width) * timeData.length)
      const v = Math.abs((timeData[i] / 128.0 - 1.0) * sensitivity)
      const h = v * (mid - 6)
      ctx.fillRect(x, mid - h, barWidth - 1, h * 2)
    }
  }

  const drawMirroredBars = (canvas, timeData, settings) => {
    const { color, columns = 220, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = height / 2
    const barWidth = Math.max(2, Math.floor(width / columns))
    ctx.fillStyle = color
    for (let x = 0; x < width; x += barWidth) {
      const i = Math.floor((x / width) * timeData.length)
      const v = Math.abs((timeData[i] / 128.0 - 1.0) * sensitivity)
      const h = v * (mid - 6)
      ctx.fillRect(x, mid - h, barWidth - 1, h)
      ctx.fillRect(x, mid, barWidth - 1, h)
    }
  }

  const drawSpectrum = (canvas, freqData, settings) => {
    const { color, columns = 128, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const barWidth = Math.max(2, Math.floor(width / columns))

    // LED-style segment config
    const segmentH = 4   // each segment height in px
    const gap = 2        // gap between segments in px
    const maxDrawable = height - 8
    const smooth = 0.6   // exponential smoothing factor (higher = smoother)
    const peakFall = 1   // pixels per frame the peak falls
    const peakHoldFrames = 10

    // Prepare state arrays sized to columns
    const cols = Math.floor(width / barWidth)
    if (spectrumStateRef.current.peaks.length !== cols) {
      spectrumStateRef.current.peaks = new Array(cols).fill(0)
      spectrumStateRef.current.hold = new Array(cols).fill(0)
      spectrumStateRef.current.prev = new Array(cols).fill(0)
    }

    // Background grid (optional subtle)
    ctx.fillStyle = '#0b1020'
    ctx.fillRect(0, 0, width, height)

    for (let c = 0; c < cols; c++) {
      const x = c * barWidth
      const i = Math.floor((x / width) * freqData.length)
      const magnitude = Math.max(0, Math.min(1, (freqData[i] / 255) * sensitivity))
      // smooth height in pixels
      const targetH = magnitude * maxDrawable
      const prevH = spectrumStateRef.current.prev[c] || 0
      const smoothedH = prevH * smooth + targetH * (1 - smooth)
      spectrumStateRef.current.prev[c] = smoothedH

      // draw segmented bar from bottom
      const segments = Math.floor(smoothedH / (segmentH + gap))
      ctx.fillStyle = color
      for (let s = 0; s < segments; s++) {
        const yTop = height - 4 - (s + 1) * (segmentH + gap) + gap
        ctx.fillRect(x, yTop, barWidth - 1, segmentH)
      }

      // peak-hold marker
      const currentPeakY = height - smoothedH
      const peakY = spectrumStateRef.current.peaks[c]
      if (currentPeakY < peakY || peakY === 0) {
        // new peak (higher bar)
        spectrumStateRef.current.peaks[c] = currentPeakY
        spectrumStateRef.current.hold[c] = peakHoldFrames
      } else {
        // hold then fall
        if (spectrumStateRef.current.hold[c] > 0) {
          spectrumStateRef.current.hold[c] -= 1
        } else {
          spectrumStateRef.current.peaks[c] = Math.min(height - 4, peakY + peakFall)
        }
      }
      // draw peak as a thin line segment
      const py = Math.max(4, Math.min(height - 4, spectrumStateRef.current.peaks[c]))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, py, barWidth - 1, 2)
    }
  }

  const drawCircularSpectrum = (canvas, freqData, settings) => {
    const { color, thickness = 2, sensitivity = 1.0, radiusScale = 0.6, segments = 128 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const cx = Math.floor(width / 2)
    const cy = Math.floor(height / 2)
    const radius = Math.min(cx, cy) * radiusScale
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    for (let i = 0; i < segments; i++) {
      const idx = Math.floor((i / segments) * freqData.length)
      const mag = (freqData[idx] / 255) * sensitivity
      const len = radius * 0.2 + Math.max(0, Math.min(1, mag)) * radius * 0.8
      const angle = (i / segments) * Math.PI * 2
      const x1 = Math.cos(angle) * radius
      const y1 = Math.sin(angle) * radius
      const x2 = Math.cos(angle) * (radius + len)
      const y2 = Math.sin(angle) * (radius + len)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.restore()
  }

  const drawRmsCurve = (canvas, timeData, settings) => {
    const { color, thickness = 2, window = 32 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = height / 2
    ctx.lineWidth = thickness
    ctx.strokeStyle = color
    ctx.beginPath()
    const step = Math.max(1, Math.floor(timeData.length / width))
    for (let x = 0, i = 0; x < width; x++, i += step) {
      let sumSq = 0
      let count = 0
      for (let k = 0; k < window && i + k < timeData.length; k++) {
        const v = timeData[i + k] / 128.0 - 1.0
        sumSq += v * v
        count++
      }
      const rms = Math.sqrt(sumSq / Math.max(1, count))
      const y = mid - rms * (mid - 8)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  const drawWave3D = (canvas, timeData, settings) => {
    const { color, shadow = '#0a1025', highlight = '#9ad8ff', layers = 12, depth = 8, tilt = 0.4, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = Math.floor(height / 2)

    // base path generation from timeData
    const slice = timeData.length / width
    const waveY = new Array(width)
    for (let x = 0; x < width; x++) {
      const v = (timeData[Math.floor(x * slice)] / 128.0 - 1.0) * sensitivity
      waveY[x] = mid + v * (mid - 10)
    }

    // draw layered ridges back-to-front for a faux 3D effect
    for (let i = layers - 1; i >= 0; i--) {
      const offsetY = Math.round((i - (layers - 1)) * depth)
      const offsetX = Math.round((i - (layers - 1)) * tilt * 10)

      // gradient per layer
      const grad = ctx.createLinearGradient(0, mid - 60 + offsetY, 0, mid + 60 + offsetY)
      const t = i / Math.max(1, layers - 1)
      const mix = (a, b, p) => a + (b - a) * p
      const parseHex = (h) => {
        const s = h.startsWith('#') ? h.slice(1) : h
        return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
      }
      const toHex = (r, g, b) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
      const cBase = parseHex(color)
      const cHi = parseHex(highlight)
      const cLo = parseHex(shadow)
      const topCol = toHex(mix(cHi[0], cBase[0], t), mix(cHi[1], cBase[1], t), mix(cHi[2], cBase[2], t))
      const botCol = toHex(mix(cBase[0], cLo[0], t), mix(cBase[1], cLo[1], t), mix(cBase[2], cLo[2], t))
      grad.addColorStop(0, topCol)
      grad.addColorStop(1, botCol)

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(0 + offsetX, height + 2)
      for (let x = 0; x < width; x++) {
        ctx.lineTo(x + offsetX, waveY[x] + offsetY)
      }
      ctx.lineTo(width + offsetX, height + 2)
      ctx.closePath()
      ctx.fill()

      // subtle rim light
      ctx.strokeStyle = topCol
      ctx.lineWidth = i === 0 ? 2 : 1
      ctx.beginPath()
      for (let x = 0; x < width; x += 2) {
        const y = waveY[x] + offsetY
        ctx.lineTo(x + offsetX, y)
      }
      ctx.stroke()
    }
  }

  const onTogglePlay = useCallback(async () => {
    console.log('onTogglePlay called')
    console.log('audioRef.current:', audioRef.current)
    console.log('audioUrl:', audioUrl)
    console.log('selectedFile:', selectedFile)
    
    const audio = audioRef.current
    if (!audio) {
      console.error('No audio element found')
      return
    }
    
    if (!audioUrl) {
      console.error('No audio URL set')
      return
    }
    
    if (analyserCtxRef.current && analyserCtxRef.current.state === 'suspended') {
      try { 
        await analyserCtxRef.current.resume() 
        console.log('AudioContext resumed')
      } catch (err) { 
        console.debug('AudioContext resume failed', err) 
      }
    }
    
    if (audio.paused) {
      try {
        console.log('Attempting to play audio')
        await audio.play()
        setIsPlaying(true)
        console.log('Audio playing successfully')
      } catch (e) {
        console.error('Play failed:', e)
        alert('재생 실패: ' + e.message)
      }
    } else {
      console.log('Pausing audio')
      audio.pause()
      setIsPlaying(false)
    }
  }, [audioUrl, selectedFile])

  const onSeek = (e) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = Math.min(1, Math.max(0, x / rect.width))
    audioRef.current.currentTime = ratio * duration
    setCurrentTime(audioRef.current.currentTime)
  }

  const startRecording = () => {
    if (!audioRef.current) return
    if (isRecording) return

    const captureEl = layoutMode === 'overlay' ? canvasRef.current : document.getElementById('split-canvases')
    const canvasStream = captureEl?.captureStream?.(30)
    const audioStream = audioRef.current.captureStream?.()

    if (!canvasStream || !audioStream || audioStream.getAudioTracks().length === 0) {
      alert('이 브라우저에서는 캔버스/오디오 캡쳐가 제한될 수 있습니다. Chrome을 권장합니다.')
      return
    }

    const mixed = new MediaStream()
    canvasStream.getVideoTracks().forEach((t) => mixed.addTrack(t))
    audioStream.getAudioTracks().forEach((t) => mixed.addTrack(t))

    const mr = new MediaRecorder(mixed, { mimeType: 'video/webm;codecs=vp9,opus' })
    recordedChunksRef.current = []
    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data)
    }
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      setRecordUrl(url)
      setIsRecording(false)
    }
    mediaRecorderRef.current = mr
    setIsRecording(true)
    mr.start()
    audioRef.current.play().catch(() => {})
  }

  const stopRecording = () => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    if (mr.state !== 'inactive') {
      mr.stop()
    }
  }

  const toHex0x = (hex) => {
    if (!hex) return '0x000000'
    if (hex.startsWith('#')) return '0x' + hex.slice(1)
    if (hex.startsWith('0x') || hex.startsWith('0X')) return hex
    return '0x' + hex
  }

  const startRenderAsync = async () => {
    if (!selectedFile) return
    try {
      setJobProgress(0); setJobStatus('starting')
      const form = new FormData()
      form.append('file', selectedFile)
      const qs = new URLSearchParams({
        width: String(widthPx), height: String(heightPx), fps: String(fps),
        color: toHex0x(waveColor), background: toHex0x(bgColor),
      })
      const resp = await fetch('http://localhost:8000/api/render/start?' + qs.toString(), { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setJobStatus('running')
      pollProgress(data.job_id)
    } catch (e) {
      setJobStatus('failed')
      alert('Start failed: ' + (e?.message || e))
    }
  }

  const measureLUFS = async () => {
    if (!selectedFile) return
    try {
      setIsMeasuring(true)
      setLufsData(null)
      const form = new FormData()
      form.append('file', selectedFile)
      const resp = await fetch('http://localhost:8000/api/audio/measure-lufs', { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setLufsData(data)
    } catch (e) {
      alert('LUFS 측정 실패: ' + (e?.message || e))
    } finally {
      setIsMeasuring(false)
    }
  }

  const normalizeToTarget = async () => {
    if (!selectedFile) return
    try {
      setIsNormalizing(true)
      const form = new FormData()
      form.append('file', selectedFile)
      const qs = new URLSearchParams({
        target_lufs: String(targetLufs),
        target_tp: String(targetTp),
        target_lra: String(targetLra),
        pre_compress: String(preCompress),
        compress_threshold_db: String(compThreshold),
        compress_ratio: String(compRatio),
        compress_attack_ms: String(compAttack),
        compress_release_ms: String(compRelease),
      })
      const resp = await fetch('http://localhost:8000/api/audio/normalize?' + qs.toString(), { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      setNormalizedUrl(url)
      // Auto download
      const a = document.createElement('a')
      a.href = url
      a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + `_norm_${targetLufs}LUFS.wav`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      alert('정규화 실패: ' + (e?.message || e))
    } finally {
      setIsNormalizing(false)
    }
  }

  // Load available stem models
  const loadStemModels = async () => {
    try {
      const resp = await fetch('http://localhost:8000/api/audio/stem-models')
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setStemModels(data.models || [])
      
      // Show warning if Demucs is not available
      if (!data.available && data.message) {
        console.warn(data.message)
      }
    } catch (e) {
      console.error('Failed to load stem models:', e)
    }
  }

  // Separate stems
  const separateStems = async () => {
    if (!selectedFile) return
    try {
      setIsSeparating(true)
      setSeparationProgress(0)
      setSeparationJobId(null)
      
      const form = new FormData()
      form.append('file', selectedFile)
      const qs = new URLSearchParams({
        model: selectedStemModel
      })
      
      const resp = await fetch('http://localhost:8000/api/audio/separate-stems?' + qs.toString(), { 
        method: 'POST', 
        body: form 
      })
      
      if (!resp.ok) throw new Error(await resp.text())
      
      const data = await resp.json()
      setSeparationJobId(data.job_id)
      pollSeparationProgress(data.job_id)
    } catch (e) {
      alert('Stem 분리 시작 실패: ' + (e?.message || e))
      setIsSeparating(false)
    }
  }

  // Poll separation progress
  const pollSeparationProgress = async (jobId) => {
    let done = false
    while (!done) {
      await new Promise(r => setTimeout(r, 1000))
      try {
        const resp = await fetch('http://localhost:8000/api/audio/stem-separation/progress?job_id=' + encodeURIComponent(jobId))
        if (!resp.ok) throw new Error(await resp.text())
        const data = await resp.json()
        setSeparationProgress(Number(data.progress || 0) * 100)
        
        if (data.status === 'completed') {
          done = true
          const res = await fetch('http://localhost:8000/api/audio/stem-separation/result?job_id=' + encodeURIComponent(jobId))
          if (!res.ok) throw new Error(await res.text())
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '_stems.zip'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          done = true
          alert('Stem 분리 실패: ' + (data.error || 'unknown error'))
        }
      } catch (e) {
        done = true
        alert('Stem 분리 진행률 조회 실패: ' + (e?.message || e))
      }
    }
    setIsSeparating(false)
    setSeparationJobId(null)
  }

  const extractNumber = (obj, a, b) => {
    if (!obj) return undefined
    const v = obj[a]
    if (v !== undefined && v !== null && v !== '') return Number(v)
    const w = obj[b]
    if (w !== undefined && w !== null && w !== '') return Number(w)
    return undefined
  }

  const measuredI = extractNumber(lufsData || {}, 'input_i', 'measured_I')
  const measuredTP = extractNumber(lufsData || {}, 'input_tp', 'measured_TP')
  const measuredLRA = extractNumber(lufsData || {}, 'input_lra', 'measured_LRA')

  const lufsBar = () => {
    // Visualize wider range from -48 to 0 LUFS
    const minLufs = -48
    const maxLufs = 0
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
    const toPct = (v) => ((clamp(v, minLufs, maxLufs) - minLufs) / (maxLufs - minLufs)) * 100
    const targetPct = toPct(targetLufs)
    const measuredPct = measuredI !== undefined ? toPct(measuredI) : null
    return (
      <div style={{ width: 520, maxWidth: '95%', position: 'relative' }}>
        <div style={{ height: 14, background: '#222b4a', borderRadius: 8, position: 'relative' }}>
          <div style={{ position: 'absolute', left: `${targetPct}%`, top: -4, width: 2, height: 22, background: '#ff9f0a' }} />
          {measuredPct !== null && (
            <div style={{ position: 'absolute', left: `${measuredPct}%`, top: -4, width: 2, height: 22, background: '#5ac8fa' }} />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#99a2d1', marginTop: 4 }}>
          <span>-36</span>
          <span>-24</span>
          <span>-18</span>
          <span>-14</span>
          <span>-12</span>
          <span>-6</span>
          <span>0</span>
        </div>
      </div>
    )
  }

  const pollProgress = async (id) => {
    let done = false
    while (!done) {
      await new Promise(r => setTimeout(r, 800))
      try {
        const resp = await fetch('http://localhost:8000/api/render/progress?job_id=' + encodeURIComponent(id))
        if (!resp.ok) throw new Error(await resp.text())
        const data = await resp.json()
        setJobProgress(Number(data.progress || 0))
        setJobStatus(String(data.status))
        if (data.status === 'completed') {
          done = true
          const res = await fetch('http://localhost:8000/api/render/result?job_id=' + encodeURIComponent(id))
          if (!res.ok) throw new Error(await res.text())
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `waveform_${selectedFile.name.replace(/\.[^/.]+$/, '')}.mp4`
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          done = true
          alert('Render failed: ' + (data.error || 'unknown error'))
        }
      } catch (e) {
        done = true
        setJobStatus('failed')
        alert('Progress error: ' + (e?.message || e))
      }
    }
  }

  const formatTime = (t) => {
    if (!isFinite(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const toggleVis = (id) => {
    setSelectedVis((prev) => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id])
  }

  const updateVisSetting = (id, key, value) => {
    setVisSettings((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value }
    }))
  }

  const numberInput = (value, onChange, props = {}) => (
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} {...props} />
  )

  const handleFileButtonClick = () => {
    fileInputRef.current?.click()
  }

  // Fullscreen functionality
  const toggleFullscreen = async () => {
    const canvasContainer = document.getElementById('canvas-container')
    if (!canvasContainer) return

    try {
      if (!isFullscreen) {
        if (canvasContainer.requestFullscreen) {
          await canvasContainer.requestFullscreen()
        } else if (canvasContainer.webkitRequestFullscreen) {
          await canvasContainer.webkitRequestFullscreen()
        } else if (canvasContainer.msRequestFullscreen) {
          await canvasContainer.msRequestFullscreen()
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen()
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen()
        }
      }
    } catch (error) {
      console.error('Fullscreen error:', error)
    }
  }

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement
      )
      setIsFullscreen(isCurrentlyFullscreen)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('msfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('msfullscreenchange', handleFullscreenChange)
    }
  }, [])

  // Load stem models on component mount
  useEffect(() => {
    loadStemModels()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Prevent default behavior for Space key to avoid page scrolling
      if (event.code === 'Space') {
        event.preventDefault()
        
        // Only trigger play/pause if we have audio loaded
        if (audioUrl && audioRef.current) {
          onTogglePlay()
        }
      }
    }

    // Add event listener to document to work in fullscreen mode
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [audioUrl, onTogglePlay]) // Include dependencies to ensure latest state

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="unified-width">
      <h1 style={{ fontFamily: 'Bitcount Grid Double, Roboto Condensed, sans-serif' }}>Sound Wave Video Maker</h1>

      <div className="file-row unified-width">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/mp4,video/mpeg,video/webm,.wav,.mp3,.m4a,.aac,.ogg,.flac,.mp4"
          onChange={onSelectFile}
          style={{ display: 'none' }}
        />
        <button type="button" onClick={handleFileButtonClick}>Choose File</button>
        <span className="file-caption">{selectedFile ? selectedFile.name : 'No file selected'}</span>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Preset:</label>
        <select value={preset} onChange={(e) => applyPreset(e.target.value)}>
          <option value="custom">Custom</option>
          <option value="1080p">1080p (1920x1080)</option>
          <option value="720p">720p (1280x720)</option>
          <option value="square">Square (1080x1080)</option>
          <option value="vertical">Vertical (1080x1920)</option>
        </select>
        <label>Size:</label>
        {numberInput(widthPx, (v) => { setPreset('custom'); setWidthPx(v) }, { min: 320, step: 1, style: { width: 96 } })}
        <span>x</span>
        {numberInput(heightPx, (v) => { setPreset('custom'); setHeightPx(v) }, { min: 180, step: 1, style: { width: 96 } })}
        <label>FPS:</label>
        {numberInput(fps, setFps, { min: 1, max: 60, step: 1, style: { width: 64 } })}
        <label>Wave:</label>
        <input type="color" value={waveColor} onChange={(e) => setWaveColor(e.target.value)} />
        <label>BG:</label>
        <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
      </div>

      {/* LUFS Analyzer */}
      <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <h2 className="section-title">LUFS Analyzer</h2>
        <div className="controls-row">
          <button disabled={!selectedFile || isMeasuring} onClick={measureLUFS}>
            {isMeasuring ? 'Measuring…' : 'Measure LUFS'}
          </button>
          {lufsData && (
            <div className="controls-row">
              <span><b>I</b>: {Number.isFinite(measuredI) ? measuredI.toFixed(3) : '-'} LUFS</span>
              <span><b>TP</b>: {Number.isFinite(measuredTP) ? measuredTP.toFixed(3) : '-'} dBTP</span>
              <span><b>LRA</b>: {Number.isFinite(measuredLRA) ? measuredLRA.toFixed(3) : '-'} dB</span>
            </div>
          )}
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          {lufsBar()}
          <div className="controls-row" style={{ justifyContent: 'space-between', width: '100%' }}>
            <div className="controls-row">
              <label>Target LUFS</label>
              {numberInput(targetLufs, setTargetLufs, { step: 0.5, style: { width: 96 } })}
              <label>TP</label>
              {numberInput(targetTp, setTargetTp, { step: 0.1, style: { width: 80 } })}
              <label>LRA</label>
              {numberInput(targetLra, setTargetLra, { step: 0.5, style: { width: 80 } })}
            </div>
            <button disabled={!selectedFile || isNormalizing} onClick={normalizeToTarget}>
              {isNormalizing ? 'Normalizing…' : 'Normalize & Download'}
            </button>
          </div>
          <div className="controls-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={preCompress} onChange={(e) => setPreCompress(e.target.checked)} /> Tighten dynamics
            </label>
            {preCompress && (
              <>
                <label>Thr (dB)</label>
                {numberInput(compThreshold, setCompThreshold, { step: 1, style: { width: 80 } })}
                <label>Ratio</label>
                {numberInput(compRatio, setCompRatio, { step: 0.5, style: { width: 80 } })}
                <label>Atk (ms)</label>
                {numberInput(compAttack, setCompAttack, { step: 5, style: { width: 80 } })}
                <label>Rel (ms)</label>
                {numberInput(compRelease, setCompRelease, { step: 10, style: { width: 80 } })}
              </>
            )}
          </div>
        </div>
        {normalizedUrl && (
          <audio src={normalizedUrl} controls style={{ width: '100%' }} />
        )}
      </div>

      {/* Stem Separation */}
      <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <h2 className="section-title">Stem Separation</h2>
        {stemModels.length === 0 ? (
          <div style={{ color: '#ff6b6b', textAlign: 'center', padding: '20px' }}>
            Stem 모델을 로드하는 중...
          </div>
        ) : (
          <>
            <div className="controls-row">
              <label>Model:</label>
              <select 
                value={selectedStemModel} 
                onChange={(e) => setSelectedStemModel(e.target.value)}
                disabled={isSeparating}
              >
                {stemModels.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              <button 
                disabled={!selectedFile || isSeparating} 
                onClick={separateStems}
              >
                {isSeparating ? 'Separating...' : 'Separate Stems'}
              </button>
            </div>
          </>
        )}
        {stemModels.length > 0 && (
          <div style={{ fontSize: '12px', color: '#99a2d1', textAlign: 'center', maxWidth: '600px' }}>
            {stemModels.find(m => m.id === selectedStemModel)?.description}
          </div>
        )}
        {isSeparating && (
          <div style={{ width: 400, margin: '0 auto' }}>
            <div style={{ height: 8, background: '#222b4a', borderRadius: 4 }}>
              <div style={{ height: 8, width: `${Math.round(separationProgress)}%`, background: '#5ac8fa', borderRadius: 4 }} />
            </div>
            <div style={{ textAlign: 'center', marginTop: 6 }}>
              {separationProgress > 0 ? `${Math.round(separationProgress)}%` : 'Starting separation...'}
            </div>
            {separationJobId && (
              <div style={{ fontSize: '10px', color: '#666', textAlign: 'center', marginTop: 4 }}>
                Job ID: {separationJobId}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vocal Score Generator */}
      <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <h2 className="section-title">Vocal Score</h2>
        <div className="controls-row">
          <button
            disabled={!selectedFile}
            onClick={async () => {
              try {
                const form = new FormData()
                form.append('file', selectedFile)
                const resp = await fetch('http://localhost:8000/api/audio/generate-score', { method: 'POST', body: form })
                if (!resp.ok) throw new Error(await resp.text())
                const blob = await resp.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '_vocal_score.zip'
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              } catch (e) {
                alert('악보 생성 실패: ' + (e?.message || e))
              }
            }}
          >
            Generate Vocal Score (MIDI + MusicXML)
          </button>
        </div>
      </div>

      <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label>Visuals:</label>
        </div>
        <div className="visuals-grid">
          {VIS_TYPES.map(v => (
            <label key={v.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={selectedVis.includes(v.id)} onChange={() => toggleVis(v.id)} /> {v.label}
            </label>
          ))}
        </div>
        <div className="layout-row">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <b>Layout</b>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="radio" name="layout" value="overlay" checked={layoutMode === 'overlay'} onChange={() => setLayoutMode('overlay')} /> Overlay
            </label>
            <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="radio" name="layout" value="split" checked={layoutMode === 'split'} onChange={() => setLayoutMode('split')} /> Split
            </label>
          </div>
        </div>
      </div>

      {/* Per-visual settings panel */}
      <div className="section-card unified-width">
        <table className="settings-table">
          <tbody>
            {selectedVis.includes('line') && (
              <tr>
                <td className="visual-name-cell">Line</td>
                <td className="label-cell">Color</td>
                <td className="input-cell">
                  <input type="color" value={visSettings.line.color} onChange={(e) => updateVisSetting('line', 'color', e.target.value)} className="settings-color" />
                </td>
                <td className="label-cell">Thickness</td>
                <td className="input-cell">
                  {numberInput(visSettings.line.thickness, (v) => updateVisSetting('line', 'thickness', v), { min: 1, max: 8, step: 1, className: "settings-input" })}
                </td>
                <td className="label-cell">Sensitivity</td>
                <td className="input-cell">
                  {numberInput(visSettings.line.sensitivity, (v) => updateVisSetting('line', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                </td>
                <td></td>
              </tr>
            )}
            {selectedVis.includes('bars') && (
              <tr>
                <td className="visual-name-cell">Bars</td>
                <td className="label-cell">Color</td>
                <td className="input-cell">
                  <input type="color" value={visSettings.bars.color} onChange={(e) => updateVisSetting('bars', 'color', e.target.value)} className="settings-color" />
                </td>
                <td className="label-cell">Columns</td>
                <td className="input-cell">
                  {numberInput(visSettings.bars.columns, (v) => updateVisSetting('bars', 'columns', v), { min: 50, max: 400, step: 10, className: "settings-input" })}
                </td>
                <td className="label-cell">Sensitivity</td>
                <td className="input-cell">
                  {numberInput(visSettings.bars.sensitivity, (v) => updateVisSetting('bars', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                </td>
                <td></td>
              </tr>
            )}
            {selectedVis.includes('spectrum') && (
              <tr>
                <td className="visual-name-cell">Spectrum</td>
                <td className="label-cell">Color</td>
                <td className="input-cell">
                  <input type="color" value={visSettings.spectrum.color} onChange={(e) => updateVisSetting('spectrum', 'color', e.target.value)} className="settings-color" />
                </td>
                <td className="label-cell">Columns</td>
                <td className="input-cell">
                  {numberInput(visSettings.spectrum.columns, (v) => updateVisSetting('spectrum', 'columns', v), { min: 32, max: 512, step: 8, className: "settings-input" })}
                </td>
                <td className="label-cell">Sensitivity</td>
                <td className="input-cell">
                  {numberInput(visSettings.spectrum.sensitivity, (v) => updateVisSetting('spectrum', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                </td>
                <td></td>
              </tr>
            )}
            {selectedVis.includes('circular') && (
              <>
                <tr>
                  <td className="visual-name-cell">Circular</td>
                  <td className="label-cell">Color</td>
                  <td className="input-cell">
                    <input type="color" value={visSettings.circular.color} onChange={(e) => updateVisSetting('circular', 'color', e.target.value)} className="settings-color" />
                  </td>
                  <td className="label-cell">Thickness</td>
                  <td className="input-cell">
                    {numberInput(visSettings.circular.thickness, (v) => updateVisSetting('circular', 'thickness', v), { min: 1, max: 6, step: 1, className: "settings-input" })}
                  </td>
                  <td className="label-cell">Sensitivity</td>
                  <td className="input-cell">
                    {numberInput(visSettings.circular.sensitivity, (v) => updateVisSetting('circular', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td></td>
                  <td className="label-cell">Radius</td>
                  <td className="input-cell">
                    {numberInput(visSettings.circular.radiusScale, (v) => updateVisSetting('circular', 'radiusScale', v), { min: 0.2, max: 0.9, step: 0.05, className: "settings-input" })}
                  </td>
                  <td className="label-cell">Segments</td>
                  <td className="input-cell">
                    {numberInput(visSettings.circular.segments, (v) => updateVisSetting('circular', 'segments', v), { min: 32, max: 512, step: 8, className: "settings-input" })}
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </>
            )}
            {selectedVis.includes('mirrored') && (
              <tr>
                <td className="visual-name-cell">Mirrored</td>
                <td className="label-cell">Color</td>
                <td className="input-cell">
                  <input type="color" value={visSettings.mirrored.color} onChange={(e) => updateVisSetting('mirrored', 'color', e.target.value)} className="settings-color" />
                </td>
                <td className="label-cell">Columns</td>
                <td className="input-cell">
                  {numberInput(visSettings.mirrored.columns, (v) => updateVisSetting('mirrored', 'columns', v), { min: 50, max: 400, step: 10, className: "settings-input" })}
                </td>
                <td className="label-cell">Sensitivity</td>
                <td className="input-cell">
                  {numberInput(visSettings.mirrored.sensitivity, (v) => updateVisSetting('mirrored', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                </td>
                <td></td>
              </tr>
            )}
            {selectedVis.includes('rms') && (
              <tr>
                <td className="visual-name-cell">RMS</td>
                <td className="label-cell">Color</td>
                <td className="input-cell">
                  <input type="color" value={visSettings.rms.color} onChange={(e) => updateVisSetting('rms', 'color', e.target.value)} className="settings-color" />
                </td>
                <td className="label-cell">Thickness</td>
                <td className="input-cell">
                  {numberInput(visSettings.rms.thickness, (v) => updateVisSetting('rms', 'thickness', v), { min: 1, max: 6, step: 1, className: "settings-input" })}
                </td>
                <td className="label-cell">Window</td>
                <td className="input-cell">
                  {numberInput(visSettings.rms.window, (v) => updateVisSetting('rms', 'window', v), { min: 8, max: 256, step: 4, className: "settings-input" })}
                </td>
                <td></td>
              </tr>
            )}
            {selectedVis.includes('wave3d') && (
              <>
                <tr>
                  <td className="visual-name-cell">Wave 3D</td>
                  <td className="label-cell">Color</td>
                  <td className="input-cell">
                    <input type="color" value={visSettings.wave3d.color} onChange={(e) => updateVisSetting('wave3d', 'color', e.target.value)} className="settings-color" />
                  </td>
                  <td className="label-cell">Highlight</td>
                  <td className="input-cell">
                    <input type="color" value={visSettings.wave3d.highlight} onChange={(e) => updateVisSetting('wave3d', 'highlight', e.target.value)} className="settings-color" />
                  </td>
                  <td className="label-cell">Shadow</td>
                  <td className="input-cell">
                    <input type="color" value={visSettings.wave3d.shadow} onChange={(e) => updateVisSetting('wave3d', 'shadow', e.target.value)} className="settings-color" />
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td></td>
                  <td className="label-cell">Layers</td>
                  <td className="input-cell">
                    {numberInput(visSettings.wave3d.layers, (v) => updateVisSetting('wave3d', 'layers', Math.max(3, Math.min(24, v))), { min: 3, max: 24, step: 1, className: "settings-input" })}
                  </td>
                  <td className="label-cell">Depth</td>
                  <td className="input-cell">
                    {numberInput(visSettings.wave3d.depth, (v) => updateVisSetting('wave3d', 'depth', Math.max(2, Math.min(24, v))), { min: 2, max: 24, step: 1, className: "settings-input" })}
                  </td>
                  <td className="label-cell">Tilt</td>
                  <td className="input-cell">
                    {numberInput(visSettings.wave3d.tilt, (v) => updateVisSetting('wave3d', 'tilt', Math.max(0, Math.min(1.5, v))), { min: 0, max: 1.5, step: 0.05, className: "settings-input" })}
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td></td>
                  <td className="label-cell">Sens</td>
                  <td className="input-cell">
                    {numberInput(visSettings.wave3d.sensitivity, (v) => updateVisSetting('wave3d', 'sensitivity', Math.max(0.1, Math.min(5, v))), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                  </td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {layoutMode === 'overlay' ? (
        <div id="canvas-container" className="section-card unified-width canvas-card" onClick={onSeek} style={{ position: 'relative' }}>
          <canvas ref={canvasRef} />
          <button 
            className="fullscreen-button"
            onClick={(e) => {
              e.stopPropagation()
              toggleFullscreen()
            }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? '⤓' : '⤢'}
          </button>
        </div>
      ) : (
        <div id="canvas-container" className="section-card unified-width canvas-card" style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr', position: 'relative' }}>
          <div id="split-canvases" style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr' }} />
          <button 
            className="fullscreen-button"
            onClick={(e) => {
              e.stopPropagation()
              toggleFullscreen()
            }}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? '⤓' : '⤢'}
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <button disabled={!audioUrl} onClick={onTogglePlay}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
        <span style={{ fontSize: '12px', color: '#666' }}>
          Debug: audioUrl={audioUrl ? 'set' : 'empty'}, selectedFile={selectedFile ? 'set' : 'empty'}
        </span>
        {!isRecording ? (
          <button disabled={!audioUrl} onClick={startRecording}>Start Recording</button>
        ) : (
          <button onClick={stopRecording}>Stop Recording</button>
        )}
        {recordUrl && (
          <a href={recordUrl} download="waveform.webm">Download Video</a>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <button disabled={!selectedFile} onClick={startRenderAsync}>
          {jobStatus === 'running' || jobStatus === 'starting' ? 'Rendering...' : 'Render MP4 (Async)'}
        </button>
      </div>

      {(jobStatus === 'running' || jobStatus === 'starting') && (
        <div style={{ width: 400, margin: '0 auto' }}>
          <div style={{ height: 8, background: '#222b4a', borderRadius: 4 }}>
            <div style={{ height: 8, width: `${Math.round(jobProgress * 100)}%`, background: '#5ac8fa', borderRadius: 4 }} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 6 }}>{Math.round(jobProgress * 100)}%</div>
        </div>
      )}

      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        controls
        style={{ display: audioUrl ? 'block' : 'none', margin: '0 auto' }}
      />
    </div>
  )
}

function computeWaveformPeaks(audioBuffer, targetBars = 1500) {
  const channelData = audioBuffer.getChannelData(0)
  const length = channelData.length
  const samplesPerBar = Math.max(1, Math.floor(length / targetBars))
  const peaks = new Array(Math.floor(length / samplesPerBar)).fill(0)

  let peak = 0
  let count = 0
  let barIndex = 0
  for (let i = 0; i < length; i++) {
    const v = Math.abs(channelData[i])
    if (v > peak) peak = v
    count++
    if (count >= samplesPerBar) {
      peaks[barIndex++] = peak
      peak = 0
      count = 0
    }
  }
  const max = peaks.reduce((a, b) => Math.max(a, b), 0.0001)
  for (let i = 0; i < peaks.length; i++) {
    peaks[i] = Math.min(1, peaks[i] / max)
  }
  return peaks
}

export default App
