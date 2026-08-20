(() => {
if (globalThis.__puduGmailContentVersion === '2.4.0') return;
globalThis.__puduGmailContentVersion = '2.4.0';

/**
 * PUDÚ MAIL 2 — GMAIL CONTENT SCRIPT (v4 — Multi-Strategy Resilient)
 *
 * Estrategias de escaneo:
 *   1. Extracción de chips .brc en filas tr.zA
 *   2. Extracción de emails abiertos [download_url] y clases de peso .aLF-aPX-My-a5j-J8
 *   3. Paginación multi-estrategia: Eventos Pointer/Mouse + URL Hash routing (#search/has:attachment/pX)
 *   4. Espera y recuperación automática antes de declarar un fallo.
 */

console.log('%c[Pudú Content v4] 🦌 Activo en Gmail con Paginación Resiliente', 'color:#38bdf8;font-weight:bold');

// ── Cache y dedup ─────────────────────────────────────────────────────
const attachmentCache = new Map();
let activeScan = null;
let scanState = null;

// ── Helpers ─────────────────────────────────────────────────────────
const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|odt|zip|rar|7z|gz|tar|jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mov|avi|mkv|webm|mp3|wav|ogg|flac|aac|eml|msg|ics|html?|xml|json|apk|exe|dmg|iso|heic|tiff?|psd|ai|eps|sketch)$/i;

function isFilename(str) {
  if (!str || str.length < 3 || str.length > 260) return false;
  return FILE_EXT_RE.test(str.trim());
}

function getExt(filename) {
  const m = filename.match(/\.([a-zA-Z0-9]{1,10})$/);
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

// ── Disparador robusto de eventos de clic ─────────────────────────────
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
    console.warn('[Pudú v4] Error en robustClick:', e);
    return false;
  }
}

// ── Extraer datos de la fila de Gmail ─────────────────────────────────
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
  const img = chip.querySelector('img[src]');
  if (img && img.src && !img.src.includes('data:')) return img.src;
  return '';
}

