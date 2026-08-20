/* Gmail stays in a private worker tab; no mail data leaves this browser. */
const EXTENSION_VERSION = '2.5.0';
const GMAIL_SEARCH_URL = 'https://mail.google.com/mail/u/0/#search/has%3Aattachment';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let dashboardTabId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request?.action) return;
  if (['PING', 'CHECK_STATUS', 'GET_STATUS'].includes(request.action)) {
    sendResponse({ success: true, installed: true, version: EXTENSION_VERSION, status: 'ready' });
    return;
  }
  if (request.action === 'SCAN_PROGRESS') return broadcastProgress(request, sendResponse);
  if (request.action === 'SCAN_GMAIL_ATTACHMENTS') {
    dashboardTabId = sender.tab?.id ?? dashboardTabId;
    return respond(scanGmail(request.query, request.continue), sendResponse);
  }
  if (request.action === 'RESOLVE_ATTACHMENT') return respond(resolveAttachment(request.item), sendResponse);
  if (request.action === 'DOWNLOAD_ATTACHMENT') return respond(downloadAttachment(request.item || request), sendResponse);
  if (request.action === 'BATCH_DOWNLOAD') {
    dashboardTabId = sender.tab?.id ?? dashboardTabId;
    return respond(downloadBatch(request.items), sendResponse);
  }
  if (request.action === 'TRASH_CONVERSATIONS') return respond(trashConversations(request.items), sendResponse);
  if (request.action === 'PURGE_CONVERSATIONS') return respond(purgeConversations(request.items), sendResponse);
  sendResponse({ success: false, error: `Acción '${request.action}' no reconocida` });
});

function respond(promise, sendResponse) {
  promise.then(result => sendResponse({ success: true, ...result }))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
}

function broadcastProgress(request, sendResponse) {
  if (Number.isInteger(dashboardTabId)) chrome.tabs.sendMessage(dashboardTabId, request).catch(() => {});
  if (typeof sendResponse === 'function') sendResponse({ success: true });
}

async function getScanTab() {
  const { scanTabId } = await chrome.storage.session.get('scanTabId');
  if (scanTabId) {
    try { return await chrome.tabs.get(scanTabId); } catch (_) { /* worker tab was closed */ }
  }
  const tab = await chrome.tabs.create({ url: GMAIL_SEARCH_URL, active: false });
  await chrome.storage.session.set({ scanTabId: tab.id });
  return tab;
}

async function loadWorker(tab, url = GMAIL_SEARCH_URL) {
  const current = await chrome.tabs.get(tab.id).catch(() => tab);
  if (url && current.url !== url) {
    await chrome.tabs.update(tab.id, { url });
  }
  await new Promise(resolve => {
    const onUpdated = (tabId, change) => {
      if (tabId !== tab.id || change.status !== 'complete') return;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }, 15000);
  });
}

function sendToGmail(tabId, request) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, request, response => {
      resolve(chrome.runtime.lastError ? null : response || null);
    });
  });
}

async function ensureGmailReceiver(tab) {
  for (let attempt = 0; attempt < 15; attempt++) {
    const ready = await sendToGmail(tab.id, { action: 'GMAIL_READY' });
    if (ready?.success) return;
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); } catch (_) {}
    await delay(Math.min(4000, 250 * 2 ** attempt));
    if (attempt === 6) {
      await chrome.tabs.reload(tab.id);
      await loadWorker(tab, tab.url || GMAIL_SEARCH_URL);
    }
  }
  throw new Error('No fue posible preparar Gmail automáticamente.');
}

async function askGmail(action, payload = {}) {
  const tab = await getScanTab();
  await ensureGmailReceiver(tab);
  const result = await sendToGmail(tab.id, { action, ...payload });
  if (!result?.success) throw new Error(result?.error || 'Gmail no pudo completar la operación.');
  return result;
}

async function scanGmail(query, continuing = false) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const tab = await getScanTab();
      const current = await chrome.tabs.get(tab.id).catch(() => tab);
      if ((!continuing && attempt === 0) || !current.url?.includes('#search/has%3Aattachment')) {
        await loadWorker(current, GMAIL_SEARCH_URL);
      }
      const result = await askGmail('EXTRACT_ATTACHMENTS', {
        query: query || 'has:attachment',
        continue: continuing || attempt > 0,
      });
      return result;
    } catch (error) {
      if (attempt === 3) throw error;
      broadcastProgress({ action: 'SCAN_PROGRESS', page: 0, count: 0, message: 'Recuperando conexión con Gmail…' }, () => {});
      await delay(Math.min(8000, 1000 * 2 ** attempt));
    }
  }
}

