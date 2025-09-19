import { useState, useCallback, useEffect } from 'react'
import { DEFAULT_RENDER_SETTINGS, PRESET_DIMENSIONS, RENDER_PRESETS } from '../constants/audio'

export const useRenderSettings = () => {
  const [widthPx, setWidthPx] = useState(DEFAULT_RENDER_SETTINGS.width)
  const [heightPx, setHeightPx] = useState(DEFAULT_RENDER_SETTINGS.height)
  const [fps, setFps] = useState(DEFAULT_RENDER_SETTINGS.fps)
  const [waveColor, setWaveColor] = useState(DEFAULT_RENDER_SETTINGS.waveColor)
  const [bgColor, setBgColor] = useState(DEFAULT_RENDER_SETTINGS.bgColor)
  const [preset, setPreset] = useState(DEFAULT_RENDER_SETTINGS.preset)
  const [jobProgress, setJobProgress] = useState(0)
  const [jobStatus, setJobStatus] = useState('idle')

  const applyPreset = useCallback((value) => {
    setPreset(value)
    if (value === RENDER_PRESETS.HD_1080P) {
      setWidthPx(1920); setHeightPx(1080)
    } else if (value === RENDER_PRESETS.HD_720P) {
      setWidthPx(1280); setHeightPx(720)
    } else if (value === RENDER_PRESETS.SQUARE) {
      setWidthPx(1080); setHeightPx(1080)
    } else if (value === RENDER_PRESETS.VERTICAL) {
      setWidthPx(1080); setHeightPx(1920)
    } else {
      // custom - do not change current values
    }
  }, [])

  const toHex0x = useCallback((hex) => {
    if (!hex) return '0x000000'
    if (hex.startsWith('#')) return '0x' + hex.slice(1)
    if (hex.startsWith('0x') || hex.startsWith('0X')) return hex
    return '0x' + hex
  }, [])

  const pollProgress = useCallback(async (id, selectedFile) => {
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
  }, [])

  const startRenderAsync = useCallback(async (selectedFile, selectedVis = ['line'], visSettings = {}) => {
    if (!selectedFile) return
    try {
      setJobProgress(0); setJobStatus('starting')
      const form = new FormData()
      form.append('file', selectedFile)
      
      // Create color mapping for selected visualizations
      const visualizationColors = selectedVis.map(vis => {
        const color = visSettings[vis]?.color || '#5ac8fa'
        // Convert #RRGGBB to 0xRRGGBB format
        return color.startsWith('#') ? '0x' + color.slice(1) : color
      })
      
      const qs = new URLSearchParams({
        width: String(widthPx), height: String(heightPx), fps: String(fps),
        color: toHex0x(waveColor), background: toHex0x(bgColor),
        visualization_types: selectedVis.join(','),
        visualization_colors: visualizationColors.join(',')
      })
      const resp = await fetch('http://localhost:8000/api/render/start?' + qs.toString(), { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setJobStatus('running')
      pollProgress(data.job_id, selectedFile)
    } catch (e) {
      setJobStatus('failed')
      alert('Start failed: ' + (e?.message || e))
    }
  }, [widthPx, heightPx, fps, waveColor, bgColor, toHex0x, pollProgress])

  return {
    widthPx,
    heightPx,
    fps,
    waveColor,
    bgColor,
    preset,
    jobProgress,
    jobStatus,
    setWidthPx,
    setHeightPx,
    setFps,
    setWaveColor,
    setBgColor,
    applyPreset,
    startRenderAsync
  }
}