// ── Escanear vista de lista ──────────────────────────────────────────
function scanListView() {
  const found = [];
  const rows = document.querySelectorAll('tr.zA, [role="main"] [role="row"]');

  rows.forEach((row) => {
    const chips = Array.from(row.querySelectorAll('.brc, [title]')).filter(chip => {
      const name = chip.getAttribute('title') || chip.textContent || '';
      return isFilename(name.trim());
    });
    if (chips.length === 0) return;

    const sender = extractSender(row);
    const subject = extractSubject(row);
    const date = extractDate(row);
    const threadId = row.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') || '';
    const threadUrl = Array.from(row.querySelectorAll('a[href]'))
      .map(link => link.getAttribute('href') || '')
      .find(href => href.includes('#')) || '';

    chips.forEach(chip => {
      let filename = chip.getAttribute('title') || '';
      if (!filename) {
        const span = chip.querySelector('span');
        if (span) filename = span.innerText || '';
      }
      filename = filename.trim();
      if (!filename || !isFilename(filename)) return;

      const thumbnailUrl = extractThumbnail(chip);
      const estBytes = estimateSize(filename);

      found.push({
        filename,
        mimeType: guessMime(filename),
        downloadUrl: '#',
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

// ── Escanear correos abiertos ────────────────────────────────────────
function scanOpenedEmail() {
  const found = [];
  document.querySelectorAll('[download_url]').forEach(el => {
    const raw = el.getAttribute('download_url');
    if (!raw) return;
    const i1 = raw.indexOf(':');
    if (i1 === -1) return;
    const rest = raw.substring(i1 + 1);
    const i2 = rest.indexOf(':');
    if (i2 === -1) return;

    const mime = raw.substring(0, i1);
    const filename = decodeURIComponent(rest.substring(0, i2));
    const url = rest.substring(i2 + 1);
    if (!filename) return;

    const parent = el.closest('[data-legacy-message-id], .aZo, .iX');
    let sizeText = '';
    if (parent) {
      const sizeEl = parent.querySelector('.aLF-aPX-My-a5j-J8, [class*="aLF"]');
      if (sizeEl) sizeText = sizeEl.innerText.trim();
    }

    const img = el.querySelector('img[src*="disp=th"], img[src*="googleusercontent"]');
    const thumbnailUrl = img ? img.src : '';

    let sender = '', subject = '', date = '';
    const subjectEl = document.querySelector('h2.hP');
    if (subjectEl) subject = subjectEl.innerText || '';
    const senderEl = document.querySelector('span[email], span.gD');
    if (senderEl) sender = senderEl.getAttribute('email') || senderEl.innerText || '';
    const threadId = document.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') || '';

    found.push({
      filename,
      mimeType: mime || guessMime(filename),
      downloadUrl: url || '#',
      thumbnailUrl,
      sizeBytes: parseSize(sizeText) || estimateSize(filename),
      sizeFormatted: sizeText || ('~' + fmtBytes(estimateSize(filename))),
      sizeEstimated: !sizeText,
      sender: sender || 'Gmail',
      subject: subject || 'Correo',
      date: date || new Date().toISOString(),
      threadId
    });
  });

  // Gmail variants sometimes expose a regular link before adding download_url.
  document.querySelectorAll('a[download], a[href*="attachment"], a[href*="view=att"]').forEach(link => {
    const filename = (link.getAttribute('download') || link.getAttribute('title') || link.textContent || '').trim();
    const url = link.href || '';
    if (!isFilename(filename) || !url) return;
    found.push({
      filename,
      mimeType: guessMime(filename),
      downloadUrl: url,
      thumbnailUrl: '',
      sizeBytes: estimateSize(filename),
      sizeFormatted: '~' + fmtBytes(estimateSize(filename)),
      sizeEstimated: true,
      sender: document.querySelector('span[email], span.gD')?.getAttribute('email') || 'Gmail',
      subject: document.querySelector('h2.hP')?.innerText || 'Correo',
      date: new Date().toISOString(),
      threadId: document.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') || ''
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
      if (item.downloadUrl && item.downloadUrl !== '#' && ex.downloadUrl === '#') ex.downloadUrl = item.downloadUrl;
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

async function resolveAttachment(item) {
  if ((!item?.threadId && !item?.threadUrl) || !item?.filename) {
    throw new Error('No se encontró la conversación de este adjunto. Vuelve a explorar Gmail.');
  }

  const target = item.threadUrl ? item.threadUrl.slice(item.threadUrl.indexOf('#')) : `#all/${item.threadId}`;
  if (window.location.hash !== target) window.location.hash = target;

  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(350);
    const match = scanOpenedEmail().find(found => found.filename === item.filename && found.downloadUrl !== '#');
    if (match) return { ...item, ...match, sizeEstimated: match.sizeEstimated };
  }
  throw new Error(`No se pudo abrir ${item.filename} en Gmail.`);
}

function findTrashButton() {
  const labels = ['papelera', 'eliminar', 'delete', 'trash'];
  const matches = Array.from(document.querySelectorAll('[aria-label], [data-tooltip]')).filter(element => {
    const label = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('data-tooltip') || ''}`.toLowerCase();
    return labels.some(word => label.includes(word)) && element.offsetParent !== null;
  });
  return matches.find(element => element.closest('[role="toolbar"]')) || null;
}

function findPermanentDeleteButton() {
  const labels = ['eliminar definitivamente', 'eliminar para siempre', 'delete forever', 'permanently delete'];
  const matches = Array.from(document.querySelectorAll('[aria-label], [data-tooltip]')).filter(element => {
    const label = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('data-tooltip') || ''}`.toLowerCase();
    return labels.some(word => label.includes(word)) && element.offsetParent !== null;
  });
  return matches.find(element => element.closest('[role="toolbar"]')) || null;
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
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(250);
      button = findTrashButton();
      if (button) break;
    }
    if (!button) {
      errors.push(`${target}: no se encontró el botón de papelera en Gmail.`);
      continue;
    }
    robustClick(button);
    trashed++;
    trashedItems.push(item);
    await sleep(700);
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
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(250);
      button = findPermanentDeleteButton();
      if (button) break;
    }
    if (!button) {
      errors.push(`${target}: no se encontró el botón de eliminación permanente en Gmail.`);
      continue;
    }
    robustClick(button);
    purged++;
    await sleep(700);
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

// ── Localizar botón siguiente ─────────────────────────────────────────
function findNextButton() {
  // Selectores específicos de Gmail en todos los idiomas
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
  const labels = ['resultados siguientes', 'más antiguos', 'anterior', 'older', 'next'];
  const element = Array.from(document.querySelectorAll('[aria-label], [data-tooltip]')).find(candidate => {
    const label = `${candidate.getAttribute('aria-label') || ''} ${candidate.getAttribute('data-tooltip') || ''}`.toLowerCase();
    return candidate.offsetParent !== null && labels.some(value => label.includes(value));
  });
  if (element) return { element, disabled: element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled') };
  return { element: null, disabled: true };
}

// ── Paginación Ultra-Resiliente ───────────────────────────────────────
async function scrollAndPaginate(maxPages = 50) {
  console.log('%c[Pudú v4] 📜 Iniciando escaneo paginado resiliente…', 'color:#a855f7;font-weight:bold');

  // Asegurar vista de búsqueda
  if (!window.location.href.includes('#search')) {
    window.location.hash = '#search/has%3Aattachment';
    await sleep(2000);
  }

  let currentPage = 1;
  fullScan();
  reportProgress(currentPage, `Página 1 analizada — ${attachmentCache.size} adjuntos`);

  let consecutiveEmptyPages = 0;

  for (let p = 2; p <= maxPages; p++) {
    const prevCount = attachmentCache.size;
    const firstRowBefore = document.querySelector('tr.zA');
    const firstRowIdBefore = firstRowBefore ? (firstRowBefore.getAttribute('id') || firstRowBefore.innerText.slice(0, 30)) : '';

    reportProgress(p, `Cargando página ${p}... (${attachmentCache.size} adjuntos)`);
    console.log(`[Pudú v4] ➡️ Intentando avanzar a página ${p}...`);

    let navigated = false;

    // ESTRATEGIA 1: Clic en botón "Siguiente"
    const nextBtnInfo = findNextButton();
    if (nextBtnInfo.element && !nextBtnInfo.disabled) {
      console.log('[Pudú v4] 🖱️ Método 1: Clic en botón siguiente');
      robustClick(nextBtnInfo.element);
      
      // Esperar hasta 2.5s a que el DOM cambie
      for (let w = 0; w < 8; w++) {
        await sleep(300);
        const firstRowAfter = document.querySelector('tr.zA');
        const firstRowIdAfter = firstRowAfter ? (firstRowAfter.getAttribute('id') || firstRowAfter.innerText.slice(0, 30)) : '';
        if (firstRowIdAfter && firstRowIdAfter !== firstRowIdBefore) {
          navigated = true;
          console.log(`[Pudú v4] ✅ Navegación confirmada por cambio de DOM en ${(w+1)*300}ms`);
          break;
        }
      }
    }

    // ESTRATEGIA 2: Hash Router de Gmail si el botón falló
    if (!navigated) {
      console.log(`[Pudú v4] 🌐 Método 2: Hash router (#search/has:attachment/p${p})`);
      window.location.hash = `#search/has%3Aattachment/p${p}`;
      
      for (let w = 0; w < 6; w++) {
        await sleep(300);
        const firstRowAfter = document.querySelector('tr.zA');
        const firstRowIdAfter = firstRowAfter ? (firstRowAfter.getAttribute('id') || firstRowAfter.innerText.slice(0, 30)) : '';
        if (firstRowIdAfter && firstRowIdAfter !== firstRowIdBefore) {
          navigated = true;
          console.log(`[Pudú v4] ✅ Hash router confirmado en ${(w+1)*300}ms`);
          break;
        }
      }
    }

    // ESTRATEGIA 3: Scroll suave en la lista para forzar render
    window.scrollBy(0, 500);
    await sleep(400);

    // Escanear la nueva página
    fullScan();
    const newItemsFound = attachmentCache.size - prevCount;
    currentPage = p;

    console.log(`[Pudú v4] 📊 Página ${p}: +${newItemsFound} nuevos | Total acumulado: ${attachmentCache.size}`);
    reportProgress(p, `Página ${p} escaneada — ${attachmentCache.size} adjuntos en total`);

    if (newItemsFound === 0 && !navigated) {
      consecutiveEmptyPages++;
      if (consecutiveEmptyPages >= 2) {
        console.log(`[Pudú v4] 🏁 Fin de resultados alcanzado (sin nuevos datos tras 2 intentos).`);
        break;
      }
    } else {
      consecutiveEmptyPages = 0;
    }
  }

  reportProgress(currentPage, `✅ Escaneo completado: ${attachmentCache.size} adjuntos encontrados`);
  console.log(`%c[Pudú v4] 🎉 Fin del escaneo. Total: ${attachmentCache.size} adjuntos`, 'color:#10b981;font-weight:bold');
}

function firstRowSignature() {
  const row = document.querySelector('tr.zA, [role="main"] [role="row"]');
  return row ? (row.getAttribute('id') || row.getAttribute('data-legacy-thread-id') || row.innerText.slice(0, 80)) : '';
}

async function advanceSearchPage(page) {
  const before = firstRowSignature();
  const next = findNextButton();
  if (!next.element || next.disabled) return false;
  robustClick(next.element);

  for (let attempt = 0; attempt < 24; attempt++) {
    await sleep(250);
    const after = firstRowSignature();
    if (after && after !== before) return true;
  }

  // Gmail's hash router is a secondary fallback when an interface update swallows the click.
  window.location.hash = `#search/has%3Aattachment/p${page}`;
  for (let attempt = 0; attempt < 24; attempt++) {
    await sleep(250);
    const after = firstRowSignature();
    if (after && after !== before) return true;
  }
  return false;
}

async function scanOnePage(query, continuing) {
  if (!continuing || !scanState || scanState.query !== query) {
    attachmentCache.clear();
    scanState = { query, page: 0, done: false };
    if (window.location.hash !== '#search/has%3Aattachment') {
      window.location.hash = '#search/has%3Aattachment';
      await sleep(800);
    }
  }

  const rowsLoaded = await (async () => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (document.querySelector('tr.zA, [role="main"] [role="row"]')) return true;
      await sleep(400);
    }
    return false;
  })();
  if (!rowsLoaded) throw new Error('Gmail sigue cargando; el conector reintentará automáticamente.');

  if (scanState.page === 0) {
    scanState.page = 1;
  } else if (!await advanceSearchPage(scanState.page + 1)) {
    scanState.done = true;
  }

  if (!scanState.done) {
    fullScan();
    const next = findNextButton();
    scanState.done = !next.element || next.disabled;
  }

  reportProgress(scanState.page, scanState.done
    ? `Escaneo completado: ${attachmentCache.size} adjuntos encontrados`
    : `Página ${scanState.page} analizada — ${attachmentCache.size} adjuntos`);

  return {
    done: scanState.done,
    page: scanState.page,
    count: attachmentCache.size,
    attachments: scanState.done ? Array.from(attachmentCache.values()) : undefined,
  };
}

// ── Listener de mensajes ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GMAIL_READY') {
    sendResponse({ success: true, version: '2.4.0', count: attachmentCache.size });
    return false;
  }

  if (request.action === 'EXTRACT_ATTACHMENTS') {
    console.log('%c[Pudú v4] 📩 EXTRACT_ATTACHMENTS recibido', 'color:#f59e0b;font-weight:bold');

    scanOnePage(request.query || 'has:attachment', Boolean(request.continue))
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));

    return true; // Asíncrono
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
  setTimeout(() => fullScan(), 1500);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

})();
