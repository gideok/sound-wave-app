import { useState, useCallback } from 'react'
import { DEFAULT_LUFS_TARGET, DEFAULT_TP_TARGET, DEFAULT_LRA_TARGET, DEFAULT_COMPRESSOR_SETTINGS } from '../constants/audio'

export const useLufsAnalysis = () => {
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [lufsData, setLufsData] = useState(null)
  const [targetLufs, setTargetLufs] = useState(DEFAULT_LUFS_TARGET)
  const [targetTp, setTargetTp] = useState(DEFAULT_TP_TARGET)
  const [targetLra, setTargetLra] = useState(DEFAULT_LRA_TARGET)
  const [isNormalizing, setIsNormalizing] = useState(false)
  const [normalizedUrl, setNormalizedUrl] = useState('')
  const [preCompress, setPreCompress] = useState(false)
  const [compThreshold, setCompThreshold] = useState(DEFAULT_COMPRESSOR_SETTINGS.threshold)
  const [compRatio, setCompRatio] = useState(DEFAULT_COMPRESSOR_SETTINGS.ratio)
  const [compAttack, setCompAttack] = useState(DEFAULT_COMPRESSOR_SETTINGS.attack)
  const [compRelease, setCompRelease] = useState(DEFAULT_COMPRESSOR_SETTINGS.release)

  const measureLUFS = useCallback(async (selectedFile) => {
    if (!selectedFile) return
    try {
      setIsMeasuring(true)
      setLufsData(null)
      const form = new FormData()
      form.append('file', selectedFile)
      const resp = await fetch('http://localhost:8000/api/audio/measure-lufs', { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setLufsData(data)
    } catch (e) {
      alert('LUFS 측정 실패: ' + (e?.message || e))
    } finally {
      setIsMeasuring(false)
    }
  }, [])

  const normalizeToTarget = useCallback(async (selectedFile) => {
    if (!selectedFile) return
    try {
      setIsNormalizing(true)
      const form = new FormData()
      form.append('file', selectedFile)
      const qs = new URLSearchParams({
        target_lufs: String(targetLufs),
        target_tp: String(targetTp),
        target_lra: String(targetLra),
        pre_compress: String(preCompress),
        compress_threshold_db: String(compThreshold),
        compress_ratio: String(compRatio),
        compress_attack_ms: String(compAttack),
        compress_release_ms: String(compRelease),
      })
      const resp = await fetch('http://localhost:8000/api/audio/normalize?' + qs.toString(), { method: 'POST', body: form })
      if (!resp.ok) throw new Error(await resp.text())
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      setNormalizedUrl(url)
      // Auto download
      const a = document.createElement('a')
      a.href = url
      a.download = (selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'audio') + `_norm_${targetLufs}LUFS.wav`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (e) {
      alert('정규화 실패: ' + (e?.message || e))
    } finally {
      setIsNormalizing(false)
    }
  }, [targetLufs, targetTp, targetLra, preCompress, compThreshold, compRatio, compAttack, compRelease])

  const extractNumber = useCallback((obj, a, b) => {
    if (!obj) return undefined
    const v = obj[a]
    if (v !== undefined && v !== null && v !== '') return Number(v)
    const w = obj[b]
    if (w !== undefined && w !== null && w !== '') return Number(w)
    return undefined
  }, [])

  const measuredI = extractNumber(lufsData || {}, 'input_i', 'measured_I')
  const measuredTP = extractNumber(lufsData || {}, 'input_tp', 'measured_TP')
  const measuredLRA = extractNumber(lufsData || {}, 'input_lra', 'measured_LRA')

  return {
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
    setLufsData,
    setNormalizedUrl,
    measureLUFS,
    normalizeToTarget
  }
}
