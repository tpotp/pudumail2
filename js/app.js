/**
 * PUDÚ GMAIL - MAIN APPLICATION CONTROLLER
 * High-Performance Thumbnail Engine, 100+ Formats Detector & Gold-Standard Infinite Scroll
 * 100% Client-Side for Vercel Free
 */

const state = {
  category: 'all',
  sizePreset: null,
  search: '',
  sortBy: 'size_desc',
  viewMode: 'grid', // 'grid' | 'table'

  // Infinite Scroll State (Gold Standard)
  initialBatch: 36,
  batchSize: 24,
  visibleCount: 36,
  isLoadingMore: false,

  allAttachments: [],
  filteredAttachments: [],
  selectedIds: new Set(),
  currentModalIndex: -1,
  freedSpaceBytes: 0,
  isScanning: false,

  // Blob & Thumbnail Memory Cache
  blobCache: new Map(), // attId -> DataURL / ObjectURL
  audioPlayers: new Map(), // attId -> Audio instance
  currentlyPlayingAudioId: null
};

// DOM Elements
const el = {
  // Screens & Hero
  loginHeroScreen: document.getElementById('loginHeroScreen'),
  mainAppLayout: document.getElementById('mainAppLayout'),
  btnHeroGoogleLogin: document.getElementById('btnHeroGoogleLogin'),
  heroErrorAlert: document.getElementById('heroErrorAlert'),

  // Navigation & Filters
  navItems: document.querySelectorAll('.nav-item[data-category]'),
  sizeItems: document.querySelectorAll('.nav-item[data-size]'),
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  sortBySelect: document.getElementById('sortBySelect'),
  btnViewGrid: document.getElementById('btnViewGrid'),
  btnViewTable: document.getElementById('btnViewTable'),
  breadcrumbCategory: document.getElementById('breadcrumbCategory'),

  // Views & Containers
  explorerBody: document.querySelector('.explorer-body'),
  attachmentsGrid: document.getElementById('attachmentsGrid'),
  attachmentsTableContainer: document.getElementById('attachmentsTableContainer'),
  attachmentsTableBody: document.getElementById('attachmentsTableBody'),
  emptyState: document.getElementById('emptyState'),
  emptyStateText: document.getElementById('emptyStateText'),
  btnScanEmpty: document.getElementById('btnScanEmpty'),

  // Permanent Infinite Scroll Elements
  infiniteScrollSentinel: document.getElementById('infiniteScrollSentinel'),
  infiniteLoader: document.getElementById('infiniteLoader'),
  infiniteEndMessage: document.getElementById('infiniteEndMessage'),

  // Selection & Counters
  selectAllCheckbox: document.getElementById('selectAllCheckbox'),
  tableSelectAll: document.getElementById('tableSelectAll'),
  itemsCountSummary: document.getElementById('itemsCountSummary'),
  floatingActionBar: document.getElementById('floatingActionBar'),
  selectedCountBadge: document.getElementById('selectedCountBadge'),
  selectedSizeLabel: document.getElementById('selectedSizeLabel'),
  btnMoveSelectedToDevice: document.getElementById('btnMoveSelectedToDevice'),
  btnDownloadSelectedZip: document.getElementById('btnDownloadSelectedZip'),
  btnDeleteSelected: document.getElementById('btnDeleteSelected'),
  btnClearSelection: document.getElementById('btnClearSelection'),

  // Sidebar counters & stats
  countAll: document.getElementById('countAll'),
  countImages: document.getElementById('countImages'),
  countVideos: document.getElementById('countVideos'),
  countDocuments: document.getElementById('countDocuments'),
  countAudio: document.getElementById('countAudio'),
  countArchives: document.getElementById('countArchives'),
  countHuge: document.getElementById('countHuge'),
  totalStorageDisplay: document.getElementById('totalStorageDisplay'),
  freedSpaceDisplay: document.getElementById('freedSpaceDisplay'),
  barImages: document.getElementById('barImages'),
  barVideos: document.getElementById('barVideos'),
  barDocs: document.getElementById('barDocs'),
  barOther: document.getElementById('barOther'),

  // Auth & Account
  accountEmailDisplay: document.getElementById('accountEmailDisplay'),
  accountStatusTag: document.getElementById('accountStatusTag'),
  btnLogout: document.getElementById('btnLogout'),
  btnRescan: document.getElementById('btnRescan'),
  btnSyncNow: document.getElementById('btnSyncNow'),

  // Sync Progress Banner
  syncProgressBanner: document.getElementById('syncProgressBanner'),
  syncProgressTitle: document.getElementById('syncProgressTitle'),
  syncProgressText: document.getElementById('syncProgressText'),
  syncProgressBar: document.getElementById('syncProgressBar'),
  syncPercentText: document.getElementById('syncPercentText'),

  // Lightbox Modal
  previewModal: document.getElementById('previewModal'),
  modalFileName: document.getElementById('modalFileName'),
  modalCategoryBadge: document.getElementById('modalCategoryBadge'),
  modalMediaContainer: document.getElementById('modalMediaContainer'),
  modalSize: document.getElementById('modalSize'),
  modalDate: document.getElementById('modalDate'),
  modalSender: document.getElementById('modalSender'),
  modalSubject: document.getElementById('modalSubject'),
  modalMime: document.getElementById('modalMime'),
  modalMoveToDeviceBtn: document.getElementById('modalMoveToDeviceBtn'),
  modalDownloadBtn: document.getElementById('modalDownloadBtn'),
  modalOpenGmailBtn: document.getElementById('modalOpenGmailBtn'),
  modalDeleteBtn: document.getElementById('modalDeleteBtn'),
  btnCloseModal: document.getElementById('btnCloseModal'),

  // Toast
  puduCelebrationToast: document.getElementById('puduCelebrationToast'),
  toastTitle: document.getElementById('toastTitle'),
  toastMessage: document.getElementById('toastMessage')
};

// ==========================================================================
// Formatting Helpers
// ==========================================================================

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  if (!dateString) return 'Desconocida';
  try {
    const d = new Date(dateString.replace(' ', 'T'));
    if (isNaN(d.getTime())) return dateString.substring(0, 10);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateString.substring(0, 10);
  }
}

