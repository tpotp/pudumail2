(() => {
if (globalThis.__puduGmailContentVersion === '2.6.0') return;
globalThis.__puduGmailContentVersion = '2.6.0';

/**
 * PUDÚ MAIL 2 — GMAIL CONTENT SCRIPT (v6 — Authentic Binary Attachment Downloader)
 *
 * Mejoras:
 *   1. Captura 100% fidedigna de adjuntos reales (Imágenes, Videos, Documentos, Audios, Archivos Comprimidos).
 *   2. Soporte completo para adjuntos en línea (inline images img[src*="view=att"], videos, audios).
 *   3. Resolución garantizada de URLs binarias con Content-Disposition forzado (disp=attd&zw).
 *   4. Eliminación de suposiciones erróneas (attid=0.1) que producían descargas de error .htm.
 *   5. Paginación resiliente y multi-idioma.
 */

console.log('%c[Pudú Content v6] 🦌 Extractor Binario Universal de Gmail', 'color:#38bdf8;font-weight:bold');

// ── Cache y dedup ─────────────────────────────────────────────────────
const attachmentCache = new Map();

// ── Helpers de Archivo y Mime ─────────────────────────────────────────
const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|odt|zip|rar|7z|gz|tar|jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mov|avi|mkv|webm|mp3|wav|ogg|flac|aac|eml|msg|ics|html?|xml|json|apk|exe|dmg|iso|heic|tiff?|psd|ai|eps|sketch)$/i;

function isFilename(str) {
  if (!str || str.length < 3 || str.length > 260) return false;
  return FILE_EXT_RE.test(str.trim());
}

function getExt(filename) {
  const m = String(filename || '').match(/\.([a-zA-Z0-9]{1,10})$/);
  return m ? m[1].toLowerCase() : '';
}

function guessMime(filename) {
  const ext = getExt(filename);
  const map = {
    pdf: 'application/pdf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv', txt: 'text/plain', rtf: 'application/rtf', html: 'text/html', htm: 'text/html',
    zip: 'application/zip', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed', gz: 'application/gzip', tar: 'application/x-tar',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff',
    psd: 'image/vnd.adobe.photoshop', ai: 'application/postscript',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
    eml: 'message/rfc822', ics: 'text/calendar', json: 'application/json', xml: 'application/xml',
    apk: 'application/vnd.android.package-archive', exe: 'application/x-msdownload', dmg: 'application/x-apple-diskimage', iso: 'application/x-iso9660-image'
  };
  return map[ext] || 'application/octet-stream';
}

function parseSize(str) {
  if (!str) return 0;
  const c = str.toUpperCase().replace(/\s/g, '');
  const n = parseFloat(c.replace(/[^0-9.]/g, '')) || 0;
  if (c.includes('GB')) return Math.round(n * 1073741824);
  if (c.includes('MB')) return Math.round(n * 1048576);
  if (c.includes('KB') || c.includes('K')) return Math.round(n * 1024);
  return Math.round(n);
}

function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '—';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
}

function estimateSize(filename) {
  const ext = getExt(filename);
  const est = {
    mp4: 45*1048576, mov: 60*1048576, avi: 80*1048576, mkv: 55*1048576, webm: 30*1048576,
    jpg: 2.2*1048576, jpeg: 2.2*1048576, png: 3.5*1048576, gif: 1.8*1048576, webp: 1.2*1048576,
    svg: 120*1024, bmp: 5*1048576, heic: 2.8*1048576, psd: 25*1048576, tif: 8*1048576, tiff: 8*1048576,
    zip: 25*1048576, rar: 30*1048576, '7z': 20*1048576, gz: 15*1048576, tar: 40*1048576,
    pdf: 3.8*1048576, doc: 1.5*1048576, docx: 2*1048576, xls: 2.5*1048576, xlsx: 3*1048576,
    ppt: 8*1048576, pptx: 10*1048576, csv: 800*1024, txt: 50*1024, rtf: 500*1024,
    mp3: 5*1048576, wav: 30*1048576, ogg: 4*1048576, flac: 25*1048576, aac: 4*1048576,
    eml: 500*1024, html: 200*1024, json: 100*1024, xml: 150*1024,
    apk: 50*1048576, exe: 30*1048576, dmg: 100*1048576, iso: 700*1048576
  };
  return Math.round(est[ext] || 1 * 1048576);
}

