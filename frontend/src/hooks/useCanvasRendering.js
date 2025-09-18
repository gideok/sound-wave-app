import { useCallback, useRef } from 'react'

export const useCanvasRendering = () => {
  const canvasRef = useRef(null)
  const splitCanvasRefs = useRef({})
  const spectrumStateRef = useRef({ peaks: [], hold: [] })

  const ensureCanvasSize = useCallback((canvas, height = 200) => {
    const dpr = window.devicePixelRatio || 1
    const parent = canvas.parentElement
    const width = Math.max(320, parent ? parent.clientWidth : 640)
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
    }
    const ctx = canvas.getContext('2d')
    ctx.resetTransform()
    ctx.scale(dpr, dpr)
    return { ctx, width, height, dpr }
  }, [])

  const clearCanvas = useCallback((ctx, width, height, bg = '#0b1020') => {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
  }, [])

  const drawStaticWaveform = useCallback((canvas, waveform, duration, audioRef, layoutMode) => {
    if (layoutMode !== 'overlay') return
    if (!canvas) return
    const { ctx, width, height } = ensureCanvasSize(canvas, 200)
    const bottomPad = 10

    ctx.fillStyle = '#0b1020'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = '#222b4a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    if (!waveform || waveform.length === 0) return

    const barWidth = Math.max(1, Math.floor(width / waveform.length))
    const halfH = (height - bottomPad) / 2
    ctx.fillStyle = '#5ac8fa'

    for (let i = 0; i < waveform.length; i++) {
      const x = i * barWidth
      const amp = waveform[i]
      const barHeight = amp * (halfH - 6)
      ctx.fillRect(x, halfH - barHeight, barWidth - 1, barHeight * 2)
    }

    if (duration > 0 && audioRef.current) {
      const progress = Math.min(1, audioRef.current.currentTime / duration)
      const x = Math.floor(progress * width)
      // clear and draw progress bar only in bottom padding strip
      ctx.fillStyle = '#0b1020'
      ctx.fillRect(0, height - bottomPad, width, bottomPad)
      // baseline for strip
      ctx.fillStyle = '#222b4a'
      ctx.fillRect(0, height - bottomPad - 1, width, 1)
      // progress bar (filled from start)
      ctx.fillStyle = '#ffcc00'
      ctx.fillRect(0, height - bottomPad + 2, x, bottomPad - 4)
    }
  }, [ensureCanvasSize])

  return {
    canvasRef,
    splitCanvasRefs,
    spectrumStateRef,
    ensureCanvasSize,
    clearCanvas,
    drawStaticWaveform
  }
}