function getCategoryLabel(cat) {
  const map = {
    'all': 'Todos los Adjuntos',
    'images': 'Fotos e Imágenes',
    'videos': 'Videos y Grabaciones',
    'documents': 'Documentos y PDFs',
    'audio': 'Audios y Voz',
    'archives': 'Comprimidos (ZIP/RAR)',
    'others': 'Otros Archivos'
  };
  return map[cat] || 'Adjuntos';
}

function getGmailSearchUrl(att) {
  if (att.message_id) {
    return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(att.message_id)}`;
  }
  if (att.subject && att.subject !== '(Sin Asunto)') {
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(att.subject)}`;
  }
  if (att.sender) {
    return `https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(att.sender)}`;
  }
  return 'https://mail.google.com/mail/u/0/#inbox';
}

function showToast(title, message) {
  el.toastTitle.textContent = title;
  el.toastMessage.textContent = message;
  el.puduCelebrationToast.classList.remove('hidden');
  setTimeout(() => {
    el.puduCelebrationToast.classList.add('hidden');
  }, 4000);
}

// ==========================================================================
// Ultra-Fast Hardware-Accelerated Thumbnail Engine
// ==========================================================================

const thumbnailQueue = [];
const queuedSet = new Set();
let activeThumbnailDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = 6;

function queueThumbnailDownload(item, containerEl) {
  if (state.blobCache.has(item.id)) {
    applyThumbnail(item.id, state.blobCache.get(item.id), containerEl, item);
    return;
  }

  if (queuedSet.has(item.id)) return;
  queuedSet.add(item.id);

  thumbnailQueue.push({ item, containerEl });
  processThumbnailQueue();
}

async function processThumbnailQueue() {
  if (activeThumbnailDownloads >= MAX_CONCURRENT_DOWNLOADS || thumbnailQueue.length === 0) {
    return;
  }

  const { item, containerEl } = thumbnailQueue.shift();
  queuedSet.delete(item.id);
  activeThumbnailDownloads++;

  try {
    // 1. Check if thumbnail is already persisted in IndexedDB
    const cachedDataUrl = await window.puduStorage.getThumbnail(item.id);
    if (cachedDataUrl) {
      state.blobCache.set(item.id, cachedDataUrl);
      applyThumbnail(item.id, cachedDataUrl, containerEl, item);
      activeThumbnailDownloads--;
      processThumbnailQueue();
      return;
    }

    const fmt = window.PuduFormats.getDetails(item.filename, item.content_type);

    // Only download if format is actually browser-renderable (Web images or videos)
    if (fmt.isNativeImage) {
      const blob = await window.puduGmailService.downloadAttachmentBlob(item);
      const thumbUrl = await generateFastImageThumbnail(blob);
      state.blobCache.set(item.id, thumbUrl);
      window.puduStorage.saveThumbnail(item.id, thumbUrl);
      applyThumbnail(item.id, thumbUrl, containerEl, item);
    } else if (fmt.isNativeVideo) {
      const blob = await window.puduGmailService.downloadAttachmentBlob(item);
      const objectUrl = URL.createObjectURL(blob);
      generateVideoPoster(objectUrl, (posterUrl) => {
        state.blobCache.set(item.id, posterUrl);
        window.puduStorage.saveThumbnail(item.id, posterUrl);
        applyThumbnail(item.id, posterUrl, containerEl, item);
        URL.revokeObjectURL(objectUrl);
      });
    }
  } catch (err) {
    console.warn(`Error al generar miniatura de ${item.filename}:`, err);
    // Render format badge gracefully on any error
    renderFormatFallbackBadge(containerEl, item);
  } finally {
    activeThumbnailDownloads--;
    processThumbnailQueue();
  }
}

/**
 * Fast GPU/Hardware-accelerated downscaling with createImageBitmap
 */
async function generateFastImageThumbnail(blob) {
  try {
    let bitmap;
    if (window.createImageBitmap) {
      bitmap = await createImageBitmap(blob, { resizeWidth: 280, resizeQuality: 'low' });
    } else {
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      await new Promise((res) => { img.onload = res; img.onerror = res; });
      bitmap = img;
    }

    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width || 280;
    canvas.height = bitmap.height || 180;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    if (bitmap.close) bitmap.close();

    try {
      return canvas.toDataURL('image/webp', 0.65);
    } catch (e) {
      return canvas.toDataURL('image/jpeg', 0.65);
    }
  } catch (e) {
    return URL.createObjectURL(blob);
  }
}

function generateVideoPoster(videoUrl, callback) {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.currentTime = 0.5;

  video.onloadeddata = () => {
    video.currentTime = 0.5;
  };

  video.onseeked = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth || 280, 320);
      canvas.height = Math.min(video.videoHeight || 180, 240);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
      callback(dataUrl);
    } catch (e) {
      callback(videoUrl);
    }
  };

  video.onerror = () => callback(videoUrl);
}

function applyThumbnail(itemId, srcUrl, containerEl, item) {
  if (!containerEl || !document.body.contains(containerEl)) return;

  const fmt = window.PuduFormats.getDetails(item.filename, item.content_type);

  if (fmt.isNativeImage || fmt.isNativeVideo) {
    containerEl.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'card-img-preview fade-in';
    img.src = srcUrl;
    img.alt = '';
    img.loading = 'lazy';
    
    // GUARANTEE: Never show a broken image icon if decoding fails
    img.onerror = () => {
      renderFormatFallbackBadge(containerEl, item);
    };

    containerEl.appendChild(img);

    if (fmt.isNativeVideo) {
      const overlay = document.createElement('div');
      overlay.className = 'card-video-overlay';
      overlay.innerHTML = `
        <div class="play-btn-circle">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
      `;
      containerEl.appendChild(overlay);
    }
  } else {
    renderFormatFallbackBadge(containerEl, item);
  }
}

function renderFormatFallbackBadge(containerEl, item) {
  if (!containerEl) return;
  const fmt = window.PuduFormats.getDetails(item.filename, item.content_type);
  containerEl.innerHTML = `
    <div class="card-format-badge-box" style="background: ${fmt.bg};">
      <div class="format-icon">${fmt.icon}</div>
      <div class="format-label-pill" style="color: ${fmt.color}; border-color: ${fmt.color};">${fmt.label}</div>
    </div>
  `;
}