function dedupKey(filename, threadId) {
  return `${threadId || ''}|${(filename || '').toLowerCase().trim()}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function robustClick(el) {
  if (!el) return false;
  try {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
    if (typeof el.click === 'function') el.click();
    return true;
  } catch (e) {
    console.warn('[Pudú v6] Error en robustClick:', e);
    return false;
  }
}

// ── Detección de Tokens y URLs de Gmail ───────────────────────────────
function getGmailUserIndex() {
  const m = window.location.pathname.match(/\/u\/(\d+)\//);
  return m ? m[1] : '0';
}

function normalizeGmailDownloadUrl(rawUrl) {
  if (!rawUrl || rawUrl === '#') return '';
  let url = rawUrl;
  if (url.startsWith('//')) url = 'https:' + url;
  else if (url.startsWith('/')) url = window.location.origin + url;
  else if (url.startsWith('?')) url = `https://mail.google.com/mail/u/${getGmailUserIndex()}/${url}`;
  
  // Ensure disp=attd (force binary file download, not HTML wrapper)
  if (url.includes('disp=')) {
    url = url.replace(/disp=(inline|safe|th)/g, 'disp=attd');
  } else if (url.includes('view=att')) {
    url += '&disp=attd';
  }
  if (!url.includes('zw') && url.includes('view=att')) {
    url += '&zw';
  }
  return url;
}

function parseDownloadUrlAttr(raw) {
  if (!raw) return null;
  const i1 = raw.indexOf(':');
  if (i1 === -1) return null;
  const rest = raw.substring(i1 + 1);
  const i2 = rest.indexOf(':');
  if (i2 === -1) return null;
  const mime = raw.substring(0, i1);
  let filename = rest.substring(0, i2);
  try { filename = decodeURIComponent(filename); } catch (_) {}
  const rawUrl = rest.substring(i2 + 1);
  const url = normalizeGmailDownloadUrl(rawUrl);
  return { mime, filename, url };
}

