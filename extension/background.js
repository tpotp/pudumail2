/* Routes only local extension messages. Gmail data never leaves the browser. */
const EXTENSION_VERSION = '2.1.0';
const GMAIL_SEARCH_URL = 'https://mail.google.com/mail/u/0/#search/has%3Aattachment';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request?.action) return;
  if (request.action === 'PING' || request.action === 'CHECK_STATUS' || request.action === 'GET_STATUS') {
    sendResponse({ success: true, installed: true, version: EXTENSION_VERSION, status: 'ready' });
    return;
  }
  if (request.action === 'SCAN_PROGRESS') return broadcastProgress(request, sendResponse);
  if (request.action === 'SCAN_GMAIL_ATTACHMENTS') return respond(scanGmail(request.query), sendResponse);
  if (request.action === 'RESOLVE_ATTACHMENT') return respond(resolveAttachment(request.item), sendResponse);
  if (request.action === 'DOWNLOAD_ATTACHMENT') return respond(downloadAttachment(request.item || request), sendResponse);
  if (request.action === 'BATCH_DOWNLOAD') return respond(downloadBatch(request.items), sendResponse);
  if (request.action === 'TRASH_CONVERSATIONS') return respond(trashConversations(request.items), sendResponse);
  sendResponse({ success: false, error: `Acción '${request.action}' no reconocida` });
});

function respond(promise, sendResponse) {
  promise.then(result => sendResponse({ success: true, ...result })).catch(error => sendResponse({ success: false, error: error.message }));
  return true;
}

function broadcastProgress(request, sendResponse) {
  chrome.tabs.query({}).then(tabs => tabs.forEach(tab => {
    if (/^https:\/\/(pudumail2\.vercel\.app|[^/]+\.vercel\.app|localhost|127\.0\.0\.1)/.test(tab.url || '')) {
      chrome.tabs.sendMessage(tab.id, request).catch(() => {});
    }
  }));
  sendResponse({ success: true });
}

async function getScanTab() {
  const { scanTabId } = await chrome.storage.session.get('scanTabId');
  if (scanTabId) {
    try { return await chrome.tabs.get(scanTabId); } catch (_) { /* create a fresh worker tab */ }
  }
  const tab = await chrome.tabs.create({ url: GMAIL_SEARCH_URL, active: false });
  await chrome.storage.session.set({ scanTabId: tab.id });
  await new Promise(resolve => setTimeout(resolve, 2500));
  return tab;
}

async function askGmail(action, payload = {}) {
  const tab = await getScanTab();
  let response;
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = await new Promise(resolve => {
      chrome.tabs.sendMessage(tab.id, { action, ...payload }, value => {
        resolve(chrome.runtime.lastError ? null : value);
      });
    });
    if (result) { response = result; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!response) throw new Error('No se pudo conectar con Gmail. Actualiza la pestaña de Gmail e inténtalo otra vez.');
  if (!response?.success) throw new Error(response?.error || 'Gmail no pudo resolver el adjunto.');
  return response;
}

async function scanGmail(query) {
  const tab = await getScanTab();
  if (!tab.url?.includes('#search/has%3Aattachment')) {
    await chrome.tabs.update(tab.id, { url: GMAIL_SEARCH_URL });
    await new Promise(resolve => setTimeout(resolve, 1800));
  }
  const result = await askGmail('EXTRACT_ATTACHMENTS', { query: query || 'has:attachment' });
  return { attachments: result.attachments || [], count: result.attachments?.length || 0 };
}

async function resolveAttachment(item) {
  if (!item?.filename || !item?.threadId) throw new Error('Falta el identificador de Gmail para este adjunto. Vuelve a explorar Gmail.');
  const result = await askGmail('RESOLVE_ATTACHMENT', { item });
  if (!result.downloadUrl) throw new Error(`Gmail no entregó un enlace de descarga para ${item.filename}.`);
  return { attachment: { ...item, ...result, downloadUrl: result.downloadUrl } };
}

async function downloadAttachment(item) {
  const { attachment } = await resolveAttachment(item);
  const downloadId = await chrome.downloads.download({
    url: attachment.downloadUrl,
    filename: `PuduMail_Adjuntos/${safeFilename(attachment.filename)}`,
    saveAs: false,
  });
  await waitForDownload(downloadId);
  return { downloadId, attachment };
}

async function downloadBatch(items = []) {
  let downloaded = 0;
  const errors = [];
  const attachments = [];
  for (const item of items) {
    try { attachments.push((await downloadAttachment(item)).attachment); downloaded++; } catch (error) { errors.push(`${item.filename}: ${error.message}`); }
  }
  return { downloaded, total: items.length, attachments, errors };
}

function waitForDownload(downloadId) {
  return new Promise((resolve, reject) => {
    let timeout;
    const onChanged = delta => {
      if (delta.id !== downloadId || !delta.state) return;
      if (delta.state.current === 'complete') finish();
      if (delta.state.current === 'interrupted') finish(new Error('La descarga fue interrumpida.'));
    };
    const finish = error => {
      if (!timeout) return;
      clearTimeout(timeout);
      timeout = null;
      chrome.downloads.onChanged.removeListener(onChanged);
      error ? reject(error) : resolve();
    };
    chrome.downloads.onChanged.addListener(onChanged);
    timeout = setTimeout(() => finish(new Error('La descarga no terminó a tiempo.')), 120000);
    chrome.downloads.search({ id: downloadId }, downloads => {
      const state = downloads[0]?.state;
      if (state === 'complete') finish();
      if (state === 'interrupted') finish(new Error('La descarga fue interrumpida.'));
    });
  });
}

async function trashConversations(items = []) {
  const result = await askGmail('TRASH_CONVERSATIONS', { items });
  return { trashed: result.trashed || 0, errors: result.errors || [] };
}

function safeFilename(name) {
  return String(name || 'adjunto').replace(/[\\/:*?"<>|]/g, '_');
}
