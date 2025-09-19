import React from 'react'

const LyricsExtractor = ({ 
  selectedFile, 
  lyricsLang, 
  isExtractingLyrics, 
  setLyricsLang, 
  extractLyrics, 
  isCollapsed, 
  onToggleCollapse,
  setShowUploadReminder
}) => {
  const handleExtractLyrics = () => {
    if (!selectedFile) {
      setShowUploadReminder(true)
      setTimeout(() => setShowUploadReminder(false), 3000)
      return
    }
    extractLyrics(selectedFile, lyricsLang)
  }

  return (
    <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', position: 'relative' }}>
      <h2 className="section-title">Lyrics (Korean/English)</h2>
      <button style={{ position: 'absolute', top: 8, right: 8 }} onClick={onToggleCollapse} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? '▢' : '▣'}</button>
      {!isCollapsed && (
        <div className="controls-row" style={{ gap: 8 }}>
          <label>Language</label>
          <select value={lyricsLang} onChange={(e) => setLyricsLang(e.target.value)}>
            <option value="auto">Auto</option>
            <option value="ko">Korean</option>
            <option value="en">English</option>
          </select>
          <button
            disabled={isExtractingLyrics}
            style={isExtractingLyrics ? { animation: 'pulse 1s infinite', background: '#365dfb' } : undefined}
            onClick={handleExtractLyrics}
          >
            {isExtractingLyrics ? 'In progress...' : 'Extract Lyrics (.lrc + .txt)'}
          </button>
        </div>
      )}
    </div>
  )
}

export default LyricsExtractor
