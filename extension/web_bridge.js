/**
 * PUDÚ MAIL 2 - WEB BRIDGE
 * Injected automatically into pudumail2.vercel.app to enable instant, zero-config communication.
 */

console.log('%c[Pudú Web Bridge] 🚀 Content Script inyectado con éxito en:', 'color: #10b981; font-weight: bold;', window.location.href);

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
    version: '2.0.0'
  }, '*');

  window.dispatchEvent(new CustomEvent('pudu:extension-ready', {
    detail: { installed: true, version: '2.0.0' }
  }));
}

announceReady();
document.addEventListener('DOMContentLoaded', announceReady);
setTimeout(announceReady, 500);

// 3. Relay messages between Web App and Background Worker
window.addEventListener('message', (event) => {
  if (!event.data || event.data.source !== 'pudu-web') return;

  const { action, query } = event.data;
  console.log('%c[Pudú Web Bridge] 📥 Mensaje recibido desde la página web:', 'color: #f59e0b; font-weight: bold;', event.data);

  if (action === 'PING') {
    announceReady();
    return;
  }

  // Forward request to background service worker
  console.log('%c[Pudú Web Bridge] 🔄 Reenviando al Background Service Worker:', 'color: #a855f7;', action);
  
  chrome.runtime.sendMessage(event.data, (response) => {
    const error = chrome.runtime.lastError;
    console.log('%c[Pudú Web Bridge] 📤 Respuesta del Background recibida:', 'color: #10b981;', response, 'Error:', error);

    window.postMessage({
      source: 'pudu-extension',
      action: action + '_RESPONSE',
      success: !error && (response?.success ?? true),
      ...(response || {}),
      error: error ? error.message : response?.error
    }, '*');
  });
});