// Single instance of viewport observer for thumbnails
const cardIntersectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const card = entry.target;
      const itemId = card.dataset.id;
      const previewWrapper = card.querySelector('.card-preview-wrapper');

      if (previewWrapper) {
        const item = state.allAttachments.find(x => x.id === itemId);
        if (item) {
          const fmt = window.PuduFormats.getDetails(item.filename, item.content_type);
          if (fmt.isNativeImage || fmt.isNativeVideo) {
            queueThumbnailDownload(item, previewWrapper);
          }
        }
      }
      cardIntersectionObserver.unobserve(card);
    }
  });
}, {
  root: null,
  rootMargin: '350px 0px',
  threshold: 0.01
});

// ==========================================================================
// Filtering, Sorting & Stats Calculation
// ==========================================================================

function applyFiltersAndSort() {
  let list = state.allAttachments.filter(item => item.status !== 'trashed' && item.status !== 'moved');

  // Category filter
  if (state.category && state.category !== 'all') {
    list = list.filter(item => item.category === state.category);
  }

  // Size preset filter
  if (state.sizePreset) {
    if (state.sizePreset === 'huge') list = list.filter(item => item.size_bytes >= 26214400); // >= 25 MB
    else if (state.sizePreset === 'large') list = list.filter(item => item.size_bytes >= 10485760 && item.size_bytes < 26214400); // 10-25 MB
    else if (state.sizePreset === 'medium') list = list.filter(item => item.size_bytes >= 1048576 && item.size_bytes < 10485760); // 1-10 MB
    else if (state.sizePreset === 'small') list = list.filter(item => item.size_bytes < 1048576); // < 1 MB
  }

  // Search keyword
  if (state.search.trim()) {
    const q = state.search.toLowerCase().trim();
    list = list.filter(item =>
      (item.filename || '').toLowerCase().includes(q) ||
      (item.subject || '').toLowerCase().includes(q) ||
      (item.sender || '').toLowerCase().includes(q) ||
      (item.sender_name || '').toLowerCase().includes(q)
    );
  }

  // Sorting
  list.sort((a, b) => {
    if (state.sortBy === 'size_desc') return b.size_bytes - a.size_bytes;
    if (state.sortBy === 'size_asc') return a.size_bytes - b.size_bytes;
    if (state.sortBy === 'date_desc') return new Date(b.date || 0) - new Date(a.date || 0);
    if (state.sortBy === 'date_asc') return new Date(a.date || 0) - new Date(b.date || 0);
    if (state.sortBy === 'name_asc') return (a.filename || '').localeCompare(b.filename || '');
    if (state.sortBy === 'name_desc') return (b.filename || '').localeCompare(a.filename || '');
    return b.size_bytes - a.size_bytes;
  });

  state.filteredAttachments = list;
  state.visibleCount = state.initialBatch;

  renderFeed(true);
  updateSidebarStats();
}

function updateSidebarStats() {
  const active = state.allAttachments.filter(item => item.status !== 'trashed' && item.status !== 'moved');
  
  let totalBytes = 0;
  let imgCount = 0, imgBytes = 0;
  let vidCount = 0, vidBytes = 0;
  let docCount = 0, docBytes = 0;
  let audCount = 0, audBytes = 0;
  let arcCount = 0, arcBytes = 0;
  let hugeCount = 0;

  for (const it of active) {
    totalBytes += it.size_bytes || 0;
    if (it.size_bytes >= 26214400) hugeCount++;

    if (it.category === 'images') { imgCount++; imgBytes += it.size_bytes; }
    else if (it.category === 'videos') { vidCount++; vidBytes += it.size_bytes; }
    else if (it.category === 'documents') { docCount++; docBytes += it.size_bytes; }
    else if (it.category === 'audio') { audCount++; audBytes += it.size_bytes; }
    else if (it.category === 'archives') { arcCount++; arcBytes += it.size_bytes; }
  }

  el.countAll.textContent = active.length.toLocaleString();
  el.countImages.textContent = imgCount.toLocaleString();
  el.countVideos.textContent = vidCount.toLocaleString();
  el.countDocuments.textContent = docCount.toLocaleString();
  el.countAudio.textContent = audCount.toLocaleString();
  el.countArchives.textContent = arcCount.toLocaleString();
  el.countHuge.textContent = hugeCount.toLocaleString();

  el.totalStorageDisplay.textContent = formatBytes(totalBytes);
  el.freedSpaceDisplay.textContent = formatBytes(state.freedSpaceBytes);

  if (totalBytes > 0) {
    el.barImages.style.width = `${(imgBytes / totalBytes) * 100}%`;
    el.barVideos.style.width = `${(vidBytes / totalBytes) * 100}%`;
    el.barDocs.style.width = `${(docBytes / totalBytes) * 100}%`;
    const otherBytes = totalBytes - imgBytes - vidBytes - docBytes;
    el.barOther.style.width = `${Math.max(0, (otherBytes / totalBytes) * 100)}%`;
  } else {
    el.barImages.style.width = '0%';
    el.barVideos.style.width = '0%';
    el.barDocs.style.width = '0%';
    el.barOther.style.width = '0%';
  }
}

// ==========================================================================
// Rendering: Gold-Standard Infinite Feed
// ==========================================================================

