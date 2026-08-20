/**
 * PUDÚ MAIL 2 - CHROME EXTENSION SERVICE WORKER (BACKGROUND)
 * Handles communication between pudumail2.vercel.app and Gmail Web Session.
 */

const EXTENSION_VERSION = "1.0.0";

// Listen to external messages from authorized web domains (pudumail2.vercel.app, localhost)
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  console.log('[Pudú Background] Mensaje externo recibido:', request);

  if (request.action === 'PING' || request.action === 'CHECK_STATUS') {
    sendResponse({
      success: true,
      installed: true,
      version: EXTENSION_VERSION,
      status: 'ready'
    });
    return true;
  }

  if (request.action === 'SCAN_GMAIL_ATTACHMENTS') {
    handleScanAttachments(request, sendResponse);
    return true; // Keep channel open for async response
  }

  if (request.action === 'DOWNLOAD_ATTACHMENT') {
    handleDownloadAttachment(request, sendResponse);
    return true;
  }

  if (request.action === 'BATCH_DOWNLOAD') {
    handleBatchDownload(request, sendResponse);
    return true;
  }

  sendResponse({ success: false, error: 'Acción no reconocida' });
  return true;
});

// Listen to internal messages (popup or content script)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_STATUS') {
    sendResponse({ success: true, version: EXTENSION_VERSION });
  }
  return true;
});

/**
 * Coordinate scanning attachments from Gmail Web Tab
 */
async function handleScanAttachments(request, sendResponse) {
  try {
    // 1. Find active or open Gmail tabs
    const tabs = await chrome.tabs.query({ url: "*://mail.google.com/*" });
    
    if (!tabs || tabs.length === 0) {
      // No Gmail tab open: open one in background/tab
      const newTab = await chrome.tabs.create({
        url: "https://mail.google.com/mail/u/0/#search/has%3Aattachment",
        active: false
      });
      
      // Wait for it to load
      setTimeout(async () => {
        try {
          const results = await executeScanInTab(newTab.id, request.query || 'has:attachment');
          sendResponse({ success: true, attachments: results });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      }, 4000);
      return;
    }

    // Use the first open Gmail tab
    const gmailTab = tabs[0];
    const results = await executeScanInTab(gmailTab.id, request.query || 'has:attachment');
    sendResponse({ success: true, attachments: results });
  } catch (error) {
    console.error('[Pudú Background] Error al escanear Gmail:', error);
    sendResponse({ success: false, error: error.message || 'Error al comunicarse con Gmail' });
  }
}

/**
 * Execute extraction inside Gmail Tab
 */
function executeScanInTab(tabId, searchQuery) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_ATTACHMENTS', query: searchQuery }, (response) => {
      if (chrome.runtime.lastError) {
        // Fallback: inject content script if not ready
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        }, () => {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { action: 'EXTRACT_ATTACHMENTS', query: searchQuery }, (res) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve((res && res.attachments) || []);
              }
            });
          }, 800);
        });
      } else {
        resolve((response && response.attachments) || []);
      }
    });
  });
}

/**
 * Single file download
 */
function handleDownloadAttachment(request, sendResponse) {
  const { url, filename } = request;
  if (!url) {
    sendResponse({ success: false, error: 'URL requerida' });
    return;
  }

  const cleanFilename = 'PuduMail_Adjuntos/' + (filename || 'adjunto');
  chrome.downloads.download({
    url: url,
    filename: cleanFilename,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
    } else {
      sendResponse({ success: true, downloadId });
    }
  });
}

/**
 * Batch download multiple files
 */
async function handleBatchDownload(request, sendResponse) {
  const items = request.items || [];
  let successCount = 0;
  
  for (const item of items) {
    try {
      const cleanFilename = 'PuduMail_Adjuntos/' + (item.filename || 'archivo_' + Date.now());
      await new Promise((resolve) => {
        chrome.downloads.download({
          url: item.url,
          filename: cleanFilename,
          saveAs: false
        }, () => resolve());
      });
      successCount++;
    } catch (e) {
      console.warn('Error descargando archivo:', item.filename, e);
    }
  }

  sendResponse({ success: true, total: items.length, downloaded: successCount });
}
