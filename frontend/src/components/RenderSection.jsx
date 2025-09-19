import React from 'react'
import { RENDER_PRESETS } from '../constants/audio'

const RenderSection = ({
  selectedFile,
  preset,
  widthPx,
  heightPx,
  fps,
  applyPreset,
  setWidthPx,
  setHeightPx,
  setFps,
  jobStatus,
  jobProgress,
  startRenderAsync,
  isCollapsed,
  onToggleCollapse,
  showUploadReminder,
  setShowUploadReminder,
  selectedVis,
  visSettings
}) => {
  const numberInput = (value, onChange, props = {}) => (
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} {...props} />
  )

  const handleRender = () => {
    if (!selectedFile) {
      setShowUploadReminder(true)
      setTimeout(() => setShowUploadReminder(false), 3000)
      return
    }
    startRenderAsync(selectedFile, selectedVis, visSettings)
  }

  return (
    <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', position: 'relative' }}>
      <h2 className="section-title">Video Rendering</h2>
      <button style={{ position: 'absolute', top: 8, right: 8 }} onClick={onToggleCollapse} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? '▢' : '▣'}</button>
      {!isCollapsed && (
        <>
          {/* Render Settings */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center', width: '100%' }}>
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
          </div>

          {/* Selected Visualization Info */}
          <div style={{ 
            backgroundColor: 'rgba(31, 41, 55, 0.3)', 
            padding: '8px 16px', 
            borderRadius: '8px', 
            border: '1px solid rgba(55, 65, 81, 0.5)',
            textAlign: 'center',
            fontSize: '14px',
            color: '#e2e8f0'
          }}>
            <strong>Selected Visualizations:</strong> {selectedVis.length > 0 ? selectedVis.join(', ') : 'None selected'}
            {selectedVis.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '12px' }}>
                <strong>Colors:</strong> {selectedVis.map(vis => (
                  <span key={vis} style={{ margin: '0 4px' }}>
                    {vis}: <span style={{ color: visSettings[vis]?.color || '#5ac8fa' }}>●</span>
                  </span>
                ))}
              </div>
            )}
            {selectedVis.length > 1 && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#f59e0b' }}>
                ⚠️ Currently rendering only the first visualization: {selectedVis[0]}
              </div>
            )}
            {(selectedVis.includes('spectrum') || selectedVis.includes('bars')) && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#6b7280' }}>
                ℹ️ All visualizations use basic waveform mode for maximum compatibility
              </div>
            )}
          </div>

          {/* Render Button */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
            <button 
              onClick={handleRender}
              disabled={selectedVis.length === 0}
              style={{
                backgroundColor: selectedVis.length === 0 ? '#6b7280' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: selectedVis.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s ease'
              }}
            >
              {jobStatus === 'running' || jobStatus === 'starting' ? 'Rendering...' : 'Render MP4'}
            </button>
          </div>

          {/* Progress Bar */}
          {(jobStatus === 'running' || jobStatus === 'starting') && (
            <div style={{ width: 400, margin: '0 auto' }}>
              <div style={{ height: 8, background: '#222b4a', borderRadius: 4 }}>
                <div style={{ height: 8, width: `${Math.round(jobProgress * 100)}%`, background: '#5ac8fa', borderRadius: 4 }} />
              </div>
              <div style={{ textAlign: 'center', marginTop: 6 }}>{Math.round(jobProgress * 100)}%</div>
            </div>
          )}

          {/* Warning Message */}
          {selectedVis.length === 0 && (
            <div style={{ 
              backgroundColor: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.3)', 
              borderRadius: '8px', 
              padding: '8px 16px', 
              color: '#fca5a5',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              ⚠️ Please select at least one visualization type to render video
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default RenderSection
