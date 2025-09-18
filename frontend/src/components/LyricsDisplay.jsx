import React from 'react'

const LyricsDisplay = ({ parsedLrc, audioRef, isCollapsed, onToggleCollapse }) => {
  if (parsedLrc.length === 0 || isCollapsed) return null

  return (
    <div className="section-card unified-width" style={{ textAlign: 'center', paddingTop: 8, paddingBottom: 12, position: 'relative' }}>
      <button style={{ position: 'absolute', top: 8, right: 8 }} onClick={onToggleCollapse} title={'Collapse'}>▣</button>
      {(() => {
        let idx = -1
        for (let i = 0; i < parsedLrc.length; i++) {
          if (parsedLrc[i].time <= (audioRef.current?.currentTime || 0)) idx = i
          else break
        }
        const prev = idx > 0 ? parsedLrc[idx - 1].text : ''
        const curr = idx >= 0 ? parsedLrc[idx].text : ''
        const next = idx + 1 < parsedLrc.length ? parsedLrc[idx + 1].text : ''
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
            {prev ? <div style={{ opacity: 0.5, fontSize: 14 }}>{prev}</div> : null}
            <div style={{ fontSize: 18, fontWeight: 700 }}>{curr}</div>
            {next ? <div style={{ opacity: 0.6, fontSize: 14 }}>{next}</div> : null}
          </div>
        )
      })()}
    </div>
  )
}

export default LyricsDisplay
