import React from 'react'

const StemSeparation = ({
  selectedFile,
  stemModels,
  selectedStemModel,
  isSeparating,
  separationProgress,
  separationJobId,
  setSelectedStemModel,
  separateStems,
  isCollapsed,
  onToggleCollapse
}) => {
  return (
    <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', position: 'relative' }}>
      <h2 className="section-title">Stem Separation</h2>
      <button style={{ position: 'absolute', top: 8, right: 8 }} onClick={onToggleCollapse} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? '▢' : '▣'}</button>
      {!isCollapsed && (
        <>
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
                  onClick={() => separateStems(selectedFile)}
                >
                  {isSeparating ? 'Separating...' : 'Separate Stems'}
                </button>
              </div>
            </>
          )}
          {stemModels.length > 0 && (
            <div style={{ fontSize: '12px', color: '#99a2d1', textAlign: 'center', maxWidth: '600px' }}>
              {stemModels.find(m => m.id === selectedStemModel)?.description || ''}
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
        </>
      )}
    </div>
  )
}

export default StemSeparation
