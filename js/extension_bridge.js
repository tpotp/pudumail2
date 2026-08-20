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
      if (event.source === window && event.origin === window.location.origin && event.data && event.data.source === 'pudu-extension') {
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
    window.postMessage({ source: 'pudu-web', action: 'PING' }, window.location.origin);
  }

  async detectExtension() {
    this.checkDomMarker();
    this.ping();
    return this.isInstalled;
  }

  async waitForExtension() {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (this.isInstalled) return true;
      this.ping();
      await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
    }
    return this.isInstalled;
  }

  /**
   * Request Gmail attachments scan from extension
   */
  async scanGmail(query = 'has:attachment') {
    console.log('%c[Pudú Bridge Web] 🔍 Solicitando escaneo de adjuntos...', 'color: #f59e0b; font-weight: bold;', query);
    this.checkDomMarker();

    if (!await this.waitForExtension()) {
      return { success: false, needsExtension: true, error: 'Conector no detectado.' };
    }

    return new Promise((resolve) => {
      let attempt = 0;

      const sendScan = (continueScan = false) => {
        window.postMessage({ source: 'pudu-web', action: 'SCAN_GMAIL_ATTACHMENTS', query, continue: continueScan }, window.location.origin);
      };

      const responseHandler = (event) => {
        if (event.source !== window || event.origin !== window.location.origin || !event.data || event.data.source !== 'pudu-extension') return;

        if (event.data.action === 'SCAN_PROGRESS') {
          console.log('%c[Pudú Bridge Web] 📊 Progreso del escaneo:', 'color: #38bdf8;', event.data.message);
          window.dispatchEvent(new CustomEvent('pudu:scan-progress', { 
            detail: { message: event.data.message, count: event.data.count, page: event.data.page } 
          }));
          return;
        }

        if (event.data.action === 'SCAN_GMAIL_ATTACHMENTS_RESPONSE') {
          console.log('%c[Pudú Bridge Web] 🎉 Respuesta de escaneo recibida:', 'color: #10b981; font-weight: bold;', event.data);
            if (event.data.success && event.data.done && event.data.attachments) {
              window.removeEventListener('message', responseHandler);
              resolve({ success: true, attachments: event.data.attachments, count: event.data.attachments.length });
            } else if (event.data.success && event.data.done) {
              window.removeEventListener('message', responseHandler);
              resolve({ success: true, attachments: [], count: 0 });
            } else if (event.data.success) {
              setTimeout(() => sendScan(true), 50);
            } else if (attempt < 3) {
            attempt++;
            window.dispatchEvent(new CustomEvent('pudu:scan-progress', {
              detail: { message: 'Reconectando el escaneo…', count: 0, page: 0 }
            }));
            setTimeout(() => sendScan(true), Math.min(8000, 1000 * 2 ** attempt));
          } else {
            window.removeEventListener('message', responseHandler);
            resolve({ success: false, error: event.data.error || 'Error al escanear' });
          }
        }
      };

      window.addEventListener('message', responseHandler);

      // Send request to extension bridge
      sendScan();

    });
  }

  /**
   * Download single file
   */
  request(action, payload = {}) {
    return new Promise(resolve => {
      const responseAction = `${action}_RESPONSE`;
      const handler = event => {
        if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'pudu-extension' || event.data.action !== responseAction) return;
        window.removeEventListener('message', handler);
        resolve(event.data);
      };
      window.addEventListener('message', handler);
      window.postMessage({ source: 'pudu-web', action, ...payload }, window.location.origin);
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ success: false, error: 'El conector no respondió.' });
      }, 120000);
    });
  }

  async resolveAttachment(item) {
    const response = await this.request('RESOLVE_ATTACHMENT', { item });
    return response.success ? response.attachment : Promise.reject(new Error(response.error || 'No se pudo preparar el adjunto.'));
  }

  async downloadAttachment(item) {
    const response = await this.request('DOWNLOAD_ATTACHMENT', { item });
    if (!response.success) throw new Error(response.error || 'No se pudo descargar el adjunto.');
    return response;
  }

  async downloadAttachments(items) {
    const response = await this.request('BATCH_DOWNLOAD', { items });
    if (!response.success) throw new Error(response.error || 'No se pudieron descargar los adjuntos.');
    return response;
  }
}

window.PuduBridge = new ExtensionBridge();