function renderFeed(isReset = false) {
  const total = state.filteredAttachments.length;
  el.itemsCountSummary.textContent = `${total.toLocaleString()} ${total === 1 ? 'adjunto' : 'adjuntos'}`;

  if (total === 0) {
    el.emptyState.classList.remove('hidden');
    el.attachmentsGrid.classList.add('hidden');
    el.attachmentsTableContainer.classList.add('hidden');
    el.infiniteLoader.classList.add('hidden');
    el.infiniteEndMessage.classList.add('hidden');
    if (state.search) {
      el.emptyStateText.textContent = `No se encontraron adjuntos que coincidan con "${state.search}".`;
    } else if (state.category !== 'all') {
      el.emptyStateText.textContent = `No hay adjuntos en la categoría ${getCategoryLabel(state.category)}.`;
    } else {
      el.emptyStateText.textContent = 'No se encontraron adjuntos en tu bandeja de Gmail.';
    }
    updateSelectionUI();
    return;
  }

  el.emptyState.classList.add('hidden');

  const visibleItems = state.filteredAttachments.slice(0, state.visibleCount);

  if (state.viewMode === 'grid') {
    renderGrid(visibleItems, isReset);
    el.attachmentsGrid.classList.remove('hidden');
    el.attachmentsTableContainer.classList.add('hidden');
  } else {
    renderTable(visibleItems, isReset);
    el.attachmentsTableContainer.classList.remove('hidden');
    el.attachmentsGrid.classList.add('hidden');
  }

  if (state.visibleCount >= total) {
    el.infiniteLoader.classList.add('hidden');
    el.infiniteEndMessage.classList.remove('hidden');
  } else {
    el.infiniteLoader.classList.remove('hidden');
    el.infiniteEndMessage.classList.add('hidden');
  }

  updateSelectionUI();
}

