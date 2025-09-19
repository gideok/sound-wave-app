import React, { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

// Components
import FileSelector from './components/FileSelector'
import LufsAnalyzer from './components/LufsAnalyzer'
import StemSeparation from './components/StemSeparation'
import VocalScoreGenerator from './components/VocalScoreGenerator'
import LyricsExtractor from './components/LyricsExtractor'
import LyricsAlignment from './components/LyricsAlignment'
import VisualizationSettings from './components/VisualizationSettings'
import CanvasVisualization from './components/CanvasVisualization'
import AudioControls from './components/AudioControls'
import RenderSection from './components/RenderSection'
import LyricsDisplay from './components/LyricsDisplay'

// Hooks
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useLufsAnalysis } from './hooks/useLufsAnalysis'
import { useVisualization } from './hooks/useVisualization'
import { useRenderSettings } from './hooks/useRenderSettings'
import { useCanvasRendering } from './hooks/useCanvasRendering'
import { useVisualizationDrawers } from './hooks/useVisualizationDrawers'
import { useStemSeparation } from './hooks/useStemSeparation'
import { useLyricsProcessing } from './hooks/useLyricsProcessing'
import { useRecording } from './hooks/useRecording'

// Constants
import { DEFAULT_LAYOUT_MODE } from './constants/visualization'

