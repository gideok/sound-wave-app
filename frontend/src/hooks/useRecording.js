import { useState, useRef, useCallback } from 'react'

export const useRecording = () => {
  const [isRecording, setIsRecording] = useState(false)
  const [recordUrl, setRecordUrl] = useState('')
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])

  const startRecording = useCallback((audioRef, layoutMode, canvasRef) => {
    if (!audioRef.current) return
    if (isRecording) return

    const captureEl = layoutMode === 'overlay' ? canvasRef.current : document.getElementById('split-canvases')
    const canvasStream = captureEl?.captureStream?.(30)
    const audioStream = audioRef.current.captureStream?.()

    if (!canvasStream || !audioStream || audioStream.getAudioTracks().length === 0) {
      alert('이 브라우저에서는 캔버스/오디오 캡쳐가 제한될 수 있습니다. Chrome을 권장합니다.')
      return
    }

    const mixed = new MediaStream()
    canvasStream.getVideoTracks().forEach((t) => mixed.addTrack(t))
    audioStream.getAudioTracks().forEach((t) => mixed.addTrack(t))

    const mr = new MediaRecorder(mixed, { mimeType: 'video/webm;codecs=vp9,opus' })
    recordedChunksRef.current = []
    mr.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data)
    }
    mr.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      setRecordUrl(url)
      setIsRecording(false)
    }
    mediaRecorderRef.current = mr
    setIsRecording(true)
    mr.start()
    audioRef.current.play().catch(() => {})
  }, [isRecording])

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    if (mr.state !== 'inactive') {
      mr.stop()
    }
  }, [])

  return {
    isRecording,
    recordUrl,
    startRecording,
    stopRecording
  }
}
