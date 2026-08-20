/**
 * PUDÚ MAIL 2 - WEB BRIDGE
 * Injected automatically into pudumail2.vercel.app to enable instant, zero-config communication.
 */

console.log('%c[Pudú Web Bridge] 🚀 Content Script inyectado con éxito en:', 'color: #10b981; font-weight: bold;', window.location.href);

function isAllowedOrigin(origin) {
  return origin === 'https://pudumail2.vercel.app' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// 1. Set global marker attribute on DOM
document.documentElement.setAttribute('data-pudu-connector', 'ready');
window.__PUDU_CONNECTOR_INSTALLED__ = true;

// 2. Announce presence to the web page
function announceReady() {
  console.log('%c[Pudú Web Bridge] 📡 Anunciando presencia de la extensión a la página web...', 'color: #38bdf8;');
  window.postMessage({
    source: 'pudu-extension',
    action: 'PONG',
    installed: true,
    version: '2.5.0'
  }, window.location.origin);

  window.dispatchEvent(new CustomEvent('pudu:extension-ready', {
    detail: { installed: true, version: '2.5.0' }
  }));
}

announceReady();
document.addEventListener('DOMContentLoaded', announceReady);
setTimeout(announceReady, 500);

// 3. Relay messages between Web App and Background Worker
window.addEventListener('message', (event) => {
  if (event.source !== window || !isAllowedOrigin(event.origin) || !event.data || event.data.source !== 'pudu-web') return;

  const { action } = event.data;
  console.log('%c[Pudú Web Bridge] 📥 Mensaje recibido desde la página web:', 'color: #f59e0b; font-weight: bold;', event.data);

  if (action === 'PING') {
    announceReady();
    return;
  }

  relayToBackground(event.data, event.origin);
});

function relayToBackground(request, origin, attempt = 0) {
  chrome.runtime.sendMessage(request, response => {
    const error = chrome.runtime.lastError;
    if (error && attempt < 8) {
      setTimeout(() => relayToBackground(request, origin, attempt + 1), Math.min(4000, 250 * 2 ** attempt));
      return;
    }
    window.postMessage({
      source: 'pudu-extension',
      action: request.action + '_RESPONSE',
      success: !error && (response?.success ?? true),
      ...(response || {}),
      error: error ? error.message : response?.error
    }, origin);
  });
}

// 4. Listen for push events from Background Worker (e.g., PROGRESS)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === 'SCAN_PROGRESS') {
    window.postMessage({
      source: 'pudu-extension',
      action: 'SCAN_PROGRESS',
      ...request
    }, window.location.origin);
  }
});