async function resolveAttachment(item) {
  if (!item?.filename) throw new Error('Falta el nombre del archivo adjunto.');
  if (item.downloadUrl && item.downloadUrl !== '#' && item.downloadUrl.startsWith('http')) {
    return { attachment: item };
  }
  const result = await askGmail('RESOLVE_ATTACHMENT', { item });
  if (!result.downloadUrl || result.downloadUrl === '#') {
    throw new Error(`Gmail no entregó un enlace de descarga para ${item.filename}.`);
  }
  return { attachment: { ...item, ...result, downloadUrl: result.downloadUrl } };
}

async function downloadAttachment(item) {
  const { attachment } = await resolveAttachment(item);
  const downloadId = await chrome.downloads.download({
    url: attachment.downloadUrl,
    filename: `PuduMail_Adjuntos/${safeFilename(attachment.filename)}`,
    saveAs: false,
  });
  const verification = await waitForDownload(downloadId);
  return { downloadId, attachment, verification };
}

async function downloadBatch(items = []) {
  const completed = [];
  const errors = [];
  const failedConversations = new Set();
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    broadcastProgress({
      action: 'SCAN_PROGRESS',
      page: i + 1,
      count: total,
      message: `Descargando (${i + 1}/${total}): ${item.filename}`
    }, () => {});

    try {
      const downloaded = await downloadAttachment(item);
      completed.push(downloaded);
    } catch (error) {
      console.warn(`[Pudú BG] Error descargando ${item.filename}:`, error);
      failedConversations.add(conversationKey(item));
      errors.push(`${item.filename}: ${error.message}`);
    }
  }

  const cleanupItems = completed
    .map(result => publicAttachment(result.attachment))
    .filter(item => !failedConversations.has(conversationKey(item)));

  return {
    downloaded: completed.length,
    total: items.length,
    attachments: completed.map(result => publicAttachment(result.attachment)),
    cleanupItems,
    verifications: completed.map(result => ({ filename: result.attachment.filename, ...result.verification })),
    errors,
  };
}

function waitForDownload(downloadId) {
  return new Promise((resolve, reject) => {
    let timeout;
    const finish = (error, item) => {
      if (!timeout) return;
      clearTimeout(timeout);
      timeout = null;
      chrome.downloads.onChanged.removeListener(onChanged);
      error ? reject(error) : resolve(item);
    };

    const onChanged = delta => {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === 'complete') inspect();
      if (delta.state.current === 'interrupted') finish(new Error('La descarga fue interrumpida.'));
    };

    const inspect = () => chrome.downloads.search({ id: downloadId }, downloads => {
      const item = downloads ? downloads[0] : null;
      if (item?.state === 'complete') {
        finish(null, {
          exists: item.exists !== false,
          fileSize: item.fileSize || item.totalBytes || 0,
          totalBytes: item.totalBytes || 0,
        });
      } else if (item?.state === 'interrupted') {
        finish(new Error('La descarga fue interrumpida.'));
      }
    });

    chrome.downloads.onChanged.addListener(onChanged);
    timeout = setTimeout(() => {
      // Check one last time before timing out
      chrome.downloads.search({ id: downloadId }, downloads => {
        const item = downloads ? downloads[0] : null;
        if (item?.state === 'complete') {
          finish(null, { exists: true, fileSize: item.fileSize || 0, totalBytes: item.totalBytes || 0 });
        } else {
          finish(new Error('La descarga tardó demasiado tiempo.'));
        }
      });
    }, 45000);
    inspect();
  });
}

async function trashConversations(items = []) {
  const result = await askGmail('TRASH_CONVERSATIONS', { items });
  return { trashed: result.trashed || 0, trashedItems: result.trashedItems || [], errors: result.errors || [] };
}

async function purgeConversations(items = []) {
  const result = await askGmail('PURGE_CONVERSATIONS', { items });
  return { purged: result.purged || 0, errors: result.errors || [] };
}

function safeFilename(name) {
  return String(name || 'adjunto').replace(/[\\/:*?"<>|]/g, '_');
}

function conversationKey(item) {
  return item?.threadUrl || item?.threadId || `attachment:${item?.id || item?.filename || ''}`;
}

function publicAttachment(attachment) {
  const { downloadUrl, ...metadata } = attachment;
  return metadata;
}
