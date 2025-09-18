import { useState, useCallback, useEffect } from 'react'
import { DEFAULT_VIS_SETTINGS, DEFAULT_LAYOUT_MODE } from '../constants/visualization'

export const useVisualization = () => {
  const [selectedVis, setSelectedVis] = useState(['line'])
  const [layoutMode, setLayoutMode] = useState(DEFAULT_LAYOUT_MODE)
  const [visSettings, setVisSettings] = useState(DEFAULT_VIS_SETTINGS)

  const toggleVis = useCallback((id) => {
    setSelectedVis((prev) => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id])
  }, [])

  const updateVisSetting = useCallback((id, key, value) => {
    setVisSettings((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value }
    }))
  }, [])

  return {
    selectedVis,
    layoutMode,
    visSettings,
    setLayoutMode,
    toggleVis,
    updateVisSetting
  }
}
