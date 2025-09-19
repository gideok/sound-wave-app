import React, { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

// Components
import FileSelector from './components/FileSelector'
import RenderSettings from './components/RenderSettings'
import LufsAnalyzer from './components/LufsAnalyzer'
import StemSeparation from './components/StemSeparation'
import VocalScoreGenerator from './components/VocalScoreGenerator'
import LyricsExtractor from './components/LyricsExtractor'
import VisualizationSettings from './components/VisualizationSettings'
import CanvasVisualization from './components/CanvasVisualization'
import AudioControls from './components/AudioControls'
import RenderControls from './components/RenderControls'
import LyricsDisplay from './components/LyricsDisplay'

// Hooks
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useLufsAnalysis } from './hooks/useLufsAnalysis'
import { useVisualization } from './hooks/useVisualization'
import { useRenderSettings } from './hooks/useRenderSettings'
import { useCanvasRendering } from './hooks/useCanvasRendering'
import { useVisualizationDrawers } from './hooks/useVisualizationDrawers'

// Constants
import { DEFAULT_LAYOUT_MODE } from './constants/visualization'

function App() {
  // Collapsible state for each section
  const [colLufs, setColLufs] = useState(false)
  const [colStems, setColStems] = useState(false)
  const [colScore, setColScore] = useState(false)
  const [colLyrics, setColLyrics] = useState(false)
  const [colAlign, setColAlign] = useState(false)
  const [colVisualGroup, setColVisualGroup] = useState(false)
  const [colLyricLine, setColLyricLine] = useState(false)
  const [colControls] = useState(false)
  const [colRender] = useState(false)
  const [colPlayer] = useState(false)

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Stem separation state
  const [stemModels, setStemModels] = useState([])
  const [selectedStemModel, setSelectedStemModel] = useState('demucs:4stems')
  const [isSeparating, setIsSeparating] = useState(false)
  const [separationProgress, setSeparationProgress] = useState(0)
  const [separationJobId, setSeparationJobId] = useState(null)

  // Lyrics state
  const [isGeneratingScore, setIsGeneratingScore] = useState(false)
  const [isExtractingLyrics, setIsExtractingLyrics] = useState(false)
  const [lyricsLang, setLyricsLang] = useState('auto')
  const [alignLyricsText, setAlignLyricsText] = useState('')
  const [isAligningLyrics, setIsAligningLyrics] = useState(false)
  const [alignLang, setAlignLang] = useState('auto')
  const [alignModel, setAlignModel] = useState('small')
  const [lastLrcText, setLastLrcText] = useState('')
  const [parsedLrc, setParsedLrc] = useState([])

  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordUrl, setRecordUrl] = useState('')
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])

  // Custom hooks
  const audioPlayer = useAudioPlayer()
  const lufsAnalysis = useLufsAnalysis()
  const visualization = useVisualization()
  const renderSettings = useRenderSettings()
  const canvasRendering = useCanvasRendering()
  const visualizationDrawers = useVisualizationDrawers(
    canvasRendering.ensureCanvasSize,
    canvasRendering.clearCanvas,
    canvasRendering.spectrumStateRef
  )

  // Parse LRC text
  const parseLrc = useCallback((text) => {
    console.log('parseLrc called with text length:', text?.length || 0)
    if (!text || typeof text !== 'string') return []
    const lines = text.split('\n')
    console.log('Split into', lines.length, 'lines')
    const entries = []
    const tsRe = /\[(\d{2}):(\d{2})(?:\.(\d{1,2}))?\]/g
    for (const raw of lines) {
      if (!raw) continue
      let m
      let lastIdx = 0
      const stamps = []
      while ((m = tsRe.exec(raw)) !== null) {
        const mm = Number(m[1] || 0)
        const ss = Number(m[2] || 0)
        const cs = Number((m[3] || '0').padEnd(2, '0')) // hundredths
        const t = mm * 60 + ss + cs / 100
        stamps.push(t)
        lastIdx = m.index + m[0].length
      }
      const content = raw.slice(lastIdx).trim()
      if (stamps.length === 0) continue
      for (const t of stamps) {
        entries.push({ time: t, text: content })
      }
    }
    entries.sort((a, b) => a.time - b.time)
    console.log('Parsed', entries.length, 'LRC entries')
    return entries
  }, [])

  useEffect(() => {
    setParsedLrc(parseLrc(lastLrcText))
  }, [lastLrcText, parseLrc])

  // Real-time render loop
  const renderRealtime = useCallback(() => {
    const analyser = audioPlayer.analyserNodeRef.current
    const timeData = audioPlayer.timeDataRef.current
    const freqData = audioPlayer.freqDataRef.current
    if (!analyser || !timeData || !freqData) return

    analyser.getByteTimeDomainData(timeData)
    analyser.getByteFrequencyData(freqData)

    if (visualization.layoutMode === 'overlay') {
      visualizationDrawers.drawOverlay(
        canvasRendering.canvasRef.current, 
        timeData, 
        freqData, 
        renderSettings.bgColor, 
        visualization.selectedVis, 
        visualization.visSettings, 
        audioPlayer.duration, 
        audioPlayer.audioRef
      )
    } else {
      const container = document.getElementById('split-canvases')
      if (!container) return
      visualization.selectedVis.forEach((id) => {
        if (!canvasRendering.splitCanvasRefs.current[id]) {
          const el = document.createElement('canvas')
          canvasRendering.splitCanvasRefs.current[id] = el
          container.appendChild(el)
        }
        const canvas = canvasRendering.splitCanvasRefs.current[id]
        if (id === 'line') visualizationDrawers.drawLine(canvas, timeData, visualization.visSettings.line)
        if (id === 'bars') visualizationDrawers.drawBars(canvas, timeData, visualization.visSettings.bars)
        if (id === 'spectrum') visualizationDrawers.drawSpectrum(canvas, freqData, visualization.visSettings.spectrum)
        if (id === 'circular') visualizationDrawers.drawCircularSpectrum(canvas, freqData, visualization.visSettings.circular)
        if (id === 'mirrored') visualizationDrawers.drawMirroredBars(canvas, timeData, visualization.visSettings.mirrored)
        if (id === 'rms') visualizationDrawers.drawRmsCurve(canvas, timeData, visualization.visSettings.rms)
        if (id === 'wave3d') visualizationDrawers.drawWave3D(canvas, timeData, visualization.visSettings.wave3d)
      })
      Object.keys(canvasRendering.splitCanvasRefs.current).forEach((id) => {
        if (!visualization.selectedVis.includes(id)) {
          const el = canvasRendering.splitCanvasRefs.current[id]
          el?.parentElement?.removeChild(el)
          delete canvasRendering.splitCanvasRefs.current[id]
        }
      })
    }
  }, [
    visualization.layoutMode, 
    visualization.selectedVis, 
    visualization.visSettings, 
    renderSettings.bgColor, 
    audioPlayer.duration, 
    visualizationDrawers, 
    canvasRendering
  ])

  // Real-time render loop effect
  useEffect(() => {
    let rafId
    const tick = () => {
      if (audioPlayer.audioRef.current) {
        audioPlayer.setCurrentTime(audioPlayer.audioRef.current.currentTime)
      }
      renderRealtime()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [renderRealtime, audioPlayer])

  // Draw static waveform preview
  useEffect(() => {
    canvasRendering.drawStaticWaveform(
      canvasRendering.canvasRef.current, 
      audioPlayer.waveform, 
      audioPlayer.duration, 
      audioPlayer.audioRef, 
      visualization.layoutMode
    )
    const handleResize = () => canvasRendering.drawStaticWaveform(
      canvasRendering.canvasRef.current, 
      audioPlayer.waveform, 
      audioPlayer.duration, 
      audioPlayer.audioRef, 
      visualization.layoutMode
    )
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [audioPlayer.waveform, audioPlayer.duration, visualization.layoutMode, canvasRendering])

  // Fullscreen functionality
  const toggleFullscreen = useCallback(async () => {
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
  }, [isFullscreen])

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space') {
        event.preventDefault()
        if (audioPlayer.audioUrl && audioPlayer.audioRef.current) {
          audioPlayer.onTogglePlay()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [audioPlayer.audioUrl, audioPlayer.onTogglePlay])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="unified-width">
      <h1 style={{ fontFamily: 'Bitcount Grid Double, Roboto Condensed, sans-serif' }}>MIL Sound Producer</h1>

      <FileSelector 
        onSelectFile={audioPlayer.onSelectFile} 
        selectedFile={audioPlayer.selectedFile} 
      />

      <RenderSettings 
        preset={renderSettings.preset}
        widthPx={renderSettings.widthPx}
        heightPx={renderSettings.heightPx}
        fps={renderSettings.fps}
        waveColor={renderSettings.waveColor}
        bgColor={renderSettings.bgColor}
        applyPreset={renderSettings.applyPreset}
        setWidthPx={renderSettings.setWidthPx}
        setHeightPx={renderSettings.setHeightPx}
        setFps={renderSettings.setFps}
        setWaveColor={renderSettings.setWaveColor}
        setBgColor={renderSettings.setBgColor}
      />

      <LufsAnalyzer
        selectedFile={audioPlayer.selectedFile}
        isMeasuring={lufsAnalysis.isMeasuring}
        lufsData={lufsAnalysis.lufsData}
        targetLufs={lufsAnalysis.targetLufs}
        targetTp={lufsAnalysis.targetTp}
        targetLra={lufsAnalysis.targetLra}
        isNormalizing={lufsAnalysis.isNormalizing}
        normalizedUrl={lufsAnalysis.normalizedUrl}
        preCompress={lufsAnalysis.preCompress}
        compThreshold={lufsAnalysis.compThreshold}
        compRatio={lufsAnalysis.compRatio}
        compAttack={lufsAnalysis.compAttack}
        compRelease={lufsAnalysis.compRelease}
        measuredI={lufsAnalysis.measuredI}
        measuredTP={lufsAnalysis.measuredTP}
        measuredLRA={lufsAnalysis.measuredLRA}
        setTargetLufs={lufsAnalysis.setTargetLufs}
        setTargetTp={lufsAnalysis.setTargetTp}
        setTargetLra={lufsAnalysis.setTargetLra}
        setPreCompress={lufsAnalysis.setPreCompress}
        setCompThreshold={lufsAnalysis.setCompThreshold}
        setCompRatio={lufsAnalysis.setCompRatio}
        setCompAttack={lufsAnalysis.setCompAttack}
        setCompRelease={lufsAnalysis.setCompRelease}
        measureLUFS={lufsAnalysis.measureLUFS}
        normalizeToTarget={lufsAnalysis.normalizeToTarget}
        isCollapsed={colLufs}
        onToggleCollapse={() => setColLufs(v => !v)}
      />

      <StemSeparation
        selectedFile={audioPlayer.selectedFile}
        stemModels={stemModels}
        selectedStemModel={selectedStemModel}
        isSeparating={isSeparating}
        separationProgress={separationProgress}
        separationJobId={separationJobId}
        setSelectedStemModel={setSelectedStemModel}
        separateStems={() => {/* TODO: Implement */}}
        isCollapsed={colStems}
        onToggleCollapse={() => setColStems(v => !v)}
      />

      <VocalScoreGenerator
        selectedFile={audioPlayer.selectedFile}
        isGeneratingScore={isGeneratingScore}
        generateScore={() => {/* TODO: Implement */}}
        isCollapsed={colScore}
        onToggleCollapse={() => setColScore(v => !v)}
      />

      <LyricsExtractor
        selectedFile={audioPlayer.selectedFile}
        lyricsLang={lyricsLang}
        isExtractingLyrics={isExtractingLyrics}
        setLyricsLang={setLyricsLang}
        extractLyrics={() => {/* TODO: Implement */}}
        isCollapsed={colLyrics}
        onToggleCollapse={() => setColLyrics(v => !v)}
      />

      <VisualizationSettings
        selectedVis={visualization.selectedVis}
        layoutMode={visualization.layoutMode}
        visSettings={visualization.visSettings}
        toggleVis={visualization.toggleVis}
        setLayoutMode={visualization.setLayoutMode}
        updateVisSetting={visualization.updateVisSetting}
        isCollapsed={colVisualGroup}
        onToggleCollapse={() => setColVisualGroup(v => !v)}
      />

      <CanvasVisualization
        layoutMode={visualization.layoutMode}
        selectedVis={visualization.selectedVis}
        visSettings={visualization.visSettings}
        bgColor={renderSettings.bgColor}
        duration={audioPlayer.duration}
        audioRef={audioPlayer.audioRef}
        renderRealtime={renderRealtime}
        onSeek={audioPlayer.onSeek}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
      />

      <LyricsDisplay
        parsedLrc={parsedLrc}
        audioRef={audioPlayer.audioRef}
        isCollapsed={colLyricLine}
        onToggleCollapse={() => setColLyricLine(true)}
      />

      <AudioControls
        audioUrl={audioPlayer.audioUrl}
        selectedFile={audioPlayer.selectedFile}
        isPlaying={audioPlayer.isPlaying}
        currentTime={audioPlayer.currentTime}
        duration={audioPlayer.duration}
        formatTime={audioPlayer.formatTime}
        onTogglePlay={audioPlayer.onTogglePlay}
        isRecording={isRecording}
        startRecording={() => {/* TODO: Implement */}}
        stopRecording={() => {/* TODO: Implement */}}
        recordUrl={recordUrl}
        isCollapsed={colControls}
      />

      <RenderControls
        selectedFile={audioPlayer.selectedFile}
        jobStatus={renderSettings.jobStatus}
        jobProgress={renderSettings.jobProgress}
        startRenderAsync={renderSettings.startRenderAsync}
        isCollapsed={colRender}
      />

      {!colPlayer && (
        <audio
          ref={audioPlayer.audioRef}
          src={audioPlayer.audioUrl}
          onPlay={() => audioPlayer.setIsPlaying(true)}
          onPause={() => audioPlayer.setIsPlaying(false)}
          onTimeUpdate={() => audioPlayer.setCurrentTime(audioPlayer.audioRef.current?.currentTime || 0)}
          controls
          style={{ display: audioPlayer.audioUrl ? 'block' : 'none', margin: '0 auto' }}
        />
      )}
    </div>
  )
}

export default App
