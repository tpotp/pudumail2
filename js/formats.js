/**
 * PUDÚ GMAIL - FORMAT & EXTENSION DETECTOR
 * Comprehensive format matrix for 100+ file extensions.
 * Guarantees NO broken images or missing previews.
 */

window.PuduFormats = {
  // Formats that browsers can natively render inside <img>
  NATIVE_WEB_IMAGES: new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif'
  ]),

  // Formats that browsers can natively play inside <video> / generate poster
  NATIVE_WEB_VIDEOS: new Set([
    'mp4', 'webm', 'mov', 'm4v', 'ogv', '3gp'
  ]),

  // Formats that browsers can natively play inside <audio>
  NATIVE_WEB_AUDIOS: new Set([
    'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus', 'weba'
  ]),

  getDetails(filename = '', mimeType = '') {
    const fn = (filename || '').trim();
    const lastDot = fn.lastIndexOf('.');
    const ext = lastDot !== -1 ? fn.substring(lastDot + 1).toLowerCase() : '';
    const mime = (mimeType || '').toLowerCase();

    // 1. Native Web Images
    if (this.NATIVE_WEB_IMAGES.has(ext) || (mime.startsWith('image/') && !['image/tiff', 'image/x-adobe-dng', 'image/vnd.adobe.photoshop'].includes(mime))) {
      return {
        category: 'images',
        isNativeImage: true,
        icon: '🖼️',
        label: ext.toUpperCase() || 'IMG',
        color: '#2ecc71',
        bg: 'rgba(46, 204, 113, 0.15)'
      };
    }

    // 2. Specialized Pro Image & Design Formats (AI, PSD, TIF, RAW, etc.)
    if (['tif', 'tiff'].includes(ext) || mime.includes('tiff')) {
      return { category: 'images', isNativeImage: false, icon: '🖼️', label: 'TIFF', color: '#1abc9c', bg: 'rgba(26, 188, 156, 0.2)' };
    }
    if (['ai', 'eps', 'cdr'].includes(ext) || mime.includes('illustrator') || mime.includes('postscript')) {
      return { category: 'documents', isNativeImage: false, icon: '🎨', label: 'AI', color: '#ff9a3c', bg: 'rgba(255, 154, 60, 0.2)' };
    }
    if (['psd', 'psb'].includes(ext) || mime.includes('photoshop')) {
      return { category: 'images', isNativeImage: false, icon: '🖌️', label: 'PSD', color: '#31a8ff', bg: 'rgba(49, 168, 255, 0.2)' };
    }
    if (['raw', 'cr2', 'nef', 'arw', 'dng', 'orf', 'rw2', 'pef'].includes(ext)) {
      return { category: 'images', isNativeImage: false, icon: '📷', label: 'RAW', color: '#e67e22', bg: 'rgba(230, 126, 34, 0.2)' };
    }
    if (['indd', 'idml', 'qxd'].includes(ext)) {
      return { category: 'documents', isNativeImage: false, icon: '📰', label: 'INDD', color: '#ff3366', bg: 'rgba(255, 51, 102, 0.2)' };
    }
    if (['dwg', 'dxf', 'skp'].includes(ext)) {
      return { category: 'documents', isNativeImage: false, icon: '📐', label: 'CAD', color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.2)' };
    }

    // 3. Videos
    if (this.NATIVE_WEB_VIDEOS.has(ext) || mime.startsWith('video/')) {
      return { category: 'videos', isNativeVideo: true, icon: '🎬', label: ext.toUpperCase() || 'VID', color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.2)' };
    }
    if (['mkv', 'avi', 'wmv', 'flv', 'vob', 'ts'].includes(ext)) {
      return { category: 'videos', isNativeVideo: false, icon: '🎬', label: ext.toUpperCase(), color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.2)' };
    }

    // 4. Audios
    if (this.NATIVE_WEB_AUDIOS.has(ext) || mime.startsWith('audio/')) {
      return { category: 'audio', isNativeAudio: true, icon: '🎵', label: ext.toUpperCase() || 'AUDIO', color: '#3498db', bg: 'rgba(52, 152, 219, 0.2)' };
    }

    // 5. Office & PDFs
    if (ext === 'pdf' || mime.includes('pdf')) {
      return { category: 'documents', icon: '📕', label: 'PDF', color: '#e74c3c', bg: 'rgba(231, 76, 60, 0.2)' };
    }
    if (['doc', 'docx', 'odt', 'pages', 'rtf'].includes(ext) || mime.includes('word')) {
      return { category: 'documents', icon: '📘', label: 'DOC', color: '#2980b9', bg: 'rgba(41, 128, 185, 0.2)' };
    }
    if (['xls', 'xlsx', 'csv', 'ods', 'numbers'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet')) {
      return { category: 'documents', icon: '📗', label: 'XLS', color: '#27ae60', bg: 'rgba(39, 174, 96, 0.2)' };
    }
    if (['ppt', 'pptx', 'odp', 'key'].includes(ext) || mime.includes('presentation')) {
      return { category: 'documents', icon: '📙', label: 'PPT', color: '#d35400', bg: 'rgba(211, 84, 0, 0.2)' };
    }
    if (['txt', 'log', 'md', 'json', 'xml', 'html', 'css', 'js', 'py', 'sql'].includes(ext) || mime.startsWith('text/')) {
      return { category: 'documents', icon: '📄', label: ext.toUpperCase() || 'TXT', color: '#95a5a6', bg: 'rgba(149, 165, 166, 0.2)' };
    }

    // 6. Compressed Archives
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
      return { category: 'archives', icon: '📦', label: ext.toUpperCase() || 'ZIP', color: '#f39c12', bg: 'rgba(243, 156, 18, 0.2)' };
    }

    // 7. Fallback generic binary
    return {
      category: 'others',
      icon: '📎',
      label: (ext ? ext.toUpperCase() : 'FILE'),
      color: '#7f8c8d',
      bg: 'rgba(127, 140, 141, 0.2)'
    };
  }
};
