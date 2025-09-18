import React from 'react'

const VocalScoreGenerator = ({ selectedFile, isGeneratingScore, generateScore, isCollapsed, onToggleCollapse }) => {
  return (
    <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', position: 'relative' }}>
      <h2 className="section-title">Vocal Score</h2>
      <button style={{ position: 'absolute', top: 8, right: 8 }} onClick={onToggleCollapse} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? '▢' : '▣'}</button>
      {!isCollapsed && (
        <div className="controls-row">
          <button
            disabled={!selectedFile || isGeneratingScore}
            style={isGeneratingScore ? { animation: 'pulse 1s infinite', background: '#365dfb' } : undefined}
            onClick={() => generateScore(selectedFile)}
          >
            {isGeneratingScore ? 'In progress...' : 'Generate Vocal Score (MIDI + MusicXML/PDF)'}
          </button>
        </div>
      )}
    </div>
  )
}

export default VocalScoreGenerator
