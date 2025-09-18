import { useState, useRef, useCallback, useEffect } from 'react'

export const useAudioPlayer = () => {
  const [selectedFile, setSelectedFile] = useState(null)
  const [audioUrl, setAudioUrl] = useState('')
  const [waveform, setWaveform] = useState([])
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  
  const audioRef = useRef(null)
  const analyserCtxRef = useRef(null)
  const analyserNodeRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const freqDataRef = useRef(null)
  const timeDataRef = useRef(null)

  const onSelectFile = useCallback((e) => {
    console.log('onSelectFile called')
    const file = e.target.files?.[0]
    console.log('Selected file:', file)
    
    if (!file) {
      console.log('No file selected')
      return
    }
    
    setSelectedFile(file)
    setAudioUrl('')

    const url = URL.createObjectURL(file)
    console.log('Created audio URL:', url)
    setAudioUrl(url)
  }, [])

  const onTogglePlay = useCallback(async () => {
    console.log('onTogglePlay called')
    console.log('audioRef.current:', audioRef.current)
    console.log('audioUrl:', audioUrl)
    console.log('selectedFile:', selectedFile)
    
    const audio = audioRef.current
    if (!audio) {
      console.error('No audio element found')
      return
    }
    
    if (!audioUrl) {
      console.error('No audio URL set')
      return
    }
    
    if (analyserCtxRef.current && analyserCtxRef.current.state === 'suspended') {
      try { 
        await analyserCtxRef.current.resume() 
        console.log('AudioContext resumed')
      } catch (err) { 
        console.debug('AudioContext resume failed', err) 
      }
    }
    
    if (audio.paused) {
      try {
        console.log('Attempting to play audio')
        await audio.play()
        setIsPlaying(true)
        console.log('Audio playing successfully')
      } catch (e) {
        console.error('Play failed:', e)
        alert('재생 실패: ' + e.message)
      }
    } else {
      console.log('Pausing audio')
      audio.pause()
      setIsPlaying(false)
    }
  }, [audioUrl, selectedFile])

  const onSeek = useCallback((e) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = Math.min(1, Math.max(0, x / rect.width))
    audioRef.current.currentTime = ratio * duration
    setCurrentTime(audioRef.current.currentTime)
  }, [duration])

  const formatTime = useCallback((t) => {
    if (!isFinite(t)) return '0:00'
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }, [])

  // Decode audio once audioUrl changes (for static canvas preview)
  useEffect(() => {
    if (!audioUrl) return

    let isCancelled = false
    const decode = async () => {
      try {
        const response = await fetch(audioUrl)
        const arrayBuffer = await response.arrayBuffer()

        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
        if (isCancelled) return
        setDuration(decoded.duration)

        const peaks = computeWaveformPeaks(decoded, 1500)
        setWaveform(peaks)
      } catch (err) {
        console.error('Failed to decode audio', err)
      }
    }

    decode()
    return () => {
      isCancelled = true
    }
  }, [audioUrl])

  // Setup analyser for real-time rendering when audio element available
  useEffect(() => {
    if (!audioRef.current) return

    let audioContext = analyserCtxRef.current
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)()
      analyserCtxRef.current = audioContext
    }

    try {
      if (!sourceNodeRef.current) {
        sourceNodeRef.current = audioContext.createMediaElementSource(audioRef.current)
      }
      if (!analyserNodeRef.current) {
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 2048
        analyser.smoothingTimeConstant = 0.85
        analyserNodeRef.current = analyser
      }
      sourceNodeRef.current.connect(analyserNodeRef.current)
      analyserNodeRef.current.connect(audioContext.destination)

      const analyser = analyserNodeRef.current
      timeDataRef.current = new Uint8Array(analyser.fftSize)
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount)
    } catch (err) {
      console.debug('Analyser connect skipped', err)
    }
  }, [])

  return {
    selectedFile,
    audioUrl,
    waveform,
    duration,
    isPlaying,
    currentTime,
    audioRef,
    analyserCtxRef,
    analyserNodeRef,
    sourceNodeRef,
    freqDataRef,
    timeDataRef,
    setWaveform,
    setDuration,
    setIsPlaying,
    setCurrentTime,
    onSelectFile,
    onTogglePlay,
    onSeek,
    formatTime
  }
}

function computeWaveformPeaks(audioBuffer, targetBars = 1500) {
  const channelData = audioBuffer.getChannelData(0)
  const length = channelData.length
  const samplesPerBar = Math.max(1, Math.floor(length / targetBars))
  const peaks = new Array(Math.floor(length / samplesPerBar)).fill(0)

  let peak = 0
  let count = 0
  let barIndex = 0
  for (let i = 0; i < length; i++) {
    const v = Math.abs(channelData[i])
    if (v > peak) peak = v
    count++
    if (count >= samplesPerBar) {
      peaks[barIndex++] = peak
      peak = 0
      count = 0
    }
  }
  const max = peaks.reduce((a, b) => Math.max(a, b), 0.0001)
  for (let i = 0; i < peaks.length; i++) {
    peaks[i] = Math.min(1, peaks[i] / max)
  }
  return peaks
}
