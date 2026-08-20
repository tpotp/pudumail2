/**
 * PUDÚ MAIL 2 — BACKGROUND SERVICE WORKER (v2.1 OAuth Bridge)
 * Acts as an OAuth token bridge between the Web App and Google Identity API.
 */

const EXTENSION_VERSION = "2.1.0";

console.log(`%c[Pudú BG v${EXTENSION_VERSION}] Iniciado - OAuth Bridge Mode`, 'color:#10b981;font-weight:bold');

function handleMessage(request, sender, sendResponse) {
  if (!request || !request.action) {
    sendResponse({ success: false, error: 'Sin acción' });
    return false;
  }

  const action = request.action;
  console.log(`%c[Pudú BG] 📩 ${action}`, 'color:#38bdf8;font-weight:bold', request);

  switch (action) {
    case 'PING':
    case 'CHECK_STATUS':
    case 'GET_STATUS':
      sendResponse({ success: true, installed: true, version: EXTENSION_VERSION, status: 'ready' });
      return false;

    case 'GET_AUTH_TOKEN':
      // Usar chrome.identity para obtener el token de Google
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError || !token) {
          console.error('[Pudú BG] Error obteniendo token:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Token no obtenido' });
        } else {
          console.log('[Pudú BG] Token obtenido con éxito!');
          sendResponse({ success: true, token: token });
        }
      });
      return true; // Indicamos que la respuesta es asíncrona

    default:
      sendResponse({ success: false, error: `Acción '${action}' no reconocida` });
      return false;
  }
}

chrome.runtime.onMessage.addListener(handleMessage);
chrome.runtime.onMessageExternal.addListener(handleMessage);
