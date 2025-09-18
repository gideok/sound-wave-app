import React from 'react'
import PropTypes from 'prop-types'

const FileSelector = React.memo(({ onSelectFile, selectedFile }) => {
  const fileInputRef = React.useRef(null)

  const handleFileButtonClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="file-row unified-width">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,video/mp4,video/mpeg,video/webm,.wav,.mp3,.m4a,.aac,.ogg,.flac,.mp4"
        onChange={onSelectFile}
        style={{ display: 'none' }}
      />
      <button type="button" onClick={handleFileButtonClick}>Choose File</button>
      <span className="file-caption">{selectedFile ? selectedFile.name : 'No file selected'}</span>
    </div>
  )
})

FileSelector.propTypes = {
  onSelectFile: PropTypes.func.isRequired,
  selectedFile: PropTypes.object
}

export default FileSelector
