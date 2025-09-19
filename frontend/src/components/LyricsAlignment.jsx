import React, { useState, useRef } from 'react'
import PropTypes from 'prop-types'

const LyricsAlignment = ({
  selectedFile,
  alignLyricsText,
  setAlignLyricsText,
  isAligningLyrics,
  alignLang,
  setAlignLang,
  alignModel,
  setAlignModel,
  alignLyrics,
  setLastLrcText,
  isCollapsed,
  onToggleCollapse,
  showUploadReminder,
  setShowUploadReminder
}) => {
  const fileInputRef = useRef(null)

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target.result
      setAlignLyricsText(content)
      setLastLrcText(content)
    }
    reader.readAsText(file)
  }

  const handleAlignLyrics = () => {
    if (!selectedFile) {
      setShowUploadReminder(true)
      setTimeout(() => setShowUploadReminder(false), 3000)
      return
    }
    if (!alignLyricsText.trim()) {
      alert('Please enter lyrics text.')
      return
    }
    alignLyrics(selectedFile, alignLang, alignModel, alignLyricsText)
  }

  return (
    <div className="section-card" style={{ position: 'relative' }}>
      <h2 className="section-title">Lyrics Alignment</h2>
      <button 
        style={{ position: 'absolute', top: 8, right: 8 }} 
        onClick={onToggleCollapse} 
        title={isCollapsed ? 'Expand' : 'Collapse'}
      >
        {isCollapsed ? '▢' : '▣'}
      </button>
      
      {!isCollapsed && (
        <div className="section-content">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              LRC File Upload:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".lrc,.txt"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Select File
              </button>
              <span style={{ fontSize: '12px', color: '#6c757d' }}>
                Select .lrc or .txt file
              </span>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
              Lyrics Text (Manual Input):
            </label>
            <textarea
              value={alignLyricsText}
              onChange={(e) => {
                setAlignLyricsText(e.target.value)
                setLastLrcText(e.target.value)
              }}
              placeholder="Enter lyrics text or upload LRC file..."
              style={{
                width: '100%',
                height: '120px',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                resize: 'vertical',
                fontFamily: 'Roboto Condensed, sans-serif',
                fontSize: '14px',
                lineHeight: '1.4',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Language:
              </label>
              <select
                value={alignLang}
                onChange={(e) => setAlignLang(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  color: '#111827',
                  cursor: 'pointer'
                }}
              >
                <option value="ko">Korean</option>
                <option value="en">English</option>
                <option value="ja">Japanese</option>
                <option value="zh">Chinese</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>
                Model Size:
              </label>
              <select
                value={alignModel}
                onChange={(e) => setAlignModel(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  backgroundColor: 'white',
                  color: '#111827',
                  cursor: 'pointer'
                }}
              >
                <option value="tiny">Tiny (Fast)</option>
                <option value="base">Base (Balanced)</option>
                <option value="small">Small (Accurate)</option>
                <option value="medium">Medium (Very Accurate)</option>
                <option value="large">Large (Highest Accuracy)</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleAlignLyrics}
            disabled={!selectedFile || !alignLyricsText.trim() || isAligningLyrics}
            style={{
              padding: '12px 24px',
              backgroundColor: isAligningLyrics ? '#6c757d' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isAligningLyrics ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {isAligningLyrics ? 'Aligning Lyrics...' : 'Start Lyrics Alignment'}
          </button>

          {isAligningLyrics && (
            <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              <p style={{ margin: 0, color: '#6c757d' }}>
                Aligning lyrics with audio. Please wait...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

LyricsAlignment.propTypes = {
  selectedFile: PropTypes.object,
  alignLyricsText: PropTypes.string.isRequired,
  setAlignLyricsText: PropTypes.func.isRequired,
  isAligningLyrics: PropTypes.bool.isRequired,
  alignLang: PropTypes.string.isRequired,
  setAlignLang: PropTypes.func.isRequired,
  alignModel: PropTypes.string.isRequired,
  setAlignModel: PropTypes.func.isRequired,
  alignLyrics: PropTypes.func.isRequired,
  setLastLrcText: PropTypes.func.isRequired,
  isCollapsed: PropTypes.bool.isRequired,
  onToggleCollapse: PropTypes.func.isRequired
}

export default React.memo(LyricsAlignment)
