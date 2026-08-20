/**
 * PUDÚ MAIL 2 - MAIN APPLICATION CONTROLLER
 * Full client-side attachment explorer with sorting by size, in-browser previews,
 * File System Access API (Move to disk), and Extension Bridge.
 */

class PuduApp {
  constructor() {
    this.attachments = [];
    this.filteredAttachments = [];
    this.selectedIds = new Set();
    this.sortColumn = 'sizeBytes';
    this.sortDirection = 'desc'; // Default: Largest files first to free storage
    this.filterCategory = 'all';
    this.searchQuery = '';
    this.minSizeBytes = 0;
    this.viewMode = 'table'; // 'table' or 'grid'

    this.initElements();
    this.bindEvents();
    this.checkInitialExtensionStatus();
    this.loadCachedData();
  }

  initElements() {
    // Top & Stats
    this.extensionBadge = document.getElementById('extensionStatusBadge');
    this.statTotalSize = document.getElementById('statTotalSize');
    this.statTotalFiles = document.getElementById('statTotalFiles');
    this.statLargestFile = document.getElementById('statLargestFile');
    this.statSelectedCount = document.getElementById('statSelectedCount');

    // Controls
    this.searchInput = document.getElementById('searchInput');
    this.categoryChips = document.querySelectorAll('.category-chip');
    this.minSizeSelect = document.getElementById('minSizeSelect');
    this.btnSortSize = document.getElementById('btnSortSize');
    this.btnScanGmail = document.getElementById('btnScanGmail');
    this.btnSelectAll = document.getElementById('btnSelectAll');
    this.btnMoveToDisk = document.getElementById('btnMoveToDisk');
    this.btnDownloadZip = document.getElementById('btnDownloadZip');
    this.btnViewTable = document.getElementById('btnViewTable');
    this.btnViewGrid = document.getElementById('btnViewGrid');

    // Lists & Containers
    this.attachmentsContainer = document.getElementById('attachmentsContainer');
    this.emptyState = document.getElementById('emptyState');
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.progressBar = document.getElementById('loadingProgressBar');
    this.progressText = document.getElementById('loadingProgressText');

    // Modals
    this.extensionModal = document.getElementById('extensionModal');
    this.previewModal = document.getElementById('previewModal');
    this.previewContent = document.getElementById('previewContent');
    this.previewTitle = document.getElementById('previewTitle');
    this.previewSize = document.getElementById('previewSize');
    this.btnClosePreview = document.getElementById('btnClosePreview');

    // Dropzone
    this.dropZone = document.getElementById('localFileDropzone');
    this.fileInput = document.getElementById('localFileInput');
  }

