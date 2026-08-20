/**
 * PUDÚ MAIL 2 - FORMATTERS & UTILITIES
 */

window.PuduFormats = {
  formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (e) {
      return dateStr;
    }
  },

  getFileCategory(mimeType = '', filename = '') {
    const ext = filename.split('.').pop().toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    if (mime.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic', 'bmp'].includes(ext)) {
      return { category: 'image', icon: '🖼️', label: 'Imagen', color: '#38bdf8' };
    }
    if (mime.includes('pdf') || ext === 'pdf') {
      return { category: 'pdf', icon: '📄', label: 'PDF', color: '#f87171' };
    }
    if (mime.includes('video') || ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv'].includes(ext)) {
      return { category: 'video', icon: '🎥', label: 'Video', color: '#a855f7' };
    }
    if (mime.includes('audio') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
      return { category: 'audio', icon: '🎵', label: 'Audio', color: '#ec4899' };
    }
    if (mime.includes('zip') || mime.includes('compressed') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return { category: 'archive', icon: '📦', label: 'Comprimido', color: '#f59e0b' };
    }
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf'].includes(ext) || mime.includes('document') || mime.includes('sheet')) {
      return { category: 'document', icon: '📝', label: 'Documento', color: '#34d399' };
    }
    return { category: 'other', icon: '📎', label: 'Archivo', color: '#94a3b8' };
  }
};
