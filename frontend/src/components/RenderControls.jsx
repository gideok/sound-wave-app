import React from 'react'

const RenderControls = ({
  selectedFile,
  jobStatus,
  jobProgress,
  startRenderAsync,
  isCollapsed
}) => {
  if (isCollapsed) return null

  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <button disabled={!selectedFile} onClick={() => startRenderAsync(selectedFile)}>
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
    </>
  )
}

export default RenderControls
