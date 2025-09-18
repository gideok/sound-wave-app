import React from 'react'
import { LUFS_RANGE } from '../constants/audio'

const LufsBar = ({ targetLufs, measuredI }) => {
  const minLufs = LUFS_RANGE.MIN
  const maxLufs = LUFS_RANGE.MAX
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const toPct = (v) => ((clamp(v, minLufs, maxLufs) - minLufs) / (maxLufs - minLufs)) * 100
  const targetPct = toPct(targetLufs)
  const measuredPct = measuredI !== undefined ? toPct(measuredI) : null

  return (
    <div style={{ width: 520, maxWidth: '95%', position: 'relative' }}>
      <div style={{ height: 14, background: '#222b4a', borderRadius: 8, position: 'relative' }}>
        <div style={{ position: 'absolute', left: `${targetPct}%`, top: -4, width: 2, height: 22, background: '#ff9f0a' }} />
        {measuredPct !== null && (
          <div style={{ position: 'absolute', left: `${measuredPct}%`, top: -4, width: 2, height: 22, background: '#5ac8fa' }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#99a2d1', marginTop: 4 }}>
        <span>-36</span>
        <span>-24</span>
        <span>-18</span>
        <span>-14</span>
        <span>-12</span>
        <span>-6</span>
        <span>0</span>
      </div>
    </div>
  )
}

const LufsAnalyzer = ({
  selectedFile,
  isMeasuring,
  lufsData,
  targetLufs,
  targetTp,
  targetLra,
  isNormalizing,
  normalizedUrl,
  preCompress,
  compThreshold,
  compRatio,
  compAttack,
  compRelease,
  measuredI,
  measuredTP,
  measuredLRA,
  setTargetLufs,
  setTargetTp,
  setTargetLra,
  setPreCompress,
  setCompThreshold,
  setCompRatio,
  setCompAttack,
  setCompRelease,
  measureLUFS,
  normalizeToTarget,
  isCollapsed,
  onToggleCollapse
}) => {
  const numberInput = (value, onChange, props = {}) => (
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} {...props} />
  )

  return (
    <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', position: 'relative' }}>
      <h2 className="section-title">LUFS Analyzer</h2>
      <button style={{ position: 'absolute', top: 8, right: 8 }} onClick={onToggleCollapse} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? '▢' : '▣'}</button>
      {!isCollapsed && (
        <>
          <div className="controls-row">
            <button disabled={!selectedFile || isMeasuring} onClick={() => measureLUFS(selectedFile)}>
              {isMeasuring ? 'Measuring…' : 'Measure LUFS'}
            </button>
            {lufsData && (
              <div className="controls-row">
                <span><b>I</b>: {Number.isFinite(measuredI) ? measuredI.toFixed(3) : '-'} LUFS</span>
                <span><b>TP</b>: {Number.isFinite(measuredTP) ? measuredTP.toFixed(3) : '-'} dBTP</span>
                <span><b>LRA</b>: {Number.isFinite(measuredLRA) ? measuredLRA.toFixed(3) : '-'} dB</span>
              </div>
            )}
          </div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <LufsBar targetLufs={targetLufs} measuredI={measuredI} />
            <div className="controls-row" style={{ justifyContent: 'space-between', width: '100%' }}>
              <div className="controls-row">
                <label>Target LUFS</label>
                {numberInput(targetLufs, setTargetLufs, { step: 0.5, style: { width: 96 } })}
                <label>TP</label>
                {numberInput(targetTp, setTargetTp, { step: 0.1, style: { width: 80 } })}
                <label>LRA</label>
                {numberInput(targetLra, setTargetLra, { step: 0.5, style: { width: 80 } })}
              </div>
              <button disabled={!selectedFile || isNormalizing} onClick={() => normalizeToTarget(selectedFile)}>
                {isNormalizing ? 'Normalizing…' : 'Normalize & Download'}
              </button>
            </div>
            <div className="controls-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={preCompress} onChange={(e) => setPreCompress(e.target.checked)} /> Tighten dynamics
              </label>
              {preCompress && (
                <>
                  <label>Thr (dB)</label>
                  {numberInput(compThreshold, setCompThreshold, { step: 1, style: { width: 80 } })}
                  <label>Ratio</label>
                  {numberInput(compRatio, setCompRatio, { step: 0.5, style: { width: 80 } })}
                  <label>Atk (ms)</label>
                  {numberInput(compAttack, setCompAttack, { step: 5, style: { width: 80 } })}
                  <label>Rel (ms)</label>
                  {numberInput(compRelease, setCompRelease, { step: 10, style: { width: 80 } })}
                </>
              )}
            </div>
          </div>
          {normalizedUrl && (
            <audio src={normalizedUrl} controls style={{ width: '100%' }} />
          )}
        </>
      )}
    </div>
  )
}

export default LufsAnalyzer
