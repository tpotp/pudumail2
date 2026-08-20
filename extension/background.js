/**
 * PUDÚ MAIL 2 — BACKGROUND SERVICE WORKER (v2)
 * Routes messages between pudumail2.vercel.app ↔ Gmail content script.
 * No fake data — only real attachments from Gmail DOM.
 */

const EXTENSION_VERSION = "2.0.0";

console.log(`%c[Pudú BG v${EXTENSION_VERSION}] Iniciado`, 'color:#10b981;font-weight:bold');

// ── Unified message router ───────────────────────────────────────────
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

    case 'SCAN_GMAIL_ATTACHMENTS':
      handleScan(request, sendResponse);
      return true; // async

    case 'DOWNLOAD_ATTACHMENT':
      handleDownload(request, sendResponse);
      return true;

    case 'BATCH_DOWNLOAD':
      handleBatchDownload(request, sendResponse);
      return true;

    default:
      sendResponse({ success: false, error: `Acción '${action}' no reconocida` });
      return false;
  }
}

chrome.runtime.onMessage.addListener(handleMessage);
chrome.runtime.onMessageExternal.addListener(handleMessage);

// ── Scan Gmail ───────────────────────────────────────────────────────
async function handleScan(request, sendResponse) {
  try {
    // 1. Find open Gmail tabs
    const tabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
    console.log(`[Pudú BG] Pestañas Gmail: ${tabs.length}`);

    if (!tabs || tabs.length === 0) {
      // Open a new Gmail tab with has:attachment search
      console.log('[Pudú BG] Abriendo nueva pestaña Gmail con búsqueda de adjuntos...');
      const newTab = await chrome.tabs.create({
        url: "https://mail.google.com/mail/u/0/#search/has%3Aattachment",
        active: false
      });

      // Wait for Gmail to fully load (SPAs take a while)
      setTimeout(async () => {
        try {
          const results = await scanTab(newTab.id, request.query);
          sendResponse({ success: true, attachments: results, count: results.length });
        } catch (err) {
          console.warn('[Pudú BG] Error en nueva pestaña:', err);
          sendResponse({ success: true, attachments: [], count: 0, error: err.message });
        }
      }, 5000);
      return;
    }

    // 2. Use existing Gmail tab
    const gmailTab = tabs[0];

    // If the Gmail tab is on inbox, navigate to has:attachment search first
    if (gmailTab.url && !gmailTab.url.includes('#search') && !gmailTab.url.includes('has%3Aattachment')) {
      console.log('[Pudú BG] Navegando a búsqueda de adjuntos...');
      await chrome.tabs.update(gmailTab.id, {
        url: "https://mail.google.com/mail/u/0/#search/has%3Aattachment"
      });
      // Wait for navigation + render
      setTimeout(async () => {
        try {
          const results = await scanTab(gmailTab.id, request.query);
          sendResponse({ success: true, attachments: results, count: results.length });
        } catch (err) {
          sendResponse({ success: true, attachments: [], count: 0, error: err.message });
        }
      }, 4000);
      return;
    }

    // Already on a search/attachment view — scan directly
    try {
      const results = await scanTab(gmailTab.id, request.query);
      sendResponse({ success: true, attachments: results, count: results.length });
    } catch (err) {
      sendResponse({ success: true, attachments: [], count: 0, error: err.message });
    }

  } catch (error) {
    console.error('[Pudú BG] Error general:', error);
    sendResponse({ success: true, attachments: [], count: 0, error: error.message });
  }
}

// ── Execute scan inside a Gmail tab ──────────────────────────────────
function scanTab(tabId, query) {
  return new Promise((resolve, reject) => {
    // First attempt: send message to existing content script
    chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_ATTACHMENTS', query: query || 'has:attachment' }, response => {
      if (chrome.runtime.lastError) {
        console.log('[Pudú BG] Content script no responde, reinyectando…');
        // Re-inject content.js
        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[Pudú BG] Error al inyectar:', chrome.runtime.lastError);
            resolve([]);
            return;
          }
          // Wait for content script to initialize and do its first scan
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_ATTACHMENTS', query: query || 'has:attachment' }, res => {
              if (chrome.runtime.lastError) {
                resolve([]);
              } else {
                resolve(res?.attachments || []);
              }
            });
          }, 3000); // Give it 3s to initialize, run observer, and auto-scroll
        });
      } else {
        resolve(response?.attachments || []);
      }
    });
  });
}

// ── Download handlers ────────────────────────────────────────────────
function handleDownload(request, sendResponse) {
  const { url, filename } = request;
  if (!url || url === '#') {
    sendResponse({ success: false, error: 'URL no disponible para este adjunto' });
    return;
  }

  chrome.downloads.download({
    url: url,
    filename: 'PuduMail_Adjuntos/' + (filename || 'adjunto'),
    saveAs: false
  }, downloadId => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true, downloadId });
    }
  });
}

async function handleBatchDownload(request, sendResponse) {
  const items = request.items || [];
  let ok = 0;

  for (const item of items) {
    if (!item.url || item.url === '#') continue;
    try {
      await new Promise(resolve => {
        chrome.downloads.download({
          url: item.url,
          filename: 'PuduMail_Adjuntos/' + (item.filename || `archivo_${Date.now()}`),
          saveAs: false
        }, () => resolve());
      });
      ok++;
    } catch (e) {
      console.warn('[Pudú BG] Error descargando:', item.filename, e);
    }
  }

  sendResponse({ success: true, total: items.length, downloaded: ok });
}