  bindEvents() {
    // Search & Filters
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.applyFiltersAndRender();
      });
    }

    if (this.categoryChips) {
      this.categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
          this.categoryChips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.filterCategory = chip.dataset.category || 'all';
          this.applyFiltersAndRender();
        });
      });
    }

    if (this.minSizeSelect) {
      this.minSizeSelect.addEventListener('change', (e) => {
        this.minSizeBytes = parseInt(e.target.value, 10) || 0;
        this.applyFiltersAndRender();
      });
    }

    // Sort buttons
    const sortHeaders = document.querySelectorAll('th[data-sort]');
    sortHeaders.forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this.sortColumn === col) {
          this.sortDirection = this.sortDirection === 'desc' ? 'asc' : 'desc';
        } else {
          this.sortColumn = col;
          this.sortDirection = col === 'sizeBytes' || col === 'date' ? 'desc' : 'asc';
        }
        this.updateSortHeaders();
        this.applyFiltersAndRender();
      });
    });

    // Scan Gmail via Extension
    if (this.btnScanGmail) {
      this.btnScanGmail.addEventListener('click', () => this.handleScanGmail());
    }

    // Select All
    if (this.btnSelectAll) {
      this.btnSelectAll.addEventListener('click', () => this.toggleSelectAll());
    }

    // Move to Disk (Native File System Access API)
    if (this.btnMoveToDisk) {
      this.btnMoveToDisk.addEventListener('click', () => this.handleMoveToDisk());
    }

    // Download ZIP
    if (this.btnDownloadZip) {
      this.btnDownloadZip.addEventListener('click', () => this.handleDownloadZip());
    }

    // View Switcher (Table / Grid)
    if (this.btnViewTable) {
      this.btnViewTable.addEventListener('click', () => this.setViewMode('table'));
    }
    if (this.btnViewGrid) {
      this.btnViewGrid.addEventListener('click', () => this.setViewMode('grid'));
    }

    // Drag & Drop Local Files
    if (this.dropZone) {
      this.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropZone.classList.add('drag-active');
      });
      this.dropZone.addEventListener('dragleave', () => this.dropZone.classList.remove('drag-active'));
      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropZone.classList.remove('drag-active');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleLocalFiles(e.dataTransfer.files);
        }
      });
      this.dropZone.addEventListener('click', () => {
        if (this.fileInput) this.fileInput.click();
      });
    }

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleLocalFiles(e.target.files);
        }
      });
    }

    // Preview Modal close
    if (this.btnClosePreview) {
      this.btnClosePreview.addEventListener('click', () => this.closePreviewModal());
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closePreviewModal();
    });
  }

  async checkInitialExtensionStatus() {
    const isDetected = await window.PuduBridge.detectExtension();
    this.updateExtensionBadge(isDetected);
  }

  updateExtensionBadge(installed) {
    if (!this.extensionBadge) return;
    if (installed) {
      this.extensionBadge.className = 'status-badge connected';
      this.extensionBadge.innerHTML = '<span>⚡</span> Conector 1-Clic Activo';
    } else {
      this.extensionBadge.className = 'status-badge disconnected';
      this.extensionBadge.innerHTML = '<span>🧩</span> Conector Disponible';
    }
  }

  async handleScanGmail() {
    console.log('%c[Pudú App] 🚀 Botón Explorar Gmail clickeado', 'color: #38bdf8; font-weight: bold;');
    this.showLoading(true, '🔍 Escaneando adjuntos en tu Gmail…');
    
    // Animate the loading message to show progress
    const msgs = [
      '🔍 Escaneando adjuntos en tu Gmail…',
      '📜 Desplazando la bandeja para encontrar más correos…',
      '📎 Extrayendo nombres de archivos y tamaños…',
      '⚡ Casi listo, procesando resultados…'
    ];
    let msgIdx = 0;
    const progressInterval = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, msgs.length - 1);
      this.showLoading(true, msgs[msgIdx]);
    }, 3000);

    try {
      const result = await window.PuduBridge.scanGmail('has:attachment');
      console.log('%c[Pudú App] Resultado del escaneo:', 'color: #10b981;', result);

      if (result.success && result.attachments && result.attachments.length > 0) {
        this.attachments = result.attachments;
        this.saveCachedData();
        this.applyFiltersAndRender();
      } else if (result.needsExtension) {
        this.openExtensionModal();
      } else {
        // No attachments found — show helpful message, NOT fake data
        console.log('%c[Pudú App] ⚠️ No se encontraron adjuntos reales', 'color: #f59e0b;');
        this.attachments = [];
        this.applyFiltersAndRender();
        alert('No se encontraron adjuntos visibles.\n\nConsejo: Abre Gmail en otra pestaña, navega a la búsqueda "has:attachment" y luego vuelve a hacer clic en "Explorar Gmail".\n\nEl conector necesita que Gmail esté abierto con correos que tengan adjuntos visibles.');
      }
    } catch (err) {
      console.error('[Pudú App] Error en handleScanGmail:', err);
      alert('Error al conectar con Gmail. Asegúrate de tener Gmail abierto en otra pestaña.');
    } finally {
      clearInterval(progressInterval);
      this.showLoading(false);
    }
  }

  getSampleData() {
    return [
      {
        id: 'sample_1',
        filename: 'Memoria_Anual_2025_Final.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 48.6 * 1024 * 1024,
        sizeFormatted: '48.6 MB',
        sender: 'directorio@empresa.com',
        subject: 'Reporte Financiero y Memoria Anual Consolidada',
        date: '2026-02-14T10:30:00Z',
        downloadUrl: '#'
      },
      {
        id: 'sample_2',
        filename: 'Video_Presentacion_Lanzamiento.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 124.2 * 1024 * 1024,
        sizeFormatted: '124.2 MB',
        sender: 'marketing@pudumail.com',
        subject: 'Video en alta definición para campaña',
        date: '2026-03-01T15:20:00Z',
        downloadUrl: '#'
      },
      {
        id: 'sample_3',
        filename: 'Backup_Fotografias_Evento.zip',
        mimeType: 'application/zip',
        sizeBytes: 89.5 * 1024 * 1024,
        sizeFormatted: '89.5 MB',
        sender: 'fotografia@estudio.cl',
        subject: 'Fotos en RAW del evento de cierre',
        date: '2026-01-20T18:00:00Z',
        downloadUrl: '#'
      },
      {
        id: 'sample_4',
        filename: 'Factura_Servicios_AWS_Cloud.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1.8 * 1024 * 1024,
        sizeFormatted: '1.8 MB',
        sender: 'invoicing@aws.amazon.com',
        subject: 'Tu factura fiscal electrónica de Febrero',
        date: '2026-02-28T08:10:00Z',
        downloadUrl: '#'
      },
      {
        id: 'sample_5',
        filename: 'Infografia_Pudu_Mascota.png',
        mimeType: 'image/png',
        sizeBytes: 4.2 * 1024 * 1024,
        sizeFormatted: '4.2 MB',
        sender: 'diseno@pudumail.com',
        subject: 'Ilustración oficial del Pudú en alta resolución',
        date: '2026-03-10T12:00:00Z',
        downloadUrl: 'assets/pudu_mascot.jpg'
      }
    ];
  }

  openExtensionModal() {
    if (this.extensionModal) this.extensionModal.classList.remove('hidden');
  }

  closeExtensionModal() {
    if (this.extensionModal) this.extensionModal.classList.add('hidden');
  }

  loadSampleData() {
    this.attachments = this.getSampleData();
    this.saveCachedData();
    this.applyFiltersAndRender();
  }

  async handleLocalFiles(files) {
    this.showLoading(true, 'Extrayendo adjuntos del archivo local...');
    let allExtracted = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.endsWith('.mbox') || file.name.endsWith('.eml')) {
        const results = await window.MboxParser.parseFile(file, (pct) => {
          if (this.progressBar) this.progressBar.style.width = `${pct}%`;
          if (this.progressText) this.progressText.innerText = `Procesando ${file.name} (${pct}%)...`;
        });
        allExtracted = allExtracted.concat(results);
      }
    }

    if (allExtracted.length > 0) {
      this.attachments = allExtracted;
      this.saveCachedData();
      this.applyFiltersAndRender();
    } else {
      alert('No se encontraron adjuntos en los archivos seleccionados.');
    }
    this.showLoading(false);
  }

  applyFiltersAndRender() {
    let list = [...this.attachments];

    // 1. Category Filter
    if (this.filterCategory !== 'all') {
      list = list.filter(item => {
        const cat = PuduFormats.getFileCategory(item.mimeType, item.filename).category;
        return cat === this.filterCategory;
      });
    }

    // 2. Minimum Size Filter
    if (this.minSizeBytes > 0) {
      list = list.filter(item => item.sizeBytes >= this.minSizeBytes);
    }

    // 3. Search Query
    if (this.searchQuery) {
      list = list.filter(item => {
        return (
          item.filename.toLowerCase().includes(this.searchQuery) ||
          item.subject.toLowerCase().includes(this.searchQuery) ||
          item.sender.toLowerCase().includes(this.searchQuery)
        );
      });
    }

    // 4. Sorting
    list.sort((a, b) => {
      let valA = a[this.sortColumn];
      let valB = b[this.sortColumn];

      if (this.sortColumn === 'sizeBytes') {
        valA = a.sizeBytes || 0;
        valB = b.sizeBytes || 0;
      } else if (this.sortColumn === 'date') {
        valA = new Date(a.date).getTime() || 0;
        valB = new Date(b.date).getTime() || 0;
      } else if (typeof valA === 'string') {
        return this.sortDirection === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }

      return this.sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    this.filteredAttachments = list;
    this.updateStats();
    this.renderAttachments();
  }

  updateStats() {
    const totalBytes = this.filteredAttachments.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
    const count = this.filteredAttachments.length;
    let largest = '0 B';

    if (count > 0) {
      const maxByteItem = [...this.filteredAttachments].sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
      largest = maxByteItem ? maxByteItem.sizeFormatted : '0 B';
    }

    if (this.statTotalSize) this.statTotalSize.innerText = PuduFormats.formatBytes(totalBytes);
    if (this.statTotalFiles) this.statTotalFiles.innerText = count.toLocaleString('es-ES');
    if (this.statLargestFile) this.statLargestFile.innerText = largest;
    if (this.statSelectedCount) this.statSelectedCount.innerText = this.selectedIds.size;
  }

  updateSortHeaders() {
    document.querySelectorAll('th[data-sort]').forEach(th => {
      const col = th.dataset.sort;
      th.classList.remove('sort-asc', 'sort-desc');
      if (col === this.sortColumn) {
        th.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });
  }

  renderAttachments() {
    if (!this.attachmentsContainer) return;

    if (this.filteredAttachments.length === 0) {
      this.attachmentsContainer.innerHTML = '';
      if (this.emptyState) this.emptyState.classList.remove('hidden');
      return;
    }

    if (this.emptyState) this.emptyState.classList.add('hidden');

    if (this.viewMode === 'grid') {
      this.renderGridView();
    } else {
      this.renderTableView();
    }
  }

  renderTableView() {
    let html = `
      <table class="pudu-table">
        <thead>
          <tr>
            <th width="40"><input type="checkbox" id="masterCheckbox" ${this.isAllSelected() ? 'checked' : ''}></th>
            <th data-sort="filename">Archivo</th>
            <th data-sort="sizeBytes" class="${this.sortColumn === 'sizeBytes' ? 'sort-' + this.sortDirection : ''}">Tamaño ⬍</th>
            <th data-sort="sender">De / Asunto</th>
            <th data-sort="date" class="${this.sortColumn === 'date' ? 'sort-' + this.sortDirection : ''}">Fecha</th>
            <th width="140" class="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
    `;

    this.filteredAttachments.forEach(item => {
      const isSelected = this.selectedIds.has(item.id);
      const cat = PuduFormats.getFileCategory(item.mimeType, item.filename);

      html += `
        <tr class="table-row ${isSelected ? 'row-selected' : ''}" data-id="${item.id}">
          <td>
            <input type="checkbox" class="row-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
          </td>
          <td>
            <div class="file-name-cell">
              <span class="file-icon" style="background: ${cat.color}20; color: ${cat.color};">${cat.icon}</span>
              <div class="file-text-box">
                <span class="file-name-title" title="${item.filename}">${item.filename}</span>
                <span class="file-badge" style="color: ${cat.color};">${cat.label}</span>
              </div>
            </div>
          </td>
          <td>
            <span class="size-pill ${item.sizeBytes > 25 * 1024 * 1024 ? 'size-heavy' : ''}">
              ${item.sizeFormatted || PuduFormats.formatBytes(item.sizeBytes)}
            </span>
          </td>
          <td>
            <div class="meta-cell">
              <span class="meta-sender">${item.sender || 'Remitente'}</span>
              <span class="meta-subject" title="${item.subject}">${item.subject || 'Sin asunto'}</span>
            </div>
          </td>
          <td>
            <span class="meta-date">${PuduFormats.formatDate(item.date)}</span>
          </td>
          <td class="text-right">
            <div class="action-buttons-group">
              <button class="btn-action btn-preview" data-id="${item.id}" title="Vista Previa">👁️</button>
              <button class="btn-action btn-download" data-id="${item.id}" title="Descargar">⬇️</button>
            </div>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    this.attachmentsContainer.innerHTML = html;
    this.bindTableEvents();
  }

  renderGridView() {
    let html = `<div class="pudu-grid">`;

    this.filteredAttachments.forEach(item => {
      const isSelected = this.selectedIds.has(item.id);
      const cat = PuduFormats.getFileCategory(item.mimeType, item.filename);

      html += `
        <div class="grid-card ${isSelected ? 'card-selected' : ''}" data-id="${item.id}">
          <div class="grid-card-header">
            <input type="checkbox" class="row-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
            <span class="size-pill ${item.sizeBytes > 25 * 1024 * 1024 ? 'size-heavy' : ''}">
              ${item.sizeFormatted || PuduFormats.formatBytes(item.sizeBytes)}
            </span>
          </div>
          <div class="grid-card-body btn-preview" data-id="${item.id}">
            <div class="grid-icon-large" style="background: ${cat.color}15; color: ${cat.color};">
              ${cat.icon}
            </div>
            <h4 class="grid-filename" title="${item.filename}">${item.filename}</h4>
            <p class="grid-sender">${item.sender}</p>
          </div>
          <div class="grid-card-footer">
            <span class="grid-date">${PuduFormats.formatDate(item.date)}</span>
            <button class="btn-action btn-download" data-id="${item.id}" title="Descargar">⬇️</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    this.attachmentsContainer.innerHTML = html;
    this.bindTableEvents();
  }

  bindTableEvents() {
    // Master checkbox
    const master = document.getElementById('masterCheckbox');
    if (master) {
      master.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.filteredAttachments.forEach(item => this.selectedIds.add(item.id));
        } else {
          this.selectedIds.clear();
        }
        this.applyFiltersAndRender();
      });
    }

    // Row checkboxes
    document.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        this.updateStats();
        this.highlightRow(id, e.target.checked);
      });
    });

    // Preview buttons
    document.querySelectorAll('.btn-preview').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = this.attachments.find(a => a.id === id);
        if (item) this.openPreviewModal(item);
      });
    });

    // Download buttons
    document.querySelectorAll('.btn-download').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = this.attachments.find(a => a.id === id);
        if (item) this.downloadSingle(item);
      });
    });
  }

  highlightRow(id, selected) {
    const row = document.querySelector(`[data-id="${id}"]`);
    if (row) {
      if (selected) row.classList.add('row-selected', 'card-selected');
      else row.classList.remove('row-selected', 'card-selected');
    }
  }

  isAllSelected() {
    if (this.filteredAttachments.length === 0) return false;
    return this.filteredAttachments.every(item => this.selectedIds.has(item.id));
  }

  toggleSelectAll() {
    if (this.isAllSelected()) {
      this.selectedIds.clear();
    } else {
      this.filteredAttachments.forEach(item => this.selectedIds.add(item.id));
    }
    this.applyFiltersAndRender();
  }

  setViewMode(mode) {
    this.viewMode = mode;
    if (this.btnViewTable) this.btnViewTable.classList.toggle('active', mode === 'table');
    if (this.btnViewGrid) this.btnViewGrid.classList.toggle('active', mode === 'grid');
    this.renderAttachments();
  }

  /**
   * MOVE TO DISK (Modern Native File System Access API)
   * Allows saving all selected attachments directly into a user-chosen folder on their PC!
   */
  async handleMoveToDisk() {
    const itemsToSave = this.selectedIds.size > 0
      ? this.attachments.filter(a => this.selectedIds.has(a.id))
      : this.filteredAttachments;

    if (itemsToSave.length === 0) {
      alert('No hay archivos seleccionados para mover al disco.');
      return;
    }

    // Check File System Access API support
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        this.showLoading(true, `Guardando ${itemsToSave.length} archivos en tu carpeta...`);

        let savedCount = 0;
        for (const item of itemsToSave) {
          try {
            const fileHandle = await dirHandle.getFileHandle(item.filename, { create: true });
            const writable = await fileHandle.createWritable();

            if (item.blob) {
              await writable.write(item.blob);
            } else {
              // Fetch or fallback simulated content
              const response = await fetch(item.downloadUrl || 'assets/pudu_mascot.jpg');
              const blob = await response.blob();
              await writable.write(blob);
            }

            await writable.close();
            savedCount++;
            if (this.progressBar) {
              this.progressBar.style.width = `${Math.round((savedCount / itemsToSave.length) * 100)}%`;
            }
          } catch (err) {
            console.warn('Error guardando archivo:', item.filename, err);
          }
        }

        this.showLoading(false);
        alert(`🎉 ¡Éxito! Se guardaron ${savedCount} archivos directamente en tu disco.`);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Error con DirectoryPicker:', err);
          this.handleDownloadZip();
        }
        this.showLoading(false);
      }
    } else {
      // Fallback for browsers without showDirectoryPicker: ZIP Download
      this.handleDownloadZip();
    }
  }

  /**
   * ZIP Download Fallback using JSZip
   */
  async handleDownloadZip() {
    const itemsToSave = this.selectedIds.size > 0
      ? this.attachments.filter(a => this.selectedIds.has(a.id))
      : this.filteredAttachments;

    if (itemsToSave.length === 0) {
      alert('No hay archivos seleccionados.');
      return;
    }

    if (typeof JSZip === 'undefined') {
      alert('Librería JSZip cargando, por favor intenta de nuevo.');
      return;
    }

    this.showLoading(true, 'Generando archivo ZIP comprimido...');
    const zip = new JSZip();

    for (const item of itemsToSave) {
      if (item.blob) {
        zip.file(item.filename, item.blob);
      } else {
        try {
          const resp = await fetch(item.downloadUrl || 'assets/pudu_mascot.jpg');
          const blob = await resp.blob();
          zip.file(item.filename, blob);
        } catch (e) {
          zip.file(item.filename + '.txt', `Contenido del adjunto: ${item.filename} de ${item.sender}`);
        }
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PuduMail_Adjuntos_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    this.showLoading(false);
  }

  downloadSingle(item) {
    if (item.downloadUrl && item.downloadUrl !== '#') {
      window.PuduBridge.downloadFile(item.downloadUrl, item.filename);
    } else {
      // Download blob
      const blob = item.blob || new Blob([`Contenido de ${item.filename}`], { type: item.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  openPreviewModal(item) {
    if (!this.previewModal) return;
    this.previewTitle.innerText = item.filename;
    this.previewSize.innerText = item.sizeFormatted;

    const cat = PuduFormats.getFileCategory(item.mimeType, item.filename).category;
    let previewHtml = '';

    if (cat === 'image') {
      previewHtml = `<img src="${item.downloadUrl || 'assets/pudu_mascot.jpg'}" alt="${item.filename}" class="preview-media-img">`;
    } else if (cat === 'pdf') {
      previewHtml = `
        <div class="pdf-preview-box">
          <p style="margin-bottom: 12px;">📄 Documento PDF listo para visualizar o descargar.</p>
          <iframe src="${item.downloadUrl || ''}" class="preview-iframe"></iframe>
        </div>
      `;
    } else if (cat === 'video') {
      previewHtml = `
        <video controls class="preview-media-video">
          <source src="${item.downloadUrl || ''}" type="${item.mimeType}">
          Tu navegador no soporta video.
        </video>
      `;
    } else {
      previewHtml = `
        <div class="generic-preview-box">
          <span style="font-size: 48px;">${PuduFormats.getFileCategory(item.mimeType, item.filename).icon}</span>
          <h3>${item.filename}</h3>
          <p><strong>De:</strong> ${item.sender}</p>
          <p><strong>Asunto:</strong> ${item.subject}</p>
          <p><strong>Tamaño:</strong> ${item.sizeFormatted}</p>
          <button class="btn-main" onclick="window.app.downloadSingle(window.app.attachments.find(a=>a.id==='${item.id}'))" style="margin-top: 16px;">
            ⬇️ Descargar Archivo
          </button>
        </div>
      `;
    }

    this.previewContent.innerHTML = previewHtml;
    this.previewModal.classList.remove('hidden');
  }

  closePreviewModal() {
    if (this.previewModal) this.previewModal.classList.add('hidden');
  }

  showLoading(show, text = 'Cargando...') {
    if (!this.loadingOverlay) return;
    if (show) {
      if (this.progressText) this.progressText.innerText = text;
      this.loadingOverlay.classList.remove('hidden');
    } else {
      this.loadingOverlay.classList.add('hidden');
    }
  }

  saveCachedData() {
    try {
      // Save metadata without blobs to localStorage
      const meta = this.attachments.map(a => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        sizeFormatted: a.sizeFormatted,
        sender: a.sender,
        subject: a.subject,
        date: a.date,
        downloadUrl: a.downloadUrl && !a.downloadUrl.startsWith('blob:') ? a.downloadUrl : '#'
      }));
      localStorage.setItem('pudumail2_cached_attachments', JSON.stringify(meta));
    } catch (e) {}
  }

  loadCachedData() {
    try {
      const stored = localStorage.getItem('pudumail2_cached_attachments');
      if (stored) {
        this.attachments = JSON.parse(stored);
        this.applyFiltersAndRender();
      } else {
        this.loadSampleData();
      }
    } catch (e) {
      this.loadSampleData();
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new PuduApp();
});
