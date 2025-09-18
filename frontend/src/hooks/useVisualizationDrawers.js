import { useCallback } from 'react'

export const useVisualizationDrawers = (ensureCanvasSize, clearCanvas, spectrumStateRef) => {
  const drawLine = useCallback((canvas, timeData, settings) => {
    const { color, thickness = 2, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = height / 2
    ctx.lineWidth = thickness
    ctx.strokeStyle = color
    ctx.beginPath()
    const slice = timeData.length / width
    for (let x = 0; x < width; x++) {
      const v = (timeData[Math.floor(x * slice)] / 128.0 - 1.0) * sensitivity
      const y = mid + v * (mid - 8)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }, [ensureCanvasSize])

  const drawBars = useCallback((canvas, timeData, settings) => {
    const { color, columns = 200, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = height / 2
    const barWidth = Math.max(2, Math.floor(width / columns))
    ctx.fillStyle = color
    for (let x = 0; x < width; x += barWidth) {
      const i = Math.floor((x / width) * timeData.length)
      const v = Math.abs((timeData[i] / 128.0 - 1.0) * sensitivity)
      const h = v * (mid - 6)
      ctx.fillRect(x, mid - h, barWidth - 1, h * 2)
    }
  }, [ensureCanvasSize])

  const drawMirroredBars = useCallback((canvas, timeData, settings) => {
    const { color, columns = 220, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = height / 2
    const barWidth = Math.max(2, Math.floor(width / columns))
    ctx.fillStyle = color
    for (let x = 0; x < width; x += barWidth) {
      const i = Math.floor((x / width) * timeData.length)
      const v = Math.abs((timeData[i] / 128.0 - 1.0) * sensitivity)
      const h = v * (mid - 6)
      ctx.fillRect(x, mid - h, barWidth - 1, h)
      ctx.fillRect(x, mid, barWidth - 1, h)
    }
  }, [ensureCanvasSize])

  const drawSpectrum = useCallback((canvas, freqData, settings) => {
    const { color, columns = 128, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const barWidth = Math.max(2, Math.floor(width / columns))

    // LED-style segment config
    const segmentH = 4   // each segment height in px
    const gap = 2        // gap between segments in px
    const maxDrawable = height - 8
    const smooth = 0.6   // exponential smoothing factor (higher = smoother)
    const peakFall = 1   // pixels per frame the peak falls
    const peakHoldFrames = 10

    // Prepare state arrays sized to columns
    const cols = Math.floor(width / barWidth)
    if (spectrumStateRef.current.peaks.length !== cols) {
      spectrumStateRef.current.peaks = new Array(cols).fill(0)
      spectrumStateRef.current.hold = new Array(cols).fill(0)
      spectrumStateRef.current.prev = new Array(cols).fill(0)
    }

    // Background grid (optional subtle)
    ctx.fillStyle = '#0b1020'
    ctx.fillRect(0, 0, width, height)

    for (let c = 0; c < cols; c++) {
      const x = c * barWidth
      const i = Math.floor((x / width) * freqData.length)
      const magnitude = Math.max(0, Math.min(1, (freqData[i] / 255) * sensitivity))
      // smooth height in pixels
      const targetH = magnitude * maxDrawable
      const prevH = spectrumStateRef.current.prev[c] || 0
      const smoothedH = prevH * smooth + targetH * (1 - smooth)
      spectrumStateRef.current.prev[c] = smoothedH

      // draw segmented bar from bottom
      const segments = Math.floor(smoothedH / (segmentH + gap))
      ctx.fillStyle = color
      for (let s = 0; s < segments; s++) {
        const yTop = height - 4 - (s + 1) * (segmentH + gap) + gap
        ctx.fillRect(x, yTop, barWidth - 1, segmentH)
      }

      // peak-hold marker
      const currentPeakY = height - smoothedH
      const peakY = spectrumStateRef.current.peaks[c]
      if (currentPeakY < peakY || peakY === 0) {
        // new peak (higher bar)
        spectrumStateRef.current.peaks[c] = currentPeakY
        spectrumStateRef.current.hold[c] = peakHoldFrames
      } else {
        // hold then fall
        if (spectrumStateRef.current.hold[c] > 0) {
          spectrumStateRef.current.hold[c] -= 1
        } else {
          spectrumStateRef.current.peaks[c] = Math.min(height - 4, peakY + peakFall)
        }
      }
      // draw peak as a thin line segment
      const py = Math.max(4, Math.min(height - 4, spectrumStateRef.current.peaks[c]))
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x, py, barWidth - 1, 2)
    }
  }, [ensureCanvasSize, spectrumStateRef])

  const drawCircularSpectrum = useCallback((canvas, freqData, settings) => {
    const { color, thickness = 2, sensitivity = 1.0, radiusScale = 0.6, segments = 128 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const cx = Math.floor(width / 2)
    const cy = Math.floor(height / 2)
    const radius = Math.min(cx, cy) * radiusScale
    ctx.save()
    ctx.translate(cx, cy)
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    for (let i = 0; i < segments; i++) {
      const idx = Math.floor((i / segments) * freqData.length)
      const mag = (freqData[idx] / 255) * sensitivity
      const len = radius * 0.2 + Math.max(0, Math.min(1, mag)) * radius * 0.8
      const angle = (i / segments) * Math.PI * 2
      const x1 = Math.cos(angle) * radius
      const y1 = Math.sin(angle) * radius
      const x2 = Math.cos(angle) * (radius + len)
      const y2 = Math.sin(angle) * (radius + len)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    }
    ctx.restore()
  }, [ensureCanvasSize])

  const drawRmsCurve = useCallback((canvas, timeData, settings) => {
    const { color, thickness = 2, window = 32 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = height / 2
    ctx.lineWidth = thickness
    ctx.strokeStyle = color
    ctx.beginPath()
    const step = Math.max(1, Math.floor(timeData.length / width))
    for (let x = 0, i = 0; x < width; x++, i += step) {
      let sumSq = 0
      let count = 0
      for (let k = 0; k < window && i + k < timeData.length; k++) {
        const v = timeData[i + k] / 128.0 - 1.0
        sumSq += v * v
        count++
      }
      const rms = Math.sqrt(sumSq / Math.max(1, count))
      const y = mid - rms * (mid - 8)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }, [ensureCanvasSize])

  const drawWave3D = useCallback((canvas, timeData, settings) => {
    const { color, shadow = '#0a1025', highlight = '#9ad8ff', layers = 12, depth = 8, tilt = 0.4, sensitivity = 1.0 } = settings
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    const mid = Math.floor(height / 2)

    // base path generation from timeData
    const slice = timeData.length / width
    const waveY = new Array(width)
    for (let x = 0; x < width; x++) {
      const v = (timeData[Math.floor(x * slice)] / 128.0 - 1.0) * sensitivity
      waveY[x] = mid + v * (mid - 10)
    }

    // draw layered ridges back-to-front for a faux 3D effect
    for (let i = layers - 1; i >= 0; i--) {
      const offsetY = Math.round((i - (layers - 1)) * depth)
      const offsetX = Math.round((i - (layers - 1)) * tilt * 10)

      // gradient per layer
      const grad = ctx.createLinearGradient(0, mid - 60 + offsetY, 0, mid + 60 + offsetY)
      const t = i / Math.max(1, layers - 1)
      const mix = (a, b, p) => a + (b - a) * p
      const parseHex = (h) => {
        const s = h.startsWith('#') ? h.slice(1) : h
        return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)]
      }
      const toHex = (r, g, b) => `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
      const cBase = parseHex(color)
      const cHi = parseHex(highlight)
      const cLo = parseHex(shadow)
      const topCol = toHex(mix(cHi[0], cBase[0], t), mix(cHi[1], cBase[1], t), mix(cHi[2], cBase[2], t))
      const botCol = toHex(mix(cBase[0], cLo[0], t), mix(cBase[1], cLo[1], t), mix(cBase[2], cLo[2], t))
      grad.addColorStop(0, topCol)
      grad.addColorStop(1, botCol)

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.moveTo(0 + offsetX, height + 2)
      for (let x = 0; x < width; x++) {
        ctx.lineTo(x + offsetX, waveY[x] + offsetY)
      }
      ctx.lineTo(width + offsetX, height + 2)
      ctx.closePath()
      ctx.fill()

      // subtle rim light
      ctx.strokeStyle = topCol
      ctx.lineWidth = i === 0 ? 2 : 1
      ctx.beginPath()
      for (let x = 0; x < width; x += 2) {
        const y = waveY[x] + offsetY
        ctx.lineTo(x + offsetX, y)
      }
      ctx.stroke()
    }
  }, [ensureCanvasSize])

  const drawOverlay = useCallback((canvas, timeData, freqData, bgColor, selectedVis, visSettings, duration, audioRef) => {
    if (!canvas) return
    const { ctx, width, height } = ensureCanvasSize(canvas, 300)
    clearCanvas(ctx, width, height, bgColor)
    const bottomPad = 10

    ctx.strokeStyle = '#222b4a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, Math.floor(height / 2))
    ctx.lineTo(width, Math.floor(height / 2))
    ctx.stroke()

    // clip drawing area to exclude bottomPad so visuals don't overlap the strip
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, width, height - bottomPad)
    ctx.clip()
    if (selectedVis.includes('line')) drawLine(canvas, timeData, visSettings.line)
    if (selectedVis.includes('bars')) drawBars(canvas, timeData, visSettings.bars)
    if (selectedVis.includes('spectrum')) drawSpectrum(canvas, freqData, visSettings.spectrum)
    if (selectedVis.includes('circular')) drawCircularSpectrum(canvas, freqData, visSettings.circular)
    if (selectedVis.includes('mirrored')) drawMirroredBars(canvas, timeData, visSettings.mirrored)
    if (selectedVis.includes('rms')) drawRmsCurve(canvas, timeData, visSettings.rms)
    if (selectedVis.includes('wave3d')) drawWave3D(canvas, timeData, visSettings.wave3d)
    ctx.restore()

    if (duration > 0 && audioRef.current) {
      const progress = Math.min(1, audioRef.current.currentTime / duration)
      const x = Math.floor(progress * width)
      // clear and draw progress bar in the bottom strip only
      ctx.fillStyle = '#0b1020'
      ctx.fillRect(0, height - bottomPad, width, bottomPad)
      ctx.fillStyle = '#222b4a'
      ctx.fillRect(0, height - bottomPad - 1, width, 1)
      ctx.fillStyle = '#ffcc00'
      ctx.fillRect(0, height - bottomPad + 2, x, bottomPad - 4)
    }
  }, [ensureCanvasSize, clearCanvas, drawLine, drawBars, drawSpectrum, drawCircularSpectrum, drawMirroredBars, drawRmsCurve, drawWave3D])

  return {
    drawLine,
    drawBars,
    drawMirroredBars,
    drawSpectrum,
    drawCircularSpectrum,
    drawRmsCurve,
    drawWave3D,
    drawOverlay
  }
}
