import { useState, useCallback } from 'react'

export const useLyricsProcessing = () => {
  const [isGeneratingScore, setIsGeneratingScore] = useState(false)
  const [isExtractingLyrics, setIsExtractingLyrics] = useState(false)
  const [lyricsLang, setLyricsLang] = useState('auto')
  const [alignLyricsText, setAlignLyricsText] = useState('')
  const [isAligningLyrics, setIsAligningLyrics] = useState(false)
  const [alignLang, setAlignLang] = useState('auto')
  const [alignModel, setAlignModel] = useState('small')
  const [lastLrcText, setLastLrcText] = useState('')
  const [parsedLrc, setParsedLrc] = useState([])

  const generateScore = useCallback(async (selectedFile) => {
    if (!selectedFile) return
    try {
      setIsGeneratingScore(true)
      const form = new FormData()
      form.append('file', selectedFile)
      const resp = await fetch('http://localhost:8000/api/audio/generate-score', { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '_vocal_score.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('악보 생성 실패: ' + (e?.message || e))
    } finally {
      setIsGeneratingScore(false)
    }
  }, [])

  const extractLyrics = useCallback(async (selectedFile, language) => {
    if (!selectedFile) return
    try {
      setIsExtractingLyrics(true)
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('language', language)
      const resp = await fetch('http://localhost:8000/api/audio/extract-lyrics', { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '_lyrics.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('가사 추출 실패: ' + (e?.message || e))
    } finally {
      setIsExtractingLyrics(false)
    }
  }, [])

  const alignLyrics = useCallback(async (selectedFile, language, modelSize, lyricsText) => {
    if (!selectedFile) return
    try {
      setIsAligningLyrics(true)
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('language', language)
      form.append('model_size', modelSize)
      
      if (lyricsText && lyricsText.trim().length > 0) {
        // sanitize: remove [ ... ] blocks and empty lines
        const cleaned = lyricsText
          .split('\n')
          .map(l => l.replace(/\[[^\]]*\]/g, '').trim())
          .filter(l => l.length > 0)
          .join('\n')
        form.append('lyrics_text', cleaned)
        const resp = await fetch('http://localhost:8000/api/audio/align-lyrics', { method: 'POST', body: form })
        if (!resp.ok) throw new Error(await resp.text())
        const contentType = resp.headers.get('content-type') || ''
        if (contentType.includes('text/plain')) {
          const text = await resp.text()
          setLastLrcText(text)
          // also offer download
          const blob = new Blob([text], { type: 'text/plain' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '_aligned.lrc'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        } else {
          // backend returns ZIP with lrc + proc.wav
          const blob = await resp.blob()
          // Parse ZIP to extract LRC text for on-screen display
          try {
            const JSZip = (await import('jszip')).default
            const zip = await JSZip.loadAsync(blob)
            const lrcFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.lrc'))
            if (lrcFile) {
              const lrcText = await lrcFile.async('string')
              setLastLrcText(lrcText)
            }
          } catch {
            // ignore parse errors; still allow download
          }
          // Also offer ZIP download
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '_aligned.zip'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        }
      } else {
        // No lyrics provided -> auto transcription then return .lrc
        form.append('return_lrc_only', 'true')
        const resp = await fetch('http://localhost:8000/api/audio/extract-lyrics', { method: 'POST', body: form })
        if (!resp.ok) throw new Error(await resp.text())
        const contentType = resp.headers.get('content-type') || ''
        if (contentType.includes('text/plain')) {
          const text = await resp.text()
          setLastLrcText(text)
          const blob = new Blob([text], { type: 'text/plain' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '.lrc'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        } else {
          // fallback: blob (e.g., if server returned zip unexpectedly)
          const blob = await resp.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '.lrc'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        }
      }
    } catch (e) {
      alert('LRC 생성 실패: ' + (e?.message || e))
    } finally {
      setIsAligningLyrics(false)
    }
  }, [])

  const parseLrc = useCallback((text) => {
    console.log('parseLrc called with text length:', text?.length || 0)
    if (!text || typeof text !== 'string') return []
    const lines = text.split('\n')
    console.log('Split into', lines.length, 'lines')
    const entries = []
    const tsRe = /\[(\d{2}):(\d{2})(?:\.(\d{1,2}))?\]/g
    for (const raw of lines) {
      if (!raw) continue
      let m
      let lastIdx = 0
      const stamps = []
      while ((m = tsRe.exec(raw)) !== null) {
        const mm = Number(m[1] || 0)
        const ss = Number(m[2] || 0)
        const cs = Number((m[3] || '0').padEnd(2, '0')) // hundredths
        const t = mm * 60 + ss + cs / 100
        stamps.push(t)
        lastIdx = m.index + m[0].length
      }
      const content = raw.slice(lastIdx).trim()
      if (stamps.length === 0) continue
      for (const t of stamps) {
        entries.push({ time: t, text: content })
      }
    }
    entries.sort((a, b) => a.time - b.time)
    console.log('Parsed', entries.length, 'LRC entries')
    return entries
  }, [])

  return {
    isGeneratingScore,
    isExtractingLyrics,
    lyricsLang,
    alignLyricsText,
    isAligningLyrics,
    alignLang,
    alignModel,
    lastLrcText,
    parsedLrc,
    setLyricsLang,
    setAlignLyricsText,
    setIsAligningLyrics,
    setAlignLang,
    setAlignModel,
    setLastLrcText,
    setParsedLrc,
    generateScore,
    extractLyrics,
    alignLyrics,
    parseLrc
  }
}
