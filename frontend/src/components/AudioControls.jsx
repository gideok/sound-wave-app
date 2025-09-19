import React from 'react'

const AudioControls = ({
  audioUrl,
  selectedFile,
  isPlaying,
  currentTime,
  duration,
  formatTime,
  onTogglePlay,
  isRecording,
  startRecording,
  stopRecording,
  recordUrl,
  isCollapsed,
  showUploadReminder,
  setShowUploadReminder
}) => {
  if (isCollapsed) return null

  const handlePlay = () => {
    if (!selectedFile) {
      setShowUploadReminder(true)
      setTimeout(() => setShowUploadReminder(false), 3000)
      return
    }
    onTogglePlay()
  }

  const handleStartRecording = () => {
    if (!selectedFile) {
      setShowUploadReminder(true)
      setTimeout(() => setShowUploadReminder(false), 3000)
      return
    }
    startRecording()
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
      <button disabled={!audioUrl} onClick={handlePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
      <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
      <span style={{ fontSize: '12px', color: '#666' }}>
        Debug: audioUrl={audioUrl ? 'set' : 'empty'}, selectedFile={selectedFile ? 'set' : 'empty'}
      </span>
      {!isRecording ? (
        <button disabled={!audioUrl} onClick={handleStartRecording}>Start Recording</button>
      ) : (
        <button onClick={stopRecording}>Stop Recording</button>
      )}
      {recordUrl && (
        <a href={recordUrl} download="waveform.webm">Download Video</a>
      )}
    </div>
  )
}

export default AudioControls
