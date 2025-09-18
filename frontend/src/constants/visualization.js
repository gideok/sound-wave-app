// Visualization types and default settings
export const VIS_TYPES = [
  { id: 'line', label: 'Waveform (Line)' },
  { id: 'bars', label: 'Waveform (Bars)' },
  { id: 'spectrum', label: 'Spectrum (Bars)' },
  { id: 'circular', label: 'Spectrum (Circular)' },
  { id: 'mirrored', label: 'Waveform (Mirrored Bars)' },
  { id: 'rms', label: 'Waveform (RMS Curve)' },
  { id: 'wave3d', label: 'Waveform (3D Ridge)' },
]

export const DEFAULT_VIS_SETTINGS = {
  line: { color: '#5ac8fa', thickness: 2, sensitivity: 1.0 },
  bars: { color: '#34c759', thickness: 1, sensitivity: 1.0, columns: 200 },
  spectrum: { color: '#ff9f0a', thickness: 1, sensitivity: 1.0, columns: 128 },
  circular: { color: '#a78bfa', thickness: 2, sensitivity: 1.0, radiusScale: 0.6, segments: 128 },
  mirrored: { color: '#ff375f', thickness: 1, sensitivity: 1.0, columns: 220 },
  rms: { color: '#ffd60a', thickness: 2, window: 32 },
  wave3d: { color: '#5ac8fa', shadow: '#0a1025', highlight: '#9ad8ff', layers: 12, depth: 8, tilt: 0.4, sensitivity: 1.0 },
}

export const LAYOUT_MODES = {
  OVERLAY: 'overlay',
  SPLIT: 'split'
}

export const DEFAULT_LAYOUT_MODE = LAYOUT_MODES.OVERLAY
