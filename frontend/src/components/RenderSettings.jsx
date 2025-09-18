import React from 'react'
import { RENDER_PRESETS } from '../constants/audio'

const RenderSettings = ({ 
  preset, 
  widthPx, 
  heightPx, 
  fps, 
  waveColor, 
  bgColor, 
  applyPreset, 
  setWidthPx, 
  setHeightPx, 
  setFps, 
  setWaveColor, 
  setBgColor 
}) => {
  const numberInput = (value, onChange, props = {}) => (
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} {...props} />
  )

  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
      <label>Preset:</label>
      <select value={preset} onChange={(e) => applyPreset(e.target.value)}>
        <option value={RENDER_PRESETS.CUSTOM}>Custom</option>
        <option value={RENDER_PRESETS.HD_1080P}>1080p (1920x1080)</option>
        <option value={RENDER_PRESETS.HD_720P}>720p (1280x720)</option>
        <option value={RENDER_PRESETS.SQUARE}>Square (1080x1080)</option>
        <option value={RENDER_PRESETS.VERTICAL}>Vertical (1080x1920)</option>
      </select>
      <label>Size:</label>
      {numberInput(widthPx, (v) => { applyPreset(RENDER_PRESETS.CUSTOM); setWidthPx(v) }, { min: 320, step: 1, style: { width: 96 } })}
      <span>x</span>
      {numberInput(heightPx, (v) => { applyPreset(RENDER_PRESETS.CUSTOM); setHeightPx(v) }, { min: 180, step: 1, style: { width: 96 } })}
      <label>FPS:</label>
      {numberInput(fps, setFps, { min: 1, max: 60, step: 1, style: { width: 64 } })}
      <label>Wave:</label>
      <input type="color" value={waveColor} onChange={(e) => setWaveColor(e.target.value)} />
      <label>BG:</label>
      <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
    </div>
  )
}

export default RenderSettings
