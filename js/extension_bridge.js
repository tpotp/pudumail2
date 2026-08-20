/**
 * PUDÚ MAIL 2 - EXTENSION BRIDGE (WEB CLIENT)
 * Handles automatic handshake and data exchange between pudumail2.vercel.app and the Chrome Extension.
 */

class ExtensionBridge {
  constructor() {
    this.isInstalled = false;
    this.listeners = [];
    this.init();
  }

  init() {
    // 1. Check DOM marker injected by content script
    this.checkDomMarker();

    // 2. Listen to custom event dispatched by extension content script
    window.addEventListener('pudu:extension-ready', (e) => {
      console.log('[Pudú Web] Evento pudu:extension-ready recibido:', e.detail);
      this.setInstalled(true);
    });

    // 3. Listen to postMessage PONG
    window.addEventListener('message', (event) => {
      if (event.data && event.data.source === 'pudu-extension') {
        if (event.data.action === 'PONG' || event.data.installed) {
          this.setInstalled(true);
        }
      }
    });

    // 4. Send discovery PINGs
    this.ping();
    setTimeout(() => this.ping(), 300);
    setTimeout(() => this.ping(), 1000);
  }

  checkDomMarker() {
    if (document.documentElement.getAttribute('data-pudu-connector') === 'ready' || window.__PUDU_CONNECTOR_INSTALLED__) {
      this.setInstalled(true);
    }
  }

  setInstalled(status) {
    this.isInstalled = status;
    if (window.app && typeof window.app.updateExtensionBadge === 'function') {
      window.app.updateExtensionBadge(status);
    }
    window.dispatchEvent(new CustomEvent('pudu:extension-status', { detail: { installed: status } }));
  }

  ping() {
    this.checkDomMarker();
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
    this.checkDomMarker();

    return new Promise((resolve) => {
      const responseHandler = (event) => {
        if (event.data && event.data.source === 'pudu-extension' && event.data.action === 'SCAN_GMAIL_ATTACHMENTS_RESPONSE') {
          window.removeEventListener('message', responseHandler);
          if (event.data.success && event.data.attachments) {
            resolve({ success: true, attachments: event.data.attachments });
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

      // Timeout fallback if extension is not installed
      setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        if (!this.isInstalled && document.documentElement.getAttribute('data-pudu-connector') !== 'ready') {
          resolve({
            success: false,
            needsExtension: true,
            error: 'Conector no detectado'
          });
        }
      }, 1500);
    });
  }

  /**
   * Download single file
   */
  async downloadFile(url, filename) {
    window.postMessage({
      source: 'pudu-web',
      action: 'DOWNLOAD_ATTACHMENT',
      url: url,
      filename: filename
    }, '*');

    // Also trigger standard browser anchor download as fallback
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
