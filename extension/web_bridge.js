/**
 * PUDÚ MAIL 2 - WEB BRIDGE
 * Injected automatically into pudumail2.vercel.app to enable instant, zero-config communication.
 */

console.log('[Pudú Mail 2 Extension] Web Bridge Activo');

// 1. Set global marker attribute on DOM
document.documentElement.setAttribute('data-pudu-connector', 'ready');

// 2. Announce presence to the web page
function announceReady() {
  window.postMessage({
    source: 'pudu-extension',
    action: 'PONG',
    installed: true,
    version: '1.0.0'
  }, '*');

  window.dispatchEvent(new CustomEvent('pudu:extension-ready', {
    detail: { installed: true, version: '1.0.0' }
  }));
}

announceReady();
document.addEventListener('DOMContentLoaded', announceReady);

// 3. Relay messages between Web App and Background Worker
window.addEventListener('message', (event) => {
  if (!event.data || event.data.source !== 'pudu-web') return;

  const { action, query, items, url, filename } = event.data;

  if (action === 'PING') {
    announceReady();
    return;
  }

  // Forward request to background service worker
  chrome.runtime.sendMessage(event.data, (response) => {
    const error = chrome.runtime.lastError;
    window.postMessage({
      source: 'pudu-extension',
      action: action + '_RESPONSE',
      success: !error && (response?.success ?? true),
      ...(response || {}),
      error: error ? error.message : response?.error
    }, '*');
  });
});
