/**
 * PUDÚ MAIL 2 - EXTENSION BRIDGE
 * Provides communication between pudumail2.vercel.app and Pudú Mail Chrome Extension.
 */

class ExtensionBridge {
  constructor() {
    this.isInstalled = false;
    this.extensionId = null;
    this.knownExtensionIds = [
      // Known development and production Extension IDs can be added here
      'pudumail-connector-id'
    ];
    this.init();
  }

  async init() {
    await this.detectExtension();
    window.addEventListener('message', (event) => {
      if (event.data && event.data.source === 'pudu-extension') {
        this.isInstalled = true;
        window.dispatchEvent(new CustomEvent('pudu:extension-status', { detail: { installed: true } }));
      }
    });
  }

  /**
   * Probe for the extension
   */
  async detectExtension() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      // Check via chrome.runtime if available
      try {
        // Broadcast ping to window
        window.postMessage({ source: 'pudu-web', action: 'PING' }, '*');
      } catch (e) {
        console.warn('Ping error:', e);
      }
    }

    // Check if injected marker exists
    if (window.__PUDU_CONNECTOR_INSTALLED__ || document.getElementById('pudu-connector-active')) {
      this.isInstalled = true;
    }

    return this.isInstalled;
  }

  /**
   * Request Gmail attachments scan from extension
   */
  async scanGmail(query = 'has:attachment') {
    return new Promise((resolve) => {
      // 1. Try sending directly to extension if available
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage && this.extensionId) {
        chrome.runtime.sendMessage(this.extensionId, { action: 'SCAN_GMAIL_ATTACHMENTS', query }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            resolve({ success: false, error: chrome.runtime.lastError?.message || 'Error de conexión' });
          } else {
            resolve({ success: true, attachments: response.attachments });
          }
        });
        return;
      }

      // 2. Window postMessage channel
      const responseHandler = (event) => {
        if (event.data && event.data.source === 'pudu-extension' && event.data.action === 'SCAN_RESULTS') {
          window.removeEventListener('message', responseHandler);
          resolve({ success: true, attachments: event.data.attachments });
        }
      };

      window.addEventListener('message', responseHandler);
      window.postMessage({ source: 'pudu-web', action: 'SCAN_GMAIL_ATTACHMENTS', query }, '*');

      // Timeout fallback with demo scan if extension is not responding
      setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        if (!this.isInstalled) {
          resolve({
            success: false,
            needsExtension: true,
            error: 'El conector no está instalado. Por favor instala el conector en 1 clic.'
          });
        }
      }, 2500);
    });
  }

  /**
   * Request download of single attachment
   */
  async downloadFile(url, filename) {
    if (this.isInstalled && this.extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(this.extensionId, { action: 'DOWNLOAD_ATTACHMENT', url, filename });
      return true;
    }
    // Fallback: standard browser download trigger
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  }
}

window.PuduBridge = new ExtensionBridge();
