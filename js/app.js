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
    this.trashAfterSave = document.getElementById('trashAfterSave');
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
    this.showLoading(true, '🔍 Iniciando escaneo completo de Gmail…', 0);

    // Listen for live progress events from extension
    const progressHandler = (e) => {
      const { message, count, page } = e.detail || {};
      const pct = Math.min(95, (page || 1) * 5); // rough estimate, max 95% until done
      this.showLoading(true, `${message || '⏳ Escaneando…'} (${count || 0} archivos)`, pct);
      console.log(`%c[Pudú App] 📊 Progreso: ${message} — ${count} archivos, página ${page}`, 'color:#38bdf8;');
    };
    window.addEventListener('pudu:scan-progress', progressHandler);

    try {
      // Safety check: ensure PuduBridge is loaded
      if (!window.PuduBridge || typeof window.PuduBridge.scanGmail !== 'function') {
        console.error('[Pudú App] ❌ PuduBridge no disponible. ¿extension_bridge.js cargó correctamente?');
        this.openExtensionModal();
        return;
      }

      const result = await window.PuduBridge.scanGmail('has:attachment');
      console.log('%c[Pudú App] Resultado del escaneo:', 'color: #10b981;', result);

      if (result.success && result.attachments && result.attachments.length > 0) {
        this.attachments = result.attachments;
        this.showLoading(true, `✅ ${result.attachments.length} archivos encontrados. Procesando…`, 100);
        await new Promise(r => setTimeout(r, 600));
        this.saveCachedData();
        this.applyFiltersAndRender();
      } else if (result.needsExtension) {
        this.openExtensionModal();
      } else {
        console.log('%c[Pudú App] ℹ️ Escaneo finalizado sin resultados adicionales', 'color: #f59e0b;');
        if (result.error) alert(result.error);
        this.applyFiltersAndRender();
      }
    } catch (err) {
      console.error('[Pudú App] Error en handleScanGmail:', err);
      alert('No se pudo explorar Gmail. Confirma que el conector está activo y Gmail está abierto.');
    } finally {
      window.removeEventListener('pudu:scan-progress', progressHandler);
      this.showLoading(false);
    }
  }

  openExtensionModal() {
    if (this.extensionModal) this.extensionModal.classList.remove('hidden');
  }

  closeExtensionModal() {
    if (this.extensionModal) this.extensionModal.classList.add('hidden');
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
              ${item.thumbnailUrl ? 
                `<img src="${item.thumbnailUrl}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;margin-right:12px;" alt="${item.filename}">` :
                `<span class="file-icon" style="background: ${cat.color}20; color: ${cat.color};">${cat.icon}</span>`
              }
              <div class="file-text-box">
                <span class="file-name-title" title="${item.filename}">${item.filename}</span>
                <span class="file-badge" style="color: ${cat.color};">${cat.label}</span>
              </div>
            </div>
          </td>
          <td>
            <span class="size-pill ${item.sizeBytes > 25 * 1024 * 1024 ? 'size-heavy' : ''} ${item.sizeEstimated ? 'size-estimated' : ''}">
              ${item.sizeBytes > 0 ? (item.sizeEstimated ? '~' : '') + PuduFormats.formatBytes(item.sizeBytes) : '—'}
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
            <span class="size-pill ${item.sizeBytes > 25 * 1024 * 1024 ? 'size-heavy' : ''} ${item.sizeEstimated ? 'size-estimated' : ''}">
              ${item.sizeBytes > 0 ? (item.sizeEstimated ? '~' : '') + PuduFormats.formatBytes(item.sizeBytes) : '—'}
            </span>
          </div>
          <div class="grid-card-body btn-preview" data-id="${item.id}">
            ${item.thumbnailUrl ? 
              `<div style="width:100%;height:120px;background-image:url('${item.thumbnailUrl}');background-size:cover;background-position:center;border-radius:8px;margin-bottom:12px;"></div>` :
              `<div class="grid-icon-large" style="background: ${cat.color}15; color: ${cat.color};">${cat.icon}</div>`
            }
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

    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await window.showDirectoryPicker();
        this.showLoading(true, `Guardando ${itemsToSave.length} archivos en tu carpeta...`);

        let savedCount = 0;
        const savedItems = [];
        for (const item of itemsToSave) {
          try {
            const attachment = await window.PuduBridge.resolveAttachment(item);
            Object.assign(item, attachment);
            const response = await fetch(attachment.downloadUrl, { credentials: 'omit' });
            if (!response.ok) throw new Error(`Gmail devolvió ${response.status}`);
            const fileHandle = await dirHandle.getFileHandle(this.safeFilename(item.filename), { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(await response.blob());
            await writable.close();
            savedCount++;
            savedItems.push(item);
            if (this.progressBar) {
              this.progressBar.style.width = `${Math.round((savedCount / itemsToSave.length) * 100)}%`;
            }
          } catch (err) {
            console.warn('Error guardando archivo:', item.filename, err);
          }
        }

        if (savedItems.length) await this.maybeTrashSavedConversations(savedItems);
        this.showLoading(false);
        alert(savedCount ? `🎉 Se guardaron ${savedCount} archivos reales en tu carpeta.` : 'Gmail no permitió guardar los archivos seleccionados.');
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Error con DirectoryPicker:', err);
          await this.downloadWithExtension(itemsToSave);
        }
        this.showLoading(false);
      }
    } else {
      await this.downloadWithExtension(itemsToSave);
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

    this.showLoading(true, 'Preparando adjuntos reales para ZIP...');
    const zip = new JSZip();

    try {
      for (const item of itemsToSave) {
        const attachment = await window.PuduBridge.resolveAttachment(item);
        Object.assign(item, attachment);
        const resp = await fetch(attachment.downloadUrl, { credentials: 'omit' });
        if (!resp.ok) throw new Error(`Gmail devolvió ${resp.status}`);
        zip.file(this.safeFilename(item.filename), await resp.blob());
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PuduMail_Adjuntos_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo crear el ZIP:', error);
      await this.downloadWithExtension(itemsToSave);
    } finally {
      this.showLoading(false);
    }
  }

  async downloadWithExtension(items) {
    this.showLoading(true, 'Guardando adjuntos reales en Descargas/PuduMail_Adjuntos...');
    try {
      const result = await window.PuduBridge.downloadAttachments(items);
      if (result.attachments?.length) await this.maybeTrashSavedConversations(result.attachments);
      alert(result.downloaded ? `Se enviaron ${result.downloaded} archivos reales a Descargas/PuduMail_Adjuntos.` : 'No se pudo descargar ningún archivo.');
    } catch (error) {
      alert(error.message || 'No se pudieron descargar los adjuntos.');
    } finally {
      this.showLoading(false);
    }
  }

  async downloadSingle(item) {
    await this.downloadWithExtension([item]);
  }

  async maybeTrashSavedConversations(items) {
    if (!this.trashAfterSave?.checked || !items.length) return;
    const conversations = new Set(items.map(item => item.threadUrl || item.threadId).filter(Boolean)).size;
    if (!conversations || !confirm(`Los adjuntos ya se guardaron. ¿Enviar ${conversations} conversación(es) a la Papelera de Gmail?`)) return;
    try {
      const response = await window.PuduBridge.request('TRASH_CONVERSATIONS', { items });
      if (!response.success) throw new Error(response.error || 'No se pudieron enviar las conversaciones a la Papelera.');
      if (response.errors?.length) console.warn('Papelera parcial:', response.errors);
    } catch (error) {
      alert(`Los archivos ya se guardaron, pero Gmail no movió los correos a la Papelera: ${error.message}`);
    }
  }

  async openPreviewModal(item) {
    if (!this.previewModal) return;
    if (!item.downloadUrl || item.downloadUrl === '#') {
      this.showLoading(true, `Preparando ${item.filename}...`);
      try { Object.assign(item, await window.PuduBridge.resolveAttachment(item)); }
      catch (error) { alert(error.message || 'No se pudo preparar la vista previa.'); return; }
      finally { this.showLoading(false); }
    }
    this.previewTitle.innerText = item.filename;
    this.previewSize.innerText = item.sizeBytes > 0 ? PuduFormats.formatBytes(item.sizeBytes) : '—';

    const cat = PuduFormats.getFileCategory(item.mimeType, item.filename);
    const hasRealUrl = item.downloadUrl && item.downloadUrl !== '#' && item.downloadUrl.startsWith('http');
    let previewHtml = '';

    if (cat.category === 'image' && hasRealUrl) {
      previewHtml = `
        <div class="preview-media-container">
          <img src="${item.downloadUrl}" alt="${item.filename}" class="preview-media-img"
               onerror="this.parentElement.innerHTML='<div class=\'generic-preview-box\'><span style=\'font-size:64px\'>🖼️</span><p>No se pudo cargar la imagen. Descárgala para verla.</p></div>'">
        </div>`;
    } else if (cat.category === 'image') {
      previewHtml = `
        <div class="generic-preview-box">
          <span style="font-size: 64px;">🖼️</span>
          <h3>${item.filename}</h3>
          <p>Para previsualizar imágenes, abre el correo en Gmail primero.</p>
          <p class="preview-tip">💡 Haz clic en el adjunto dentro de Gmail para verlo directamente.</p>
        </div>`;
    } else if (cat.category === 'pdf' && hasRealUrl) {
      previewHtml = `
        <div class="pdf-preview-box">
          <p style="margin-bottom: 12px;">📄 Documento PDF</p>
          <iframe src="${item.downloadUrl}" class="preview-iframe"></iframe>
        </div>`;
    } else if (cat.category === 'video' && hasRealUrl) {
      previewHtml = `
        <div class="preview-media-container">
          <video controls class="preview-media-video">
            <source src="${item.downloadUrl}" type="${item.mimeType}">
            Tu navegador no soporta video.
          </video>
        </div>`;
    } else {
      // Generic preview with file details
      previewHtml = `
        <div class="generic-preview-box">
          <span style="font-size: 64px;">${cat.icon}</span>
          <h3>${item.filename}</h3>
          <div class="preview-details">
            <div class="preview-detail-row"><strong>Tipo:</strong> <span style="color: ${cat.color}">${cat.label}</span></div>
            <div class="preview-detail-row"><strong>Tamaño:</strong> ${item.sizeBytes > 0 ? PuduFormats.formatBytes(item.sizeBytes) + (item.sizeEstimated ? ' (estimado)' : '') : 'Desconocido'}</div>
            <div class="preview-detail-row"><strong>De:</strong> ${item.sender}</div>
            <div class="preview-detail-row"><strong>Asunto:</strong> ${item.subject}</div>
            <div class="preview-detail-row"><strong>Fecha:</strong> ${PuduFormats.formatDate(item.date)}</div>
          </div>
          ${hasRealUrl ? `<a href="${item.downloadUrl}" download="${item.filename}" class="btn-main" style="margin-top:16px;display:inline-block;text-decoration:none;">⬇️ Descargar Archivo</a>` : '<p class="preview-tip">💡 Para descargar, abre el correo en Gmail y haz clic en el adjunto.</p>'}
        </div>`;
    }

    this.previewContent.innerHTML = previewHtml;
    this.previewModal.classList.remove('hidden');
  }

  closePreviewModal() {
    if (this.previewModal) this.previewModal.classList.add('hidden');
  }

  safeFilename(name) {
    return String(name || 'adjunto').replace(/[\\/:*?"<>|]/g, '_');
  }

  showLoading(show, text = 'Cargando...', pct = null) {
    if (!this.loadingOverlay) return;
    if (show) {
      if (this.progressText) this.progressText.innerText = text;
      if (this.progressBar && pct !== null) {
        this.progressBar.style.width = pct + '%';
      }
      this.loadingOverlay.classList.remove('hidden');
    } else {
      this.loadingOverlay.classList.add('hidden');
      if (this.progressBar) this.progressBar.style.width = '0%';
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
        threadId: a.threadId,
        threadUrl: a.threadUrl,
        // Gmail links expire quickly; retain only local metadata and resolve again on demand.
        downloadUrl: '#'
      }));
      localStorage.setItem('pudumail2_cached_attachments', JSON.stringify(meta));
    } catch (e) {}
  }

  loadCachedData() {
    try {
      const stored = localStorage.getItem('pudumail2_cached_attachments');
      if (stored) {
        const parsed = JSON.parse(stored).filter(item => !String(item.id || '').startsWith('sample_'));
        if (parsed.length > 0) {
          this.attachments = parsed;
          this.applyFiltersAndRender();
        } else {
          localStorage.removeItem('pudumail2_cached_attachments');
        }
      }
    } catch (e) {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new PuduApp();
});