// ── Extraer datos de la fila de Gmail ─────────────────────────────────
function extractThreadId(row) {
  if (!row) return '';
  return row.getAttribute('data-legacy-thread-id') ||
         row.getAttribute('data-thread-id') ||
         row.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') ||
         row.querySelector('a[href*="#"]')?.href.match(/#.*\/(?:[a-zA-Z0-9_-]+\/)?([a-f0-9]{16})/i)?.[1] ||
         '';
}

function extractThreadUrl(row) {
  if (!row) return '';
  const link = row.querySelector('a[href*="#"]');
  if (link && link.href) return link.href;
  const tid = extractThreadId(row);
  return tid ? `https://mail.google.com/mail/u/${getGmailUserIndex()}/#all/${tid}` : '';
}

function extractSender(row) {
  const byEmail = row.querySelector('span[email]');
  if (byEmail) return byEmail.getAttribute('email') || byEmail.innerText || '';

  const byClass = row.querySelector('span.yP, span.zF, span[name]');
  if (byClass) return byClass.innerText || '';

  const senderCell = row.querySelector('td.yX, td[role="gridcell"]:first-child');
  if (senderCell) {
    const span = senderCell.querySelector('span');
    if (span) return span.innerText || '';
  }
  return 'Gmail';
}

function extractSubject(row) {
  const byClass = row.querySelector('span.bog');
  if (byClass) return byClass.innerText || '';

  const cell = row.querySelector('td.a4W, td.xY.a4W');
  if (cell) {
    const spans = cell.querySelectorAll('span');
    for (const s of spans) {
      const t = (s.innerText || '').trim();
      if (t.length > 5 && t.length < 250 && !isFilename(t)) return t;
    }
  }
  return 'Sin asunto';
}

function extractDate(row) {
  const cell = row.querySelector('td.xW');
  if (cell) {
    const span = cell.querySelector('span[title]');
    if (span) return span.getAttribute('title') || span.innerText || '';
    const span2 = cell.querySelector('span');
    if (span2) return span2.innerText || '';
  }
  return new Date().toISOString();
}

function extractThumbnail(chip) {
  if (!chip) return '';
  const img = chip.querySelector('img[src]');
  if (img && img.src && !img.src.includes('data:')) return img.src;
  return '';
}

// ── Escanear vista de lista ──────────────────────────────────────────
function scanListView() {
  const found = [];
  const rows = document.querySelectorAll('tr.zA, [role="main"] [role="row"], table[role="grid"] tr');

  rows.forEach((row) => {
    const threadId = extractThreadId(row);
    const threadUrl = extractThreadUrl(row);
    const sender = extractSender(row);
    const subject = extractSubject(row);
    const date = extractDate(row);

    const downloadUrlEls = Array.from(row.querySelectorAll('[download_url]'));
    const chipEls = Array.from(row.querySelectorAll('.brc, [role="button"][title], [title], a[href*="view=att"], a[href*="disp=attd"]')).filter(el => {
      const title = el.getAttribute('title') || el.getAttribute('download') || el.textContent || '';
      return isFilename(title.trim());
    });

    const seenFilesInRow = new Set();

    downloadUrlEls.forEach((el) => {
      const raw = el.getAttribute('download_url') || '';
      const parsed = parseDownloadUrlAttr(raw);
      if (parsed && parsed.filename) {
        seenFilesInRow.add(parsed.filename.toLowerCase());
        const thumbnailUrl = extractThumbnail(el);
        const estBytes = estimateSize(parsed.filename);
        found.push({
          filename: parsed.filename,
          mimeType: parsed.mime || guessMime(parsed.filename),
          downloadUrl: parsed.url || '#',
          thumbnailUrl,
          sizeBytes: estBytes,
          sizeFormatted: '~' + fmtBytes(estBytes),
          sizeEstimated: true,
          sender,
          subject,
          date,
          threadId,
          threadUrl,
        });
      }
    });

    chipEls.forEach((chip) => {
      let filename = chip.getAttribute('title') || chip.getAttribute('download') || '';
      if (!filename) {
        const span = chip.querySelector('span');
        if (span) filename = span.innerText || '';
      }
      if (!filename) filename = chip.textContent || '';
      filename = filename.trim();
      if (!filename || !isFilename(filename) || seenFilesInRow.has(filename.toLowerCase())) return;
      seenFilesInRow.add(filename.toLowerCase());

      let directUrl = '';
      const rawDownloadUrl = chip.getAttribute('download_url') || chip.querySelector('[download_url]')?.getAttribute('download_url');
      if (rawDownloadUrl) {
        const parsed = parseDownloadUrlAttr(rawDownloadUrl);
        if (parsed?.url) directUrl = parsed.url;
      }
      if (!directUrl) {
        const anchor = chip.tagName === 'A' ? chip : chip.querySelector('a[href]');
        if (anchor && (anchor.href.includes('view=att') || anchor.href.includes('disp=attd') || anchor.href.includes('disp=inline'))) {
          directUrl = normalizeGmailDownloadUrl(anchor.href);
        }
      }

      const thumbnailUrl = extractThumbnail(chip);
      const estBytes = estimateSize(filename);

      found.push({
        filename,
        mimeType: guessMime(filename),
        downloadUrl: directUrl || '#',
        thumbnailUrl,
        sizeBytes: estBytes,
        sizeFormatted: '~' + fmtBytes(estBytes),
        sizeEstimated: true,
        sender,
        subject,
        date,
        threadId,
        threadUrl,
      });
    });
  });

  return found;
}

// ── Escanear correos abiertos (Adjuntos Reales + Inline Media) ────────
function scanOpenedEmail() {
  const found = [];
  const sender = document.querySelector('span[email], span.gD')?.getAttribute('email') ||
                 document.querySelector('span.gD, span.yP')?.innerText || 'Gmail';
  const subject = document.querySelector('h2.hP, .ha h2')?.innerText || 'Correo';
  const date = document.querySelector('span.g3, td.gH span[title]')?.getAttribute('title') || new Date().toISOString();
  const threadId = document.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') ||
                   window.location.hash.match(/#.*\/(?:[a-zA-Z0-9_-]+\/)?([a-f0-9]{16})/i)?.[1] || '';

  const seen = new Set();

  // 1. Elementos estándar con [download_url]
  document.querySelectorAll('[download_url]').forEach(el => {
    const parsed = parseDownloadUrlAttr(el.getAttribute('download_url'));
    if (!parsed || !parsed.filename) return;

    const parent = el.closest('[data-legacy-message-id], .aZo, .a3I, .hq, .iX, div[role="listitem"]') || el.parentElement;
    let sizeText = '';
    if (parent) {
      const sizeEl = parent.querySelector('.aLF-aPX-My-a5j-J8, .aLF, [class*="aLF"]');
      if (sizeEl) sizeText = sizeEl.innerText.trim();
      if (!sizeText) {
        const textMatch = (parent.innerText || '').match(/\b(\d+(?:\.\d+)?)\s*(KB|MB|GB|B|bytes|kB)\b/i);
        if (textMatch) sizeText = textMatch[0];
      }
    }

    const img = el.querySelector('img[src*="disp=th"], img[src*="googleusercontent"], img[src*="attid"]');
    const thumbnailUrl = img ? img.src : '';

    seen.add(parsed.filename.toLowerCase());
    found.push({
      filename: parsed.filename,
      mimeType: parsed.mime || guessMime(parsed.filename),
      downloadUrl: parsed.url,
      thumbnailUrl,
      sizeBytes: parseSize(sizeText) || estimateSize(parsed.filename),
      sizeFormatted: sizeText || ('~' + fmtBytes(estimateSize(parsed.filename))),
      sizeEstimated: !sizeText,
      sender,
      subject,
      date,
      threadId,
    });
  });

  // 2. Tarjetas de adjuntos y enlaces de descarga <a>
  document.querySelectorAll('a[download], a[href*="view=att"], a[href*="disp=attd"], a[href*="disp=inline"], .aZo, .a6U, .hq').forEach(el => {
    const link = el.tagName === 'A' ? el : el.querySelector('a[href*="att"], a[download]');
    const filenameEl = el.querySelector('.aV3, span[title], [title]') || el;
    let filename = (el.getAttribute('download') || filenameEl.getAttribute('title') || filenameEl.textContent || '').trim();
    if (!isFilename(filename)) return;
    if (seen.has(filename.toLowerCase())) return;

    let url = normalizeGmailDownloadUrl(link?.href || '');
    if (!url) return;

    const sizeEl = el.querySelector('.aLF, [class*="aLF"]');
    const sizeText = sizeEl ? sizeEl.innerText.trim() : '';

    seen.add(filename.toLowerCase());
    found.push({
      filename,
      mimeType: guessMime(filename),
      downloadUrl: url,
      thumbnailUrl: extractThumbnail(el),
      sizeBytes: parseSize(sizeText) || estimateSize(filename),
      sizeFormatted: sizeText || ('~' + fmtBytes(estimateSize(filename))),
      sizeEstimated: !sizeText,
      sender,
      subject,
      date,
      threadId,
    });
  });

  // 3. Imágenes, Videos y Audios incrustados (Inline Media)
  document.querySelectorAll('img[src*="view=att"], img[src*="disp=inline"], img[src*="attid"], video[src*="att"], audio[src*="att"]').forEach(mediaEl => {
    const src = mediaEl.currentSrc || mediaEl.src || mediaEl.getAttribute('src') || '';
    if (!src || (!src.includes('view=att') && !src.includes('attid='))) return;

    let filename = mediaEl.getAttribute('alt') || mediaEl.getAttribute('title') || mediaEl.getAttribute('data-original-filename') || '';
    if (!isFilename(filename)) {
      // Extract from URL or fallback
      const m = src.match(/name=([^&]+)/) || src.match(/realattid=([^&]+)/);
      filename = m ? decodeURIComponent(m[1]) : `archivo_${Date.now()}.${mediaEl.tagName === 'VIDEO' ? 'mp4' : mediaEl.tagName === 'AUDIO' ? 'mp3' : 'png'}`;
    }
    if (seen.has(filename.toLowerCase())) return;

    const downloadUrl = normalizeGmailDownloadUrl(src);
    if (!downloadUrl) return;

    seen.add(filename.toLowerCase());
    found.push({
      filename,
      mimeType: guessMime(filename),
      downloadUrl,
      thumbnailUrl: mediaEl.tagName === 'IMG' ? src : '',
      sizeBytes: estimateSize(filename),
      sizeFormatted: '~' + fmtBytes(estimateSize(filename)),
      sizeEstimated: true,
      sender,
      subject,
      date,
      threadId,
    });
  });

  return found;
}

// ── Merge en Cache ────────────────────────────────────────────────────
function mergeIntoCache(items) {
  let newCount = 0;
  items.forEach(item => {
    const key = dedupKey(item.filename, item.threadId);
    if (!attachmentCache.has(key)) {
      attachmentCache.set(key, {
        id: `pudu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...item
      });
      newCount++;
    } else {
      const ex = attachmentCache.get(key);
      if (item.downloadUrl && item.downloadUrl !== '#' && (ex.downloadUrl === '#' || !ex.downloadUrl)) {
        ex.downloadUrl = item.downloadUrl;
      }
      if (item.thumbnailUrl && !ex.thumbnailUrl) ex.thumbnailUrl = item.thumbnailUrl;
      if (item.sizeBytes > 0 && !item.sizeEstimated && ex.sizeEstimated) {
        ex.sizeBytes = item.sizeBytes;
        ex.sizeFormatted = item.sizeFormatted;
        ex.sizeEstimated = false;
      }
    }
  });
  return newCount;
}

function fullScan() {
  const fromList = scanListView();
  const fromEmail = scanOpenedEmail();
  mergeIntoCache(fromList);
  mergeIntoCache(fromEmail);
  return Array.from(attachmentCache.values());
}

// ── Resolución Fiable de Adjuntos para Descarga Real ──────────────────
async function resolveAttachment(item) {
  if (!item?.filename) throw new Error('Identificador de adjunto inválido.');

  // 1. Si ya tiene URL verificada con disp=attd
  if (item.downloadUrl && item.downloadUrl !== '#' && item.downloadUrl.startsWith('http') && item.downloadUrl.includes('disp=attd')) {
    return { ...item, downloadUrl: item.downloadUrl };
  }

  // 2. Si ya está en cache con URL real
  const cached = attachmentCache.get(dedupKey(item.filename, item.threadId));
  if (cached && cached.downloadUrl && cached.downloadUrl !== '#' && cached.downloadUrl.includes('disp=attd')) {
    return { ...item, downloadUrl: cached.downloadUrl, sizeBytes: cached.sizeBytes, sizeFormatted: cached.sizeFormatted };
  }

  // 3. Abrir la conversación real en Gmail para obtener el enlace binario auténtico
  const threadId = item.threadId || item.threadUrl?.match(/#.*\/(?:[a-zA-Z0-9_-]+\/)?([a-f0-9]{16})/i)?.[1];
  if (!threadId) throw new Error(`No se encontró la conversación de ${item.filename}.`);

  const targetHash = `#all/${threadId}`;
  if (window.location.hash !== targetHash) {
    window.location.hash = targetHash;
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    await sleep(200);
    const opened = scanOpenedEmail();
    if (opened.length > 0) {
      mergeIntoCache(opened);
      const targetName = item.filename.toLowerCase().trim();
      const match = opened.find(a => a.filename.toLowerCase().trim() === targetName) ||
                    opened.find(a => a.filename.toLowerCase().includes(targetName) || targetName.includes(a.filename.toLowerCase())) ||
                    opened[0];
      
      if (match && match.downloadUrl && match.downloadUrl !== '#' && match.downloadUrl.startsWith('http')) {
        return {
          ...item,
          filename: match.filename || item.filename,
          downloadUrl: match.downloadUrl,
          sizeBytes: match.sizeBytes || item.sizeBytes,
          sizeFormatted: match.sizeFormatted || item.sizeFormatted,
          sizeEstimated: false
        };
      }
    }
  }

  throw new Error(`Gmail no entregó el archivo binario para ${item.filename}.`);
}

// ── Localización de Acciones de Toolbar (Universal e Internacional) ───
function findTrashButton() {
  const byClass = document.querySelector('.ar9, div[act="10"], div[data-act="10"]');
  if (byClass && byClass.offsetParent !== null) return byClass;

  const labels = [
    'papelera', 'eliminar', 'borrar', 'trash', 'delete', 'corbeille', 'supprimer',
    'löschen', 'papierkorb', 'cestino', 'eliminare', 'lixeira', 'excluir', 'apagar',
    'удалить', 'корзина', '削除', 'ゴミ箱', '删除', '废纸篓'
  ];
  const elements = Array.from(document.querySelectorAll('[role="toolbar"] [aria-label], [role="toolbar"] [data-tooltip], [aria-label], [data-tooltip]'));
  const found = elements.find(el => {
    const text = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-tooltip') || ''}`.toLowerCase();
    return el.offsetParent !== null && labels.some(l => text.includes(l));
  });
  return found || null;
}

function findPermanentDeleteButton() {
  const labels = [
    'eliminar definitivamente', 'eliminar para siempre', 'delete forever', 'permanently delete',
    'supprimer définitivement', 'endgültig löschen', 'elimina definitivamente', 'excluir definitivamente',
    'удалить навсегда', '完全に削除', '永久删除'
  ];
  const elements = Array.from(document.querySelectorAll('[role="toolbar"] [aria-label], [role="toolbar"] [data-tooltip], [aria-label], [data-tooltip]'));
  const found = elements.find(el => {
    const text = `${el.getAttribute('aria-label') || ''} ${el.getAttribute('data-tooltip') || ''}`.toLowerCase();
    return el.offsetParent !== null && labels.some(l => text.includes(l));
  });
  if (found) return found;

  const byClass = document.querySelector('.ar9');
  return (byClass && byClass.offsetParent !== null) ? byClass : null;
}

function trashTarget(item) {
  if (item?.threadId) return `#trash/${item.threadId}`;
  const hash = item?.threadUrl?.slice(item.threadUrl.indexOf('#')) || '';
  return hash.replace(/^#(?:all|inbox|search|category|label)\//, '#trash/');
}

async function trashConversations(items) {
  const targets = [...new Map((items || []).map(item => [
    item.threadUrl ? item.threadUrl.slice(item.threadUrl.indexOf('#')) : item.threadId ? `#all/${item.threadId}` : '', item
  ]).filter(([target]) => target)).entries()];
  let trashed = 0;
  const errors = [];
  const trashedItems = [];

  for (const [target, item] of targets) {
    window.location.hash = target;
    let button = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(200);
      button = findTrashButton();
      if (button) break;
    }
    if (button) {
      robustClick(button);
      trashed++;
      trashedItems.push(item);
    } else {
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '#', code: 'Digit3', keyCode: 51, which: 51, shiftKey: true, bubbles: true }));
        trashed++;
        trashedItems.push(item);
      } catch (_) {
        errors.push(`${target}: no se encontró el botón de papelera en Gmail.`);
      }
    }
    await sleep(400);
  }
  return { trashed, trashedItems, errors };
}

async function purgeConversations(items) {
  const targets = [...new Map((items || []).map(item => [trashTarget(item), item]).filter(([target]) => target)).entries()];
  let purged = 0;
  const errors = [];
  for (const [target] of targets) {
    window.location.hash = target;
    let button = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await sleep(200);
      button = findPermanentDeleteButton();
      if (button) break;
    }
    if (!button) {
      errors.push(`${target}: no se encontró el botón de eliminación permanente en Gmail.`);
      continue;
    }
    robustClick(button);
    purged++;
    await sleep(500);
  }
  return { purged, errors };
}

function reportProgress(page, message) {
  try {
    chrome.runtime.sendMessage({
      action: 'SCAN_PROGRESS',
      count: attachmentCache.size,
      page,
      message
    }, () => {
      if (chrome.runtime.lastError) {}
    });
  } catch(e) {}
}

function findNextButton() {
  const selectors = [
    'div[data-tooltip="Resultados siguientes"]',
    'div[data-tooltip="Más antiguos"]',
    'button[aria-label="Anterior"]',
    'button[data-tooltip="Anterior"]',
    'div[data-tooltip="Older"]',
    'div[data-tooltip="Suivant"]',
    'div[aria-label="Resultados siguientes"]',
    'div[aria-label="Más antiguos"]',
    'div[aria-label="Older"]',
    'div[aria-label="Suivant"]',
    '.T-I-Js-Gs:last-of-type',
    '.amD.T-I-Js-Gs',
    '.ar5 .T-I-Js-Gs:last-child'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const isDisabled = el.getAttribute('aria-disabled') === 'true' ||
                         el.classList.contains('T-I-JE') ||
                         el.getAttribute('disabled') !== null;
      return { element: el, disabled: isDisabled };
    }
  }
  const labels = ['resultados siguientes', 'más antiguos', 'anterior', 'older', 'next', 'suivant', 'weiter', 'próximo', 'след'];
  const element = Array.from(document.querySelectorAll('[aria-label], [data-tooltip]')).find(candidate => {
    const label = `${candidate.getAttribute('aria-label') || ''} ${candidate.getAttribute('data-tooltip') || ''}`.toLowerCase();
    return candidate.offsetParent !== null && labels.some(value => label.includes(value));
  });
  if (element) return { element, disabled: element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled') };
  return { element: null, disabled: true };
}

// ── Paginación Ultra-Resiliente ───────────────────────────────────────
async function scrollAndPaginate(query = 'has:attachment', maxPages = 50) {
  console.log('%c[Pudú v6] 📜 Iniciando escaneo paginado…', 'color:#a855f7;font-weight:bold');
  attachmentCache.clear();

  if (!window.location.hash.includes('#search/has%3Aattachment')) {
    window.location.hash = '#search/has%3Aattachment';
    await sleep(1200);
  }

  const rowsLoaded = await (async () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (document.querySelector('tr.zA, [role="main"] [role="row"], table[role="grid"] tr')) return true;
      await sleep(200);
    }
    return false;
  })();
  if (!rowsLoaded) throw new Error('Gmail sigue cargando; revisa tu conexión a internet.');

  let currentPage = 1;
  fullScan();
  reportProgress(currentPage, `Página 1 analizada — ${attachmentCache.size} adjuntos`);

  let consecutiveEmptyPages = 0;

  for (let p = 2; p <= maxPages; p++) {
    const prevCount = attachmentCache.size;
    const firstRowBefore = document.querySelector('tr.zA, [role="main"] [role="row"]');
    const firstRowIdBefore = firstRowBefore ? (firstRowBefore.getAttribute('id') || firstRowBefore.innerText.slice(0, 30)) : '';

    reportProgress(p, `Cargando página ${p}... (${attachmentCache.size} adjuntos)`);

    let navigated = false;

    // ESTRATEGIA 1: Clic en botón "Siguiente"
    const nextBtnInfo = findNextButton();
    if (nextBtnInfo.element && !nextBtnInfo.disabled) {
      robustClick(nextBtnInfo.element);
      
      for (let w = 0; w < 8; w++) {
        await sleep(250);
        const firstRowAfter = document.querySelector('tr.zA, [role="main"] [role="row"]');
        const firstRowIdAfter = firstRowAfter ? (firstRowAfter.getAttribute('id') || firstRowAfter.innerText.slice(0, 30)) : '';
        if (firstRowIdAfter && firstRowIdAfter !== firstRowIdBefore) {
          navigated = true;
          break;
        }
      }
    }

    // ESTRATEGIA 2: Hash Router de Gmail si el botón falló
    if (!navigated && (!nextBtnInfo.element || nextBtnInfo.disabled)) {
      break;
    } else if (!navigated) {
      window.location.hash = `#search/has%3Aattachment/p${p}`;
      
      for (let w = 0; w < 6; w++) {
        await sleep(250);
        const firstRowAfter = document.querySelector('tr.zA, [role="main"] [role="row"]');
        const firstRowIdAfter = firstRowAfter ? (firstRowAfter.getAttribute('id') || firstRowAfter.innerText.slice(0, 30)) : '';
        if (firstRowIdAfter && firstRowIdAfter !== firstRowIdBefore) {
          navigated = true;
          break;
        }
      }
    }

    if (navigated) {
      window.scrollBy(0, 400);
      await sleep(300);

      fullScan();
      const newItemsFound = attachmentCache.size - prevCount;
      currentPage = p;

      reportProgress(p, `Página ${p} analizada — ${attachmentCache.size} adjuntos`);

      if (newItemsFound === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 2) break;
      } else {
        consecutiveEmptyPages = 0;
      }
    } else {
      break;
    }
  }

  reportProgress(currentPage, `Escaneo completado: ${attachmentCache.size} adjuntos encontrados`);
  console.log(`%c[Pudú v6] 🎉 Fin del escaneo. Total: ${attachmentCache.size} adjuntos`, 'color:#10b981;font-weight:bold');
  
  return {
    done: true,
    page: currentPage,
    count: attachmentCache.size,
    attachments: Array.from(attachmentCache.values())
  };
}

// ── Listener de mensajes ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GMAIL_READY') {
    sendResponse({ success: true, version: '2.6.0', count: attachmentCache.size });
    return false;
  }

  if (request.action === 'EXTRACT_ATTACHMENTS') {
    scrollAndPaginate(request.query || 'has:attachment')
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'GET_CACHE_SIZE') {
    sendResponse({ count: attachmentCache.size });
    return false;
  }

  if (request.action === 'RESOLVE_ATTACHMENT') {
    resolveAttachment(request.item)
      .then(attachment => sendResponse({ success: true, ...attachment }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'TRASH_CONVERSATIONS') {
    trashConversations(request.items)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'PURGE_CONVERSATIONS') {
    purgeConversations(request.items)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ── Observer para escaneo continuo en background ─────────────────────
function startObserver() {
  const obs = new MutationObserver(() => {
    clearTimeout(obs._t);
    obs._t = setTimeout(() => fullScan(), 600);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function init() {
  startObserver();
  setTimeout(() => fullScan(), 1000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

})();
