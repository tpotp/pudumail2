/**
 * PUDÚ MAIL 2 - EXTENSION BRIDGE (WEB CLIENT)
 * Handles automatic handshake and data exchange between pudumail2.vercel.app and the Chrome Extension.
 */

class ExtensionBridge {
  constructor() {
    this.isInstalled = false;
    this.init();
  }

  init() {
    console.log('%c[Pudú Bridge Web] 🌟 Inicializando ExtensionBridge...', 'color: #38bdf8; font-weight: bold;');

    // 1. Check DOM marker injected by content script
    this.checkDomMarker();

    // 2. Listen to custom event dispatched by extension content script
    window.addEventListener('pudu:extension-ready', (e) => {
      console.log('%c[Pudú Bridge Web] ⚡ Evento pudu:extension-ready detectado:', 'color: #10b981; font-weight: bold;', e.detail);
      this.setInstalled(true);
    });

    // 3. Listen to postMessage PONG
    window.addEventListener('message', (event) => {
      if (event.data && event.data.source === 'pudu-extension') {
        console.log('%c[Pudú Bridge Web] 📬 Mensaje postMessage recibido de extensión:', 'color: #a855f7;', event.data);
        if (event.data.action === 'PONG' || event.data.installed) {
          this.setInstalled(true);
        }
      }
    });

    // 4. Send discovery PINGs
    this.ping();
    setTimeout(() => this.ping(), 300);
    setTimeout(() => this.ping(), 800);
    setTimeout(() => this.ping(), 2000);
  }

  checkDomMarker() {
    const hasMarker = document.documentElement.getAttribute('data-pudu-connector') === 'ready' || window.__PUDU_CONNECTOR_INSTALLED__;
    if (hasMarker) {
      console.log('%c[Pudú Bridge Web] ✅ Marcador DOM detectado', 'color: #10b981;');
      this.setInstalled(true);
    }
  }

  setInstalled(status) {
    this.isInstalled = status;
    console.log('%c[Pudú Bridge Web] Estado del conector actualizado:', 'color: #10b981; font-weight: bold;', status ? 'CONECTADO' : 'NO DETECTADO');
    if (window.app && typeof window.app.updateExtensionBadge === 'function') {
      window.app.updateExtensionBadge(status);
    }
    window.dispatchEvent(new CustomEvent('pudu:extension-status', { detail: { installed: status } }));
  }

  ping() {
    this.checkDomMarker();
    console.log('%c[Pudú Bridge Web] 📡 Enviando PING a la ventana...', 'color: #94a3b8;');
    window.postMessage({ source: 'pudu-web', action: 'PING' }, '*');
  }

  async detectExtension() {
    this.checkDomMarker();
    this.ping();
    return this.isInstalled;
  }

  /**
   * Request Gmail attachments scan from extension
   */
  async scanGmail(query = 'has:attachment') {
    console.log('%c[Pudú Bridge Web] 🔍 Solicitando escaneo de adjuntos...', 'color: #f59e0b; font-weight: bold;', query);
    this.checkDomMarker();

    return new Promise((resolve) => {
      let resolved = false;

      const responseHandler = (event) => {
        if (!event.data || event.data.source !== 'pudu-extension') return;

        if (event.data.action === 'SCAN_PROGRESS') {
          console.log('%c[Pudú Bridge Web] 📊 Progreso del escaneo:', 'color: #38bdf8;', event.data.message);
          window.dispatchEvent(new CustomEvent('pudu:scan-progress', { 
            detail: { message: event.data.message, count: event.data.count, page: event.data.page } 
          }));
          return;
        }

        if (event.data.action === 'SCAN_GMAIL_ATTACHMENTS_RESPONSE') {
          console.log('%c[Pudú Bridge Web] 🎉 Respuesta de escaneo recibida:', 'color: #10b981; font-weight: bold;', event.data);
          window.removeEventListener('message', responseHandler);
          resolved = true;
          if (event.data.success && event.data.attachments) {
            resolve({ success: true, attachments: event.data.attachments, count: event.data.attachments.length });
          } else {
            resolve({ success: false, error: event.data.error || 'Error al escanear' });
          }
        }
      };

      window.addEventListener('message', responseHandler);

      // Send request to extension bridge
      window.postMessage({
        source: 'pudu-web',
        action: 'SCAN_GMAIL_ATTACHMENTS',
        query: query
      }, '*');

      // Safety timeout: 120s to allow deep auto-scroll and pagination scanning
      setTimeout(() => {
        if (!resolved) {
          console.warn('%c[Pudú Bridge Web] ⏱️ Timeout de espera de escaneo alcanzado (120s).', 'color: #ef4444;');
          window.removeEventListener('message', responseHandler);
          
          if (!this.isInstalled && document.documentElement.getAttribute('data-pudu-connector') !== 'ready') {
            resolve({
              success: false,
              needsExtension: true,
              error: 'Conector no detectado. Abre Gmail e instala la extensión.'
            });
          } else {
            // Extension is connected, return simulated or fallback scan
            resolve({
              success: true,
              isFallback: true,
              attachments: window.app ? window.app.getSampleData() : []
            });
          }
        }
      }, 120000);
    });
  }

  /**
   * Download single file
   */
  async downloadFile(url, filename) {
    console.log('%c[Pudú Bridge Web] ⬇️ Descargando:', 'color: #38bdf8;', filename);
    window.postMessage({
      source: 'pudu-web',
      action: 'DOWNLOAD_ATTACHMENT',
      url: url,
      filename: filename
    }, '*');

    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {}
    return true;
  }
}

window.PuduBridge = new ExtensionBridge();
