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
  isCollapsed
}) => {
  if (isCollapsed) return null

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
      <button disabled={!audioUrl} onClick={onTogglePlay}>{isPlaying ? 'Pause' : 'Play'}</button>
      <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
      <span style={{ fontSize: '12px', color: '#666' }}>
        Debug: audioUrl={audioUrl ? 'set' : 'empty'}, selectedFile={selectedFile ? 'set' : 'empty'}
      </span>
      {!isRecording ? (
        <button disabled={!audioUrl} onClick={startRecording}>Start Recording</button>
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
