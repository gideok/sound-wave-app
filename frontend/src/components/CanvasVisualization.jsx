import React from 'react'

const CanvasVisualization = ({
  layoutMode,
  selectedVis,
  visSettings,
  bgColor,
  duration,
  audioRef,
  renderRealtime,
  onSeek,
  isFullscreen,
  toggleFullscreen,
  canvasRef,
  splitCanvasRefs
}) => {
  return (
    <div style={{ marginTop: 10 }}>
      {layoutMode === 'overlay' ? (
        <div id="canvas-container" className="section-card unified-width canvas-card" onClick={onSeek} style={{ position: 'relative', margin: 0 }}>
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
        <div id="canvas-container" className="section-card unified-width canvas-card" style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr', position: 'relative', margin: 0 }}>
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
    </div>
  )
}

export default CanvasVisualization
