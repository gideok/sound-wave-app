import { useState, useCallback, useEffect } from 'react'

export const useStemSeparation = () => {
  const [stemModels, setStemModels] = useState([])
  const [selectedStemModel, setSelectedStemModel] = useState('demucs:4stems')
  const [isSeparating, setIsSeparating] = useState(false)
  const [separationProgress, setSeparationProgress] = useState(0)
  const [separationJobId, setSeparationJobId] = useState(null)

  // Load available stem models
  const loadStemModels = useCallback(async () => {
    try {
      const resp = await fetch('http://localhost:8000/api/audio/stem-models')
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setStemModels(data.models || [])
      
      // Show warning if Demucs is not available
      if (!data.available && data.message) {
        console.warn(data.message)
      }
    } catch (e) {
      console.error('Failed to load stem models:', e)
    }
  }, [])

  // Separate stems
  const separateStems = useCallback(async (selectedFile) => {
    if (!selectedFile) return
    try {
      setIsSeparating(true)
      setSeparationProgress(0)
      setSeparationJobId(null)
      
      const form = new FormData()
      form.append('file', selectedFile)
      const qs = new URLSearchParams({
        model: selectedStemModel
      })
      
      const resp = await fetch('http://localhost:8000/api/audio/separate-stems?' + qs.toString(), { 
        method: 'POST', 
        body: form 
      })
      
      if (!resp.ok) throw new Error(await resp.text())
      
      const data = await resp.json()
      setSeparationJobId(data.job_id)
      pollSeparationProgress(data.job_id, selectedFile)
    } catch (e) {
      alert('Stem 분리 시작 실패: ' + (e?.message || e))
      setIsSeparating(false)
    }
  }, [selectedStemModel])

  // Poll separation progress
  const pollSeparationProgress = useCallback(async (jobId, selectedFile) => {
    let done = false
    while (!done) {
      await new Promise(r => setTimeout(r, 1000))
      try {
        const resp = await fetch('http://localhost:8000/api/audio/stem-separation/progress?job_id=' + encodeURIComponent(jobId))
        if (!resp.ok) throw new Error(await resp.text())
        const data = await resp.json()
        setSeparationProgress(Number(data.progress || 0) * 100)
        
        if (data.status === 'completed') {
          done = true
          const res = await fetch('http://localhost:8000/api/audio/stem-separation/result?job_id=' + encodeURIComponent(jobId))
          if (!res.ok) throw new Error(await res.text())
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + '_stems.zip'
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        } else if (data.status === 'failed' || data.status === 'cancelled') {
          done = true
          alert('Stem 분리 실패: ' + (data.error || 'unknown error'))
        }
      } catch (e) {
        done = true
        alert('Stem 분리 진행률 조회 실패: ' + (e?.message || e))
      }
    }
    setIsSeparating(false)
    setSeparationJobId(null)
  }, [])

  // Load stem models on mount
  useEffect(() => {
    loadStemModels()
  }, [loadStemModels])

  return {
    stemModels,
    selectedStemModel,
    isSeparating,
    separationProgress,
    separationJobId,
    setSelectedStemModel,
    separateStems
  }
}
