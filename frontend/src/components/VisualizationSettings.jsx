import React, { useCallback } from 'react'
import { VIS_TYPES } from '../constants/visualization'

const VisualizationSettings = ({
  selectedVis,
  layoutMode,
  visSettings,
  toggleVis,
  setLayoutMode,
  updateVisSetting,
  isCollapsed,
  onToggleCollapse
}) => {
  const numberInput = useCallback((value, onChange, props = {}) => (
    <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value || 0))} {...props} />
  ), [])

  return (
    <div className="section-card unified-width" style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label>Visuals / Settings / Canvas</label>
      </div>
      <button style={{ position: 'absolute', top: 8, right: 8 }} onClick={onToggleCollapse} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? '▢' : '▣'}</button>
      {!isCollapsed && (
        <>
          {/* Visuals Selection */}
          <div className="visuals-grid">
            {VIS_TYPES.map(v => (
              <label key={v.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={selectedVis.includes(v.id)} onChange={() => toggleVis(v.id)} /> {v.label}
              </label>
            ))}
          </div>
          <div className="layout-row">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <b>Layout</b>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="radio" name="layout" value="overlay" checked={layoutMode === 'overlay'} onChange={() => setLayoutMode('overlay')} /> Overlay
              </label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="radio" name="layout" value="split" checked={layoutMode === 'split'} onChange={() => setLayoutMode('split')} /> Split
              </label>
            </div>
          </div>

          {/* Visual Settings */}
          <div style={{ marginTop: 10 }}>
            <table className="settings-table">
              <tbody>
                {selectedVis.includes('line') && (
                  <tr>
                    <td className="visual-name-cell">Line</td>
                    <td className="label-cell">Color</td>
                    <td className="input-cell">
                      <input type="color" value={visSettings.line.color} onChange={(e) => updateVisSetting('line', 'color', e.target.value)} className="settings-color" />
                    </td>
                    <td className="label-cell">Thickness</td>
                    <td className="input-cell">
                      {numberInput(visSettings.line.thickness, (v) => updateVisSetting('line', 'thickness', v), { min: 1, max: 8, step: 1, className: "settings-input" })}
                    </td>
                    <td className="label-cell">Sensitivity</td>
                    <td className="input-cell">
                      {numberInput(visSettings.line.sensitivity, (v) => updateVisSetting('line', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                    </td>
                    <td></td>
                  </tr>
                )}
                {selectedVis.includes('bars') && (
                  <tr>
                    <td className="visual-name-cell">Bars</td>
                    <td className="label-cell">Color</td>
                    <td className="input-cell">
                      <input type="color" value={visSettings.bars.color} onChange={(e) => updateVisSetting('bars', 'color', e.target.value)} className="settings-color" />
                    </td>
                    <td className="label-cell">Columns</td>
                    <td className="input-cell">
                      {numberInput(visSettings.bars.columns, (v) => updateVisSetting('bars', 'columns', v), { min: 50, max: 400, step: 10, className: "settings-input" })}
                    </td>
                    <td className="label-cell">Sensitivity</td>
                    <td className="input-cell">
                      {numberInput(visSettings.bars.sensitivity, (v) => updateVisSetting('bars', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                    </td>
                    <td></td>
                  </tr>
                )}
                {selectedVis.includes('spectrum') && (
                  <tr>
                    <td className="visual-name-cell">Spectrum</td>
                    <td className="label-cell">Color</td>
                    <td className="input-cell">
                      <input type="color" value={visSettings.spectrum.color} onChange={(e) => updateVisSetting('spectrum', 'color', e.target.value)} className="settings-color" />
                    </td>
                    <td className="label-cell">Columns</td>
                    <td className="input-cell">
                      {numberInput(visSettings.spectrum.columns, (v) => updateVisSetting('spectrum', 'columns', v), { min: 32, max: 512, step: 8, className: "settings-input" })}
                    </td>
                    <td className="label-cell">Sensitivity</td>
                    <td className="input-cell">
                      {numberInput(visSettings.spectrum.sensitivity, (v) => updateVisSetting('spectrum', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                    </td>
                    <td></td>
                  </tr>
                )}
                {selectedVis.includes('circular') && (
                  <>
                    <tr>
                      <td className="visual-name-cell">Circular</td>
                      <td className="label-cell">Color</td>
                      <td className="input-cell">
                        <input type="color" value={visSettings.circular.color} onChange={(e) => updateVisSetting('circular', 'color', e.target.value)} className="settings-color" />
                      </td>
                      <td className="label-cell">Thickness</td>
                      <td className="input-cell">
                        {numberInput(visSettings.circular.thickness, (v) => updateVisSetting('circular', 'thickness', v), { min: 1, max: 6, step: 1, className: "settings-input" })}
                      </td>
                      <td className="label-cell">Sensitivity</td>
                      <td className="input-cell">
                        {numberInput(visSettings.circular.sensitivity, (v) => updateVisSetting('circular', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td></td>
                      <td className="label-cell">Radius</td>
                      <td className="input-cell">
                        {numberInput(visSettings.circular.radiusScale, (v) => updateVisSetting('circular', 'radiusScale', v), { min: 0.2, max: 0.9, step: 0.05, className: "settings-input" })}
                      </td>
                      <td className="label-cell">Segments</td>
                      <td className="input-cell">
                        {numberInput(visSettings.circular.segments, (v) => updateVisSetting('circular', 'segments', v), { min: 32, max: 512, step: 8, className: "settings-input" })}
                      </td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  </>
                )}
                {selectedVis.includes('mirrored') && (
                  <tr>
                    <td className="visual-name-cell">Mirrored</td>
                    <td className="label-cell">Color</td>
                    <td className="input-cell">
                      <input type="color" value={visSettings.mirrored.color} onChange={(e) => updateVisSetting('mirrored', 'color', e.target.value)} className="settings-color" />
                    </td>
                    <td className="label-cell">Columns</td>
                    <td className="input-cell">
                      {numberInput(visSettings.mirrored.columns, (v) => updateVisSetting('mirrored', 'columns', v), { min: 50, max: 400, step: 10, className: "settings-input" })}
                    </td>
                    <td className="label-cell">Sensitivity</td>
                    <td className="input-cell">
                      {numberInput(visSettings.mirrored.sensitivity, (v) => updateVisSetting('mirrored', 'sensitivity', v), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                    </td>
                    <td></td>
                  </tr>
                )}
                {selectedVis.includes('rms') && (
                  <tr>
                    <td className="visual-name-cell">RMS</td>
                    <td className="label-cell">Color</td>
                    <td className="input-cell">
                      <input type="color" value={visSettings.rms.color} onChange={(e) => updateVisSetting('rms', 'color', e.target.value)} className="settings-color" />
                    </td>
                    <td className="label-cell">Thickness</td>
                    <td className="input-cell">
                      {numberInput(visSettings.rms.thickness, (v) => updateVisSetting('rms', 'thickness', v), { min: 1, max: 6, step: 1, className: "settings-input" })}
                    </td>
                    <td className="label-cell">Window</td>
                    <td className="input-cell">
                      {numberInput(visSettings.rms.window, (v) => updateVisSetting('rms', 'window', v), { min: 8, max: 256, step: 4, className: "settings-input" })}
                    </td>
                    <td></td>
                  </tr>
                )}
                {selectedVis.includes('wave3d') && (
                  <>
                    <tr>
                      <td className="visual-name-cell">Wave 3D</td>
                      <td className="label-cell">Color</td>
                      <td className="input-cell">
                        <input type="color" value={visSettings.wave3d.color} onChange={(e) => updateVisSetting('wave3d', 'color', e.target.value)} className="settings-color" />
                      </td>
                      <td className="label-cell">Highlight</td>
                      <td className="input-cell">
                        <input type="color" value={visSettings.wave3d.highlight} onChange={(e) => updateVisSetting('wave3d', 'highlight', e.target.value)} className="settings-color" />
                      </td>
                      <td className="label-cell">Shadow</td>
                      <td className="input-cell">
                        <input type="color" value={visSettings.wave3d.shadow} onChange={(e) => updateVisSetting('wave3d', 'shadow', e.target.value)} className="settings-color" />
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td></td>
                      <td className="label-cell">Layers</td>
                      <td className="input-cell">
                        {numberInput(visSettings.wave3d.layers, (v) => updateVisSetting('wave3d', 'layers', Math.max(3, Math.min(24, v))), { min: 3, max: 24, step: 1, className: "settings-input" })}
                      </td>
                      <td className="label-cell">Depth</td>
                      <td className="input-cell">
                        {numberInput(visSettings.wave3d.depth, (v) => updateVisSetting('wave3d', 'depth', Math.max(2, Math.min(24, v))), { min: 2, max: 24, step: 1, className: "settings-input" })}
                      </td>
                      <td className="label-cell">Tilt</td>
                      <td className="input-cell">
                        {numberInput(visSettings.wave3d.tilt, (v) => updateVisSetting('wave3d', 'tilt', Math.max(0, Math.min(1.5, v))), { min: 0, max: 1.5, step: 0.05, className: "settings-input" })}
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td></td>
                      <td className="label-cell">Sens</td>
                      <td className="input-cell">
                        {numberInput(visSettings.wave3d.sensitivity, (v) => updateVisSetting('wave3d', 'sensitivity', Math.max(0.1, Math.min(5, v))), { min: 0.1, max: 5, step: 0.1, className: "settings-input" })}
                      </td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default VisualizationSettings
