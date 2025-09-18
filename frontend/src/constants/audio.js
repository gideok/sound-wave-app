// Audio processing constants
export const DEFAULT_LUFS_TARGET = -15
export const DEFAULT_TP_TARGET = -1.0
export const DEFAULT_LRA_TARGET = 7

export const DEFAULT_COMPRESSOR_SETTINGS = {
  threshold: -18,
  ratio: 3,
  attack: 20,
  release: 200
}

export const LUFS_RANGE = {
  MIN: -48,
  MAX: 0
}

// Render presets
export const RENDER_PRESETS = {
  CUSTOM: 'custom',
  HD_1080P: '1080p',
  HD_720P: '720p',
  SQUARE: 'square',
  VERTICAL: 'vertical'
}

export const PRESET_DIMENSIONS = {
  [RENDER_PRESETS.HD_1080P]: { width: 1920, height: 1080 },
  [RENDER_PRESETS.HD_720P]: { width: 1280, height: 720 },
  [RENDER_PRESETS.SQUARE]: { width: 1080, height: 1080 },
  [RENDER_PRESETS.VERTICAL]: { width: 1080, height: 1920 }
}

export const DEFAULT_RENDER_SETTINGS = {
  width: 1280,
  height: 720,
  fps: 30,
  waveColor: '#5ac8fa',
  bgColor: '#0b1020',
  preset: RENDER_PRESETS.CUSTOM
}