function App() {
  console.log('App component rendering...')
  
  // Collapsible state for each section
  const [colLufs, setColLufs] = useState(false)
  const [colStems, setColStems] = useState(false)
  const [colScore, setColScore] = useState(false)
  const [colLyrics, setColLyrics] = useState(false)
  const [colAlign, setColAlign] = useState(false)
  const [colVisualGroup, setColVisualGroup] = useState(false)
  const [colControls] = useState(false)
  const [colRender] = useState(false)
  const [colPlayer] = useState(false)

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Global collapse state
  const [allCollapsed, setAllCollapsed] = useState(false)
  
  // Upload reminder modal state
  const [showUploadReminder, setShowUploadReminder] = useState(false)

  console.log('Initializing hooks...')
  
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
  const stemSeparation = useStemSeparation()
  const lyricsProcessing = useLyricsProcessing()
  const recording = useRecording()

  console.log('Hooks initialized successfully')

  // Global collapse/expand functions
  const toggleAllCollapse = useCallback(() => {
    const newState = !allCollapsed
    setAllCollapsed(newState)
    setColLufs(newState)
    setColStems(newState)
    setColScore(newState)
    setColLyrics(newState)
    setColAlign(newState)
    setColVisualGroup(newState)
    // colLyricLine is excluded from global collapse/expand
  }, [allCollapsed])

  useEffect(() => {
    lyricsProcessing.setParsedLrc(lyricsProcessing.parseLrc(lyricsProcessing.lastLrcText))
  }, [lyricsProcessing.lastLrcText])

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

  console.log('Rendering main component...')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="unified-width">
      <h1 style={{ fontFamily: 'Bitcount Grid Double, Roboto Condensed, sans-serif' }}>MIL Sound Producer</h1>

      <FileSelector 
        onSelectFile={audioPlayer.onSelectFile} 
        selectedFile={audioPlayer.selectedFile} 
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
        showUploadReminder={showUploadReminder}
        setShowUploadReminder={setShowUploadReminder}
      />

      <StemSeparation
        selectedFile={audioPlayer.selectedFile}
        stemModels={stemSeparation.stemModels}
        selectedStemModel={stemSeparation.selectedStemModel}
        isSeparating={stemSeparation.isSeparating}
        separationProgress={stemSeparation.separationProgress}
        separationJobId={stemSeparation.separationJobId}
        setSelectedStemModel={stemSeparation.setSelectedStemModel}
        separateStems={stemSeparation.separateStems}
        isCollapsed={colStems}
        onToggleCollapse={() => setColStems(v => !v)}
        showUploadReminder={showUploadReminder}
        setShowUploadReminder={setShowUploadReminder}
      />

      <VocalScoreGenerator
        selectedFile={audioPlayer.selectedFile}
        isGeneratingScore={lyricsProcessing.isGeneratingScore}
        generateScore={lyricsProcessing.generateScore}
        isCollapsed={colScore}
        onToggleCollapse={() => setColScore(v => !v)}
        showUploadReminder={showUploadReminder}
        setShowUploadReminder={setShowUploadReminder}
      />

      <LyricsExtractor
        selectedFile={audioPlayer.selectedFile}
        lyricsLang={lyricsProcessing.lyricsLang}
        isExtractingLyrics={lyricsProcessing.isExtractingLyrics}
        setLyricsLang={lyricsProcessing.setLyricsLang}
        extractLyrics={lyricsProcessing.extractLyrics}
        isCollapsed={colLyrics}
        onToggleCollapse={() => setColLyrics(v => !v)}
        setShowUploadReminder={setShowUploadReminder}
      />

      <LyricsAlignment
        selectedFile={audioPlayer.selectedFile}
        alignLyricsText={lyricsProcessing.alignLyricsText}
        setAlignLyricsText={lyricsProcessing.setAlignLyricsText}
        isAligningLyrics={lyricsProcessing.isAligningLyrics}
        alignLang={lyricsProcessing.alignLang}
        setAlignLang={lyricsProcessing.setAlignLang}
        alignModel={lyricsProcessing.alignModel}
        setAlignModel={lyricsProcessing.setAlignModel}
        alignLyrics={lyricsProcessing.alignLyrics}
        setLastLrcText={lyricsProcessing.setLastLrcText}
        isCollapsed={colAlign}
        onToggleCollapse={() => setColAlign(v => !v)}
        showUploadReminder={showUploadReminder}
        setShowUploadReminder={setShowUploadReminder}
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
        canvasRef={canvasRendering.canvasRef}
        splitCanvasRefs={canvasRendering.splitCanvasRefs}
      />

      <LyricsDisplay
        parsedLrc={lyricsProcessing.parsedLrc}
        audioRef={audioPlayer.audioRef}
      />

      <AudioControls
        audioUrl={audioPlayer.audioUrl}
        selectedFile={audioPlayer.selectedFile}
        isPlaying={audioPlayer.isPlaying}
        currentTime={audioPlayer.currentTime}
        duration={audioPlayer.duration}
        formatTime={audioPlayer.formatTime}
        onTogglePlay={audioPlayer.onTogglePlay}
        isRecording={recording.isRecording}
        startRecording={() => recording.startRecording(audioPlayer.audioRef, visualization.layoutMode, canvasRendering.canvasRef)}
        stopRecording={recording.stopRecording}
        recordUrl={recording.recordUrl}
        isCollapsed={colControls}
        showUploadReminder={showUploadReminder}
        setShowUploadReminder={setShowUploadReminder}
      />

      <RenderSection
        selectedFile={audioPlayer.selectedFile}
        preset={renderSettings.preset}
        widthPx={renderSettings.widthPx}
        heightPx={renderSettings.heightPx}
        fps={renderSettings.fps}
        applyPreset={renderSettings.applyPreset}
        setWidthPx={renderSettings.setWidthPx}
        setHeightPx={renderSettings.setHeightPx}
        setFps={renderSettings.setFps}
        jobStatus={renderSettings.jobStatus}
        jobProgress={renderSettings.jobProgress}
        startRenderAsync={renderSettings.startRenderAsync}
        isCollapsed={colRender}
        onToggleCollapse={() => setColRender(v => !v)}
        showUploadReminder={showUploadReminder}
        setShowUploadReminder={setShowUploadReminder}
        selectedVis={visualization.selectedVis}
        visSettings={visualization.visSettings}
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

      {/* Floating Collapse/Expand Button */}
      <button
        onClick={toggleAllCollapse}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: allCollapsed ? '#10b981' : '#ef4444',
          color: 'white',
          border: 'none',
          fontSize: '24px',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          fontFamily: 'monospace'
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.1)'
          e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.25)'
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)'
          e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}
        title={allCollapsed ? 'Expand All Sections' : 'Collapse All Sections'}
      >
        {allCollapsed ? '⤢' : '⤡'}
      </button>

      {/* Upload Reminder Modal */}
      {showUploadReminder && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.3s ease-in-out'
          }}
          onClick={() => setShowUploadReminder(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '400px',
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
              animation: 'slideIn 0.3s ease-out',
              border: '1px solid #e5e7eb'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: '48px',
                marginBottom: '16px',
                color: '#6b7280'
              }}
            >
              🎵
            </div>
            <h3
              style={{
                fontSize: '20px',
                fontWeight: '600',
                color: '#111827',
                marginBottom: '12px',
                fontFamily: 'Roboto Condensed, sans-serif'
              }}
            >
              Please Upload Audio File First
            </h3>
            <p
              style={{
                fontSize: '14px',
                color: '#6b7280',
                lineHeight: '1.5',
                marginBottom: '20px'
              }}
            >
              You need to upload an audio file before using the collapse/expand functionality.
            </p>
            <button
              onClick={() => setShowUploadReminder(false)}
              style={{
                backgroundColor: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#2563eb'
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#3b82f6'
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App