function renderGrid(items, isReset) {
  if (isReset) {
    el.attachmentsGrid.innerHTML = '';
  }

  const currentRenderedCount = isReset ? 0 : el.attachmentsGrid.querySelectorAll('.attachment-card').length;
  const itemsToAppend = items.slice(currentRenderedCount);

  if (itemsToAppend.length === 0) return;

  const fragment = document.createDocumentFragment();

  itemsToAppend.forEach((item) => {
    const card = document.createElement('div');
    const isHuge = item.size_bytes >= 26214400; // >= 25 MB
    const isLarge = item.size_bytes >= 10485760 && item.size_bytes < 26214400; // 10-25 MB
    const isSelected = state.selectedIds.has(item.id);

    card.className = `attachment-card ${isHuge ? 'huge-file' : ''} ${isSelected ? 'selected' : ''}`;
    card.dataset.id = item.id;
    card.dataset.category = item.category;

    let badgeClass = '';
    if (isHuge) badgeClass = 'badge-huge';
    else if (isLarge) badgeClass = 'badge-large';

    const gmailUrl = getGmailSearchUrl(item);
    const fmt = window.PuduFormats.getDetails(item.filename, item.content_type);

    let previewContent = '';
    const cachedUrl = state.blobCache.get(item.id);

    if (fmt.isNativeImage || fmt.isNativeVideo) {
      if (cachedUrl) {
        previewContent = `
          <img class="card-img-preview" src="${cachedUrl}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'card-format-badge-box\\' style=\\'background: ${fmt.bg};\\'><div class=\\'format-icon\\'>${fmt.icon}</div><div class=\\'format-label-pill\\' style=\\'color: ${fmt.color}; border-color: ${fmt.color};\\'>${fmt.label}</div></div>'">
          ${fmt.isNativeVideo ? '<div class="card-video-overlay"><div class="play-btn-circle"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div></div>' : ''}
        `;
      } else {
        previewContent = `<div class="card-loading-shimmer"><span class="card-icon-fallback">${fmt.icon}</span></div>`;
      }
    } else if (fmt.isNativeAudio) {
      previewContent = `
        <div class="card-audio-preview" onclick="event.stopPropagation()">
          <div class="audio-pulse-circle" id="audioBtn_${item.id}" onclick="handleToggleInlineAudio('${item.id}')">
            <svg class="icon-play" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <svg class="icon-pause hidden" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
          </div>
          <div class="audio-wave-bars">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
          <div class="audio-time-label" id="audioTime_${item.id}">0:00</div>
        </div>
      `;
    } else {
      // Specialized file format badge (TIFF, AI, PSD, RAW, PDF, DOC, ZIP, etc.)
      previewContent = `
        <div class="card-format-badge-box" style="background: ${fmt.bg};">
          <div class="format-icon">${fmt.icon}</div>
          <div class="format-label-pill" style="color: ${fmt.color}; border-color: ${fmt.color};">${fmt.label}</div>
        </div>
      `;
    }

    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
      <div class="card-preview-wrapper" onclick="openPreviewModal('${item.id}')">
        ${previewContent}
        <span class="card-size-badge ${badgeClass}">${formatBytes(item.size_bytes)}</span>
      </div>
      <div class="card-body" onclick="openPreviewModal('${item.id}')">
        <div class="card-title" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</div>
        <div class="card-meta">
          <span class="card-sender" title="${escapeHtml(item.sender_name || item.sender)}">${escapeHtml(item.sender_name || item.sender || 'Gmail')}</span>
          <span class="card-date">${formatDate(item.date)}</span>
        </div>
        <div class="card-actions-quick" onclick="event.stopPropagation()">
          <button class="btn-quick-move" onclick="handleMoveToDevice('${item.id}')" title="Descargar y enviar a la papelera de Gmail">
            📥➡️🗑️ Mover
          </button>
          <a href="${gmailUrl}" target="_blank" class="btn-quick-gmail" title="Abrir en Gmail">
            Gmail
          </a>
        </div>
      </div>
    `;

    fragment.appendChild(card);

    if ((fmt.isNativeImage || fmt.isNativeVideo) && !cachedUrl) {
      cardIntersectionObserver.observe(card);
    }
  });

  el.attachmentsGrid.appendChild(fragment);

  // Checkbox listeners
  el.attachmentsGrid.querySelectorAll('.card-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      const card = e.target.closest('.attachment-card');
      if (card) card.classList.toggle('selected', e.target.checked);
      updateSelectionUI();
    });
  });
}

function renderTable(items, isReset) {
  if (isReset) {
    el.attachmentsTableBody.innerHTML = '';
  }

  const currentRenderedCount = isReset ? 0 : el.attachmentsTableBody.querySelectorAll('tr').length;
  const itemsToAppend = items.slice(currentRenderedCount);

  if (itemsToAppend.length === 0) return;

  const fragment = document.createDocumentFragment();

  itemsToAppend.forEach((item) => {
    const row = document.createElement('tr');
    const isSelected = state.selectedIds.has(item.id);
    if (isSelected) row.classList.add('selected');
    row.dataset.id = item.id;

    const gmailUrl = getGmailSearchUrl(item);
    const fmt = window.PuduFormats.getDetails(item.filename, item.content_type);
    const cachedUrl = state.blobCache.get(item.id);

    let thumbHtml = `<span style="font-size: 20px;">${fmt.icon}</span>`;
    if (fmt.isNativeImage && cachedUrl) {
      thumbHtml = `<img class="table-thumb" src="${cachedUrl}" alt="" loading="lazy">`;
    }

    row.innerHTML = `
      <td onclick="event.stopPropagation()"><input type="checkbox" class="table-row-cb" data-id="${item.id}" ${isSelected ? 'checked' : ''}></td>
      <td onclick="openPreviewModal('${item.id}')">${thumbHtml}</td>
      <td onclick="openPreviewModal('${item.id}')"><strong>${escapeHtml(item.filename)}</strong></td>
      <td onclick="openPreviewModal('${item.id}')"><span class="size-pill">${formatBytes(item.size_bytes)}</span></td>
      <td onclick="openPreviewModal('${item.id}')"><span class="preview-category-badge" style="background: ${fmt.bg}; color: ${fmt.color};">${fmt.label}</span></td>
      <td onclick="openPreviewModal('${item.id}')">${escapeHtml(item.sender_name || item.sender || 'Gmail')}</td>
      <td onclick="openPreviewModal('${item.id}')" style="color: var(--text-secondary); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.subject || '-')}</td>
      <td onclick="openPreviewModal('${item.id}')" style="color: var(--text-muted); font-size: 12px;">${formatDate(item.date)}</td>
      <td onclick="event.stopPropagation()">
        <div style="display: flex; gap: 6px; align-items: center;">
          <button class="btn-quick-move" onclick="handleMoveToDevice('${item.id}')" title="Mover al Dispositivo (Descargar + Borrar)">📥➡️🗑️</button>
          <a href="${gmailUrl}" target="_blank" class="btn-quick-gmail" title="Abrir en Gmail">Gmail</a>
        </div>
      </td>
    `;

    fragment.appendChild(row);
  });

  el.attachmentsTableBody.appendChild(fragment);

  // Checkbox listeners
  el.attachmentsTableBody.querySelectorAll('.table-row-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      const row = e.target.closest('tr');
      if (row) row.classList.toggle('selected', e.target.checked);
      updateSelectionUI();
    });
  });
}

// ==========================================================================
// Gold-Standard Single Instance Infinite Scroll Observer
// ==========================================================================

function initInfiniteScroll() {
  if (!el.infiniteScrollSentinel) return;

  const infiniteObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry.isIntersecting && !state.isLoadingMore) {
      if (state.visibleCount < state.filteredAttachments.length) {
        loadMoreItems();
      }
    }
  }, {
    root: el.explorerBody,
    rootMargin: '250px 0px',
    threshold: 0.05
  });

  infiniteObserver.observe(el.infiniteScrollSentinel);
}

function loadMoreItems() {
  if (state.isLoadingMore || state.visibleCount >= state.filteredAttachments.length) {
    return;
  }

  state.isLoadingMore = true;
  state.visibleCount += state.batchSize;

  requestAnimationFrame(() => {
    renderFeed(false);
    state.isLoadingMore = false;
  });
}

// ==========================================================================
// Inline Audio Streaming / Preview Controller
// ==========================================================================

async function handleToggleInlineAudio(attId) {
  const item = state.allAttachments.find(x => x.id === attId);
  if (!item) return;

  const btnEl = document.getElementById(`audioBtn_${attId}`);
  const timeEl = document.getElementById(`audioTime_${attId}`);

  if (state.currentlyPlayingAudioId === attId) {
    const player = state.audioPlayers.get(attId);
    if (player) {
      if (player.paused) {
        player.play();
        setAudioCardPlayingState(attId, true);
      } else {
        player.pause();
        setAudioCardPlayingState(attId, false);
      }
    }
    return;
  }

  if (state.currentlyPlayingAudioId) {
    const prevPlayer = state.audioPlayers.get(state.currentlyPlayingAudioId);
    if (prevPlayer) {
      prevPlayer.pause();
      setAudioCardPlayingState(state.currentlyPlayingAudioId, false);
    }
  }

  if (btnEl) btnEl.classList.add('loading');

  try {
    let audioUrl = state.blobCache.get(attId);
    if (!audioUrl) {
      const blob = await window.puduGmailService.downloadAttachmentBlob(item);
      audioUrl = URL.createObjectURL(blob);
      state.blobCache.set(attId, audioUrl);
    }

    let player = state.audioPlayers.get(attId);
    if (!player) {
      player = new Audio(audioUrl);
      state.audioPlayers.set(attId, player);

      player.ontimeupdate = () => {
        if (timeEl) {
          const mins = Math.floor(player.currentTime / 60);
          const secs = Math.floor(player.currentTime % 60).toString().padStart(2, '0');
          timeEl.textContent = `${mins}:${secs}`;
        }
      };

      player.onended = () => {
        setAudioCardPlayingState(attId, false);
        state.currentlyPlayingAudioId = null;
        if (timeEl) timeEl.textContent = '0:00';
      };
    }

    await player.play();
    state.currentlyPlayingAudioId = attId;
    if (btnEl) btnEl.classList.remove('loading');
    setAudioCardPlayingState(attId, true);
  } catch (err) {
    if (btnEl) btnEl.classList.remove('loading');
    alert(`No se pudo reproducir audio: ${err.message}`);
  }
}

function setAudioCardPlayingState(attId, isPlaying) {
  const btnEl = document.getElementById(`audioBtn_${attId}`);
  const card = btnEl ? btnEl.closest('.attachment-card') : null;
  if (!btnEl) return;

  const iconPlay = btnEl.querySelector('.icon-play');
  const iconPause = btnEl.querySelector('.icon-pause');

  if (isPlaying) {
    if (iconPlay) iconPlay.classList.add('hidden');
    if (iconPause) iconPause.classList.remove('hidden');
    if (card) card.classList.add('audio-playing');
  } else {
    if (iconPlay) iconPlay.classList.remove('hidden');
    if (iconPause) iconPause.classList.add('hidden');
    if (card) card.classList.remove('audio-playing');
  }
}

function updateSelectionUI() {
  const count = state.selectedIds.size;
  if (count > 0) {
    let totalBytes = 0;
    state.allAttachments.forEach(it => {
      if (state.selectedIds.has(it.id)) totalBytes += it.size_bytes || 0;
    });

    el.selectedCountBadge.textContent = count;
    el.selectedSizeLabel.textContent = `(${formatBytes(totalBytes)})`;
    el.floatingActionBar.classList.remove('hidden');
  } else {
    el.floatingActionBar.classList.add('hidden');
  }

  const allVisible = state.filteredAttachments.slice(0, state.visibleCount);
  const allSelected = allVisible.length > 0 && allVisible.every(it => state.selectedIds.has(it.id));
  el.selectAllCheckbox.checked = allSelected;
  el.tableSelectAll.checked = allSelected;
}

// ==========================================================================
// User Actions: Move to Device, Download, Delete
// ==========================================================================

async function handleMoveToDevice(attId) {
  const att = state.allAttachments.find(x => x.id === attId);
  if (!att) return;

  try {
    showToast('Descargando archivo... 📥', `Descargando ${att.filename}`);
    const blob = await window.puduGmailService.downloadAttachmentBlob(att);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    // Trash in Gmail
    await window.puduGmailService.moveMessageToTrash(att.msg_id);

    att.status = 'moved';
    await window.puduStorage.updateAttachmentStatus(att.id, 'moved');

    state.freedSpaceBytes += att.size_bytes || 0;
    await window.puduStorage.setSetting('freed_space_bytes', state.freedSpaceBytes);

    showToast(
      '¡Pudu Postal Feliz! 🦌🎉',
      `Descargaste "${att.filename}" y liberaste ${formatBytes(att.size_bytes)} en tu Gmail.`
    );

    state.selectedIds.delete(att.id);
    closePreviewModal();
    applyFiltersAndSort();
  } catch (err) {
    alert(`Error al mover al dispositivo: ${err.message}`);
  }
}

async function handleDownloadSingle(attId) {
  const att = state.allAttachments.find(x => x.id === attId);
  if (!att) return;

  try {
    showToast('Descargando...', att.filename);
    const blob = await window.puduGmailService.downloadAttachmentBlob(att);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    alert(`Error al descargar: ${err.message}`);
  }
}

async function handleDeleteSingle(attId) {
  const att = state.allAttachments.find(x => x.id === attId);
  if (!att) return;

  if (!confirm(`¿Estás seguro de enviar a la papelera el correo que contiene "${att.filename}"?`)) {
    return;
  }

  try {
    await window.puduGmailService.moveMessageToTrash(att.msg_id);
    att.status = 'trashed';
    await window.puduStorage.updateAttachmentStatus(att.id, 'trashed');

    state.freedSpaceBytes += att.size_bytes || 0;
    await window.puduStorage.setSetting('freed_space_bytes', state.freedSpaceBytes);

    showToast('Correo en Papelera 🗑️', `Liberaste ${formatBytes(att.size_bytes)} en tu Gmail.`);
    state.selectedIds.delete(att.id);
    closePreviewModal();
    applyFiltersAndSort();
  } catch (err) {
    alert(`Error al borrar: ${err.message}`);
  }
}

// Bulk Actions
async function handleBulkMoveToDevice() {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return;

  if (!confirm(`¿Mover ${ids.length} archivos a tu dispositivo? Se descargarán y se enviarán sus correos a la papelera de Gmail para liberar espacio.`)) {
    return;
  }

  let totalFreed = 0;
  for (const id of ids) {
    const att = state.allAttachments.find(x => x.id === id);
    if (att) {
      try {
        const blob = await window.puduGmailService.downloadAttachmentBlob(att);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        await window.puduGmailService.moveMessageToTrash(att.msg_id);
        att.status = 'moved';
        await window.puduStorage.updateAttachmentStatus(att.id, 'moved');
        totalFreed += att.size_bytes || 0;
      } catch (e) {
        console.error('Error in bulk move item:', e);
      }
    }
  }

  state.freedSpaceBytes += totalFreed;
  await window.puduStorage.setSetting('freed_space_bytes', state.freedSpaceBytes);

  showToast('¡Operación Exitosa! 🦌🌿', `Se descargaron los archivos y liberaste ${formatBytes(totalFreed)}.`);
  state.selectedIds.clear();
  applyFiltersAndSort();
}

async function handleBulkDownloadZip() {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return;

  if (!window.JSZip) {
    alert('La biblioteca JSZip no está cargada.');
    return;
  }

  const zip = new JSZip();
  showToast('Comprimiendo ZIP... 📦', `Preparando ${ids.length} archivos en el navegador...`);

  for (const id of ids) {
    const att = state.allAttachments.find(x => x.id === id);
    if (att) {
      try {
        const blob = await window.puduGmailService.downloadAttachmentBlob(att);
        zip.file(att.filename, blob);
      } catch (e) {
        console.error('Error adding file to zip:', e);
      }
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pudugmail_adjuntos.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function handleBulkDelete() {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return;

  if (!confirm(`¿Estás seguro de enviar a la papelera los correos de los ${ids.length} archivos seleccionados?`)) {
    return;
  }

  let totalFreed = 0;
  for (const id of ids) {
    const att = state.allAttachments.find(x => x.id === id);
    if (att) {
      try {
        await window.puduGmailService.moveMessageToTrash(att.msg_id);
        att.status = 'trashed';
        await window.puduStorage.updateAttachmentStatus(att.id, 'trashed');
        totalFreed += att.size_bytes || 0;
      } catch (e) {
        console.error('Error trashing message:', e);
      }
    }
  }

  state.freedSpaceBytes += totalFreed;
  await window.puduStorage.setSetting('freed_space_bytes', state.freedSpaceBytes);

  showToast('Correos a la Papelera 🗑️', `Liberaste ${formatBytes(totalFreed)} en tu Gmail.`);
  state.selectedIds.clear();
  applyFiltersAndSort();
}

// ==========================================================================
// Lightbox Modal
// ==========================================================================

async function openPreviewModal(attId) {
  const index = state.filteredAttachments.findIndex(x => x.id === attId);
  if (index < 0) return;
  state.currentModalIndex = index;
  const item = state.filteredAttachments[index];
  const fmt = window.PuduFormats.getDetails(item.filename, item.content_type);

  el.modalFileName.textContent = item.filename;
  el.modalCategoryBadge.textContent = fmt.label;
  el.modalCategoryBadge.style.backgroundColor = fmt.bg;
  el.modalCategoryBadge.style.color = fmt.color;

  el.modalSize.textContent = formatBytes(item.size_bytes);
  el.modalDate.textContent = formatDate(item.date);
  el.modalSender.textContent = `${item.sender_name || ''} <${item.sender || ''}>`.trim();
  el.modalSubject.textContent = item.subject || '(Sin Asunto)';
  el.modalMime.textContent = item.content_type || 'application/octet-stream';

  const gmailUrl = getGmailSearchUrl(item);
  el.modalOpenGmailBtn.href = gmailUrl;

  el.modalMoveToDeviceBtn.onclick = () => handleMoveToDevice(item.id);
  el.modalDownloadBtn.onclick = () => handleDownloadSingle(item.id);
  el.modalDeleteBtn.onclick = () => handleDeleteSingle(item.id);

  el.modalMediaContainer.innerHTML = '<div style="color: #2ecc71; font-size: 14px;">Cargando vista previa desde Gmail... ⏳</div>';
  el.previewModal.classList.remove('hidden');

  try {
    let previewSrc = state.blobCache.get(item.id);
    if (!previewSrc || previewSrc.startsWith('data:image/')) {
      const blob = await window.puduGmailService.downloadAttachmentBlob(item);
      previewSrc = URL.createObjectURL(blob);
    }

    if (fmt.isNativeImage) {
      el.modalMediaContainer.innerHTML = '';
      const img = document.createElement('img');
      img.src = previewSrc;
      img.alt = item.filename;
      img.onerror = () => {
        el.modalMediaContainer.innerHTML = `
          <div style="text-align: center;">
            <div style="font-size: 80px; margin-bottom: 16px;">${fmt.icon}</div>
            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Archivo ${fmt.label} listo para descargar.</p>
            <button class="btn-pudu-primary" onclick="handleDownloadSingle('${item.id}')">Descargar ${escapeHtml(item.filename)}</button>
          </div>
        `;
      };
      el.modalMediaContainer.appendChild(img);
    } else if (fmt.isNativeVideo) {
      el.modalMediaContainer.innerHTML = '';
      const video = document.createElement('video');
      video.src = previewSrc;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      el.modalMediaContainer.appendChild(video);
    } else if (fmt.isNativeAudio) {
      el.modalMediaContainer.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 64px; margin-bottom: 20px;">🎵</div>
          <audio controls autoplay src="${previewSrc}" style="width: 320px;"></audio>
        </div>
      `;
    } else {
      el.modalMediaContainer.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 80px; margin-bottom: 16px;">${fmt.icon}</div>
          <div style="display: inline-block; padding: 4px 12px; border-radius: 12px; font-weight: 700; font-size: 14px; margin-bottom: 12px; background: ${fmt.bg}; color: ${fmt.color}; border: 1px solid ${fmt.color};">${fmt.label}</div>
          <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Archivo listo para descargar y explorar.</p>
          <button class="btn-pudu-primary" onclick="handleDownloadSingle('${item.id}')">Descargar ${escapeHtml(item.filename)}</button>
        </div>
      `;
    }
  } catch (err) {
    el.modalMediaContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted);">
        <p>No se pudo cargar la vista previa directa: ${err.message}</p>
        <button class="btn-pudu-primary mt-4" onclick="handleDownloadSingle('${item.id}')">Descargar archivo</button>
      </div>
    `;
  }
}

function closePreviewModal() {
  el.previewModal.classList.add('hidden');
  el.modalMediaContainer.innerHTML = '';
  state.currentModalIndex = -1;
}

// ==========================================================================
// 1-Click Google OAuth & Progressive Sync
// ==========================================================================

function handleDirectGoogleLogin() {
  el.heroErrorAlert.classList.add('hidden');

  window.puduGmailService.loginWithGoogle(async (res) => {
    if (res.success) {
      onLoginSuccess(res.user);
    } else {
      if (res.error === 'GIS_NOT_LOADED') {
        el.heroErrorAlert.textContent = 'Cargando servicios de Google... Por favor inténtalo de nuevo en 2 segundos.';
      } else {
        el.heroErrorAlert.textContent = `Error al conectar con Google: ${res.error || 'Verifica tu conexión'}`;
      }
      el.heroErrorAlert.classList.remove('hidden');
    }
  });
}

function onLoginSuccess(user) {
  el.loginHeroScreen.classList.add('hidden');
  el.mainAppLayout.classList.remove('hidden');

  el.accountEmailDisplay.textContent = user?.emailAddress || 'Conectado';
  el.accountStatusTag.textContent = 'Gmail Activo';

  showToast('¡Sesión Iniciada! 🦌✉️', `Conectado como ${user?.emailAddress || 'usuario de Gmail'}`);
  startScan();
}

function handleLogout() {
  window.puduGmailService.logout();
  el.mainAppLayout.classList.add('hidden');
  el.loginHeroScreen.classList.remove('hidden');
  showToast('Sesión Cerrada 🚪', 'Has salido de tu cuenta de Gmail.');
}

async function startScan() {
  if (state.isScanning) return;
  state.isScanning = true;

  el.syncProgressBanner.classList.remove('hidden');
  el.syncProgressTitle.textContent = 'El Pudu está buscando tus adjuntos...';
  el.syncProgressText.textContent = 'Iniciando escaneo...';
  el.syncProgressBar.style.width = '5%';
  el.syncPercentText.textContent = '5%';

  try {
    const results = await window.puduGmailService.scanAttachments(
      (prog) => {
        el.syncProgressText.textContent = prog.message;
        el.syncProgressBar.style.width = `${prog.percent}%`;
        el.syncPercentText.textContent = `${prog.percent}%`;
      },
      (newChunk) => {
        state.allAttachments = [...state.allAttachments, ...newChunk];
        applyFiltersAndSort();
      },
      500
    );

    state.allAttachments = results;
    await window.puduStorage.saveAttachments(results);

    showToast('¡Escaneo Listo! 🦌✨', `Se encontraron ${results.length} adjuntos en tu bandeja.`);
    applyFiltersAndSort();
  } catch (err) {
    alert(`Error al escanear Gmail: ${err.message}`);
  } finally {
    state.isScanning = false;
    setTimeout(() => {
      el.syncProgressBanner.classList.add('hidden');
    }, 1500);
  }
}

// ==========================================================================
// Event Listeners & Initialization
// ==========================================================================

function initEvents() {
  if (el.btnHeroGoogleLogin) {
    el.btnHeroGoogleLogin.addEventListener('click', handleDirectGoogleLogin);
  }

  if (el.btnLogout) el.btnLogout.addEventListener('click', handleLogout);

  if (el.btnRescan) el.btnRescan.addEventListener('click', startScan);
  if (el.btnSyncNow) el.btnSyncNow.addEventListener('click', startScan);
  if (el.btnScanEmpty) el.btnScanEmpty.addEventListener('click', startScan);

  el.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      el.navItems.forEach(b => b.classList.remove('active'));
      el.sizeItems.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.category;
      state.sizePreset = null;
      el.breadcrumbCategory.textContent = getCategoryLabel(state.category);
      applyFiltersAndSort();
    });
  });

  el.sizeItems.forEach(btn => {
    btn.addEventListener('click', () => {
      el.sizeItems.forEach(b => b.classList.remove('active'));
      el.navItems.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sizePreset = btn.dataset.size;
      state.category = 'all';
      el.breadcrumbCategory.textContent = `Tamaño: ${btn.querySelector('.nav-label').textContent}`;
      applyFiltersAndSort();
    });
  });

  let searchTimeout = null;
  el.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    el.btnClearSearch.classList.toggle('hidden', !val);
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = val;
      applyFiltersAndSort();
    }, 200);
  });

  el.btnClearSearch.addEventListener('click', () => {
    el.searchInput.value = '';
    el.btnClearSearch.classList.add('hidden');
    state.search = '';
    applyFiltersAndSort();
  });

  el.sortBySelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    applyFiltersAndSort();
  });

  el.btnViewGrid.addEventListener('click', () => {
    state.viewMode = 'grid';
    el.btnViewGrid.classList.add('active');
    el.btnViewTable.classList.remove('active');
    renderFeed(true);
  });

  el.btnViewTable.addEventListener('click', () => {
    state.viewMode = 'table';
    el.btnViewTable.classList.add('active');
    el.btnViewGrid.classList.remove('active');
    renderFeed(true);
  });

  document.querySelectorAll('.explorer-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const sortKey = th.dataset.sort;
      if (sortKey) {
        state.sortBy = sortKey;
        el.sortBySelect.value = sortKey;
        document.querySelectorAll('.explorer-table th.sortable').forEach(t => t.classList.remove('active'));
        th.classList.add('active');
        applyFiltersAndSort();
      }
    });
  });

  const handleSelectAll = (checked) => {
    const visibleItems = state.filteredAttachments.slice(0, state.visibleCount);
    visibleItems.forEach(it => {
      if (checked) state.selectedIds.add(it.id);
      else state.selectedIds.delete(it.id);
    });
    renderFeed(false);
  };

  el.selectAllCheckbox.addEventListener('change', (e) => handleSelectAll(e.target.checked));
  el.tableSelectAll.addEventListener('change', (e) => handleSelectAll(e.target.checked));

  el.btnMoveSelectedToDevice.addEventListener('click', handleBulkMoveToDevice);
  el.btnDownloadSelectedZip.addEventListener('click', handleBulkDownloadZip);
  el.btnDeleteSelected.addEventListener('click', handleBulkDelete);
  el.btnClearSelection.addEventListener('click', () => {
    state.selectedIds.clear();
    renderFeed(false);
  });

  el.btnCloseModal.addEventListener('click', closePreviewModal);
  el.previewModal.addEventListener('click', (e) => {
    if (e.target === el.previewModal) closePreviewModal();
  });

  window.addEventListener('keydown', (e) => {
    if (!el.previewModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closePreviewModal();
      if (e.key === 'ArrowLeft' && state.currentModalIndex > 0) {
        const prevItem = state.filteredAttachments[state.currentModalIndex - 1];
        if (prevItem) openPreviewModal(prevItem.id);
      }
      if (e.key === 'ArrowRight' && state.currentModalIndex < state.filteredAttachments.length - 1) {
        const nextItem = state.filteredAttachments[state.currentModalIndex + 1];
        if (nextItem) openPreviewModal(nextItem.id);
      }
    }
  });

  initInfiniteScroll();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// ==========================================================================
// Bootstrapping
// ==========================================================================

async function init() {
  initEvents();

  state.freedSpaceBytes = await window.puduStorage.getSetting('freed_space_bytes', 0);

  // Pre-load all cached thumbnails from IndexedDB into memory
  try {
    const savedThumbs = await window.puduStorage.getAllThumbnails();
    if (savedThumbs && savedThumbs.length > 0) {
      savedThumbs.forEach(t => {
        if (t && t.id && t.dataUrl) {
          state.blobCache.set(t.id, t.dataUrl);
        }
      });
    }
  } catch (e) {
    console.warn('Error pre-loading thumbnails:', e);
  }

  // Load cached attachments if any
  const cached = await window.puduStorage.getAllAttachments();
  if (cached && cached.length > 0) {
    state.allAttachments = cached;
  }

  if (window.puduGmailService.accessToken) {
    el.loginHeroScreen.classList.add('hidden');
    el.mainAppLayout.classList.remove('hidden');
    applyFiltersAndSort();
  } else {
    el.mainAppLayout.classList.add('hidden');
    el.loginHeroScreen.classList.remove('hidden');
  }
}

window.addEventListener('DOMContentLoaded', init);
