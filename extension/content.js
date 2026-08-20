/**
 * PUDÚ MAIL 2 — GMAIL CONTENT SCRIPT (v3 — DOM Real)
 *
 * Selectores verificados directamente en el DOM de Gmail (agosto 2026):
 *   - Filas de email:         tr.zA
 *   - Chip de adjunto:        .brc  (tiene title="filename.ext")
 *   - Span del nombre:        .brc span
 *   - Imagen miniatura:       .brc img
 *   - Remitente:              .yX span (primera coincidencia)
 *   - Asunto:                 .bog  o  td.a4W span
 *   - Fecha:                  td.xW span
 *   - Botón "Siguiente pág":  div[aria-label="Resultados siguientes"]  (también .T-I-Js-Gs)
 *   - Tamaño real:            NO existe en vista de lista — solo en email abierto
 */

console.log('%c[Pudú Content v3] 🦌 Activo en Gmail', 'color:#38bdf8;font-weight:bold');

// ── Cache y dedup ─────────────────────────────────────────────────────
const attachmentCache = new Map(); // key = filename|sender, value = attachment

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

function dedupKey(filename, sender) {
  return `${(filename || '').toLowerCase().trim()}|${(sender || '').toLowerCase().trim()}`;
}

// ── Extrae remitente de una fila tr.zA ────────────────────────────────
function extractSender(row) {
  // span[email] es el más fiable
  const byEmail = row.querySelector('span[email]');
  if (byEmail) return byEmail.getAttribute('email') || byEmail.innerText || '';

  // Gmail classes para remitente: .yP (leído), .zF (no leído)
  const byClass = row.querySelector('span.yP, span.zF');
  if (byClass) return byClass.innerText || '';

  // Fallback: primer span en la celda de remitente
  const senderCell = row.querySelector('td.yX, td[role="gridcell"]:first-child');
  if (senderCell) {
    const span = senderCell.querySelector('span');
    if (span) return span.innerText || '';
  }

  return 'Gmail';
}

// ── Extrae asunto de una fila tr.zA ──────────────────────────────────
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

// ── Extrae fecha de una fila tr.zA ────────────────────────────────────
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

// ── Extrae miniatura de un chip .brc ─────────────────────────────────
function extractThumbnail(chip) {
  const img = chip.querySelector('img[src]');
  if (img && img.src && !img.src.includes('data:')) return img.src;
  return '';
}

// ── ESTRATEGIA PRINCIPAL: Escanear chips .brc en filas tr.zA ─────────
function scanListView() {
  const found = [];
  const rows = document.querySelectorAll('tr.zA');
  
  console.log(`[Pudú v3] 🔍 Encontradas ${rows.length} filas tr.zA en el DOM`);

  if (rows.length === 0) {
    console.warn('[Pudú v3] ⚠️ No se encontraron filas tr.zA. Posible problema: Gmail no está en vista de lista, o la URL no es has:attachment.');
    return found;
  }

  rows.forEach((row, rowIdx) => {
    const chips = row.querySelectorAll('.brc');

    if (chips.length === 0) return; // row without attachments

    const sender  = extractSender(row);
    const subject = extractSubject(row);
    const date    = extractDate(row);

    chips.forEach(chip => {
      // filename viene del atributo title del chip .brc
      let filename = chip.getAttribute('title') || '';
      if (!filename) {
        // fallback: texto del span dentro del chip
        const span = chip.querySelector('span');
        if (span) filename = span.innerText || '';
      }
      filename = filename.trim();

      if (!filename || !isFilename(filename)) {
        console.log(`[Pudú v3] ⏭️ Chip ignorado (no es archivo válido): "${filename}"`);
        return;
      }

      const thumbnailUrl = extractThumbnail(chip);
      const estBytes = estimateSize(filename);

      const item = {
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
      };

      console.log(`[Pudú v3] ✅ Adjunto encontrado: "${filename}" de "${sender}" | Tamaño estimado: ${item.sizeFormatted} | Miniatura: ${thumbnailUrl ? 'Sí' : 'No'}`);
      found.push(item);
    });
  });

  return found;
}

// ── ESTRATEGIA 2: Emails abiertos (tienen download_url y tamaño real) ─
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

    const mime     = raw.substring(0, i1);
    const filename = decodeURIComponent(rest.substring(0, i2));
    const url      = rest.substring(i2 + 1);
    if (!filename) return;

    // Busca tamaño real
    const parent = el.closest('[data-legacy-message-id], .aZo, .iX');
    let sizeText = '';
    if (parent) {
      const sizeEl = parent.querySelector('.aLF-aPX-My-a5j-J8, [class*="aLF"]');
      if (sizeEl) {
        sizeText = sizeEl.innerText.trim();
        console.log(`[Pudú v3] ✅ Tamaño REAL encontrado para "${filename}": ${sizeText}`);
      } else {
        parent.querySelectorAll('span').forEach(sp => {
          const t = (sp.innerText || '').trim();
          if (/^\d+(\.\d+)?\s*(KB|MB|GB|B)$/i.test(t)) sizeText = t;
        });
      }
    }

    const img = el.querySelector('img[src*="disp=th"], img[src*="googleusercontent"]');
    const thumbnailUrl = img ? img.src : '';

    const { sender, subject, date } = getOpenEmailContext();

    console.log(`[Pudú v3] ✅ Adjunto (email abierto): "${filename}" | Tamaño: ${sizeText || 'N/A'} | URL: ${url.substring(0,60)}…`);

    found.push({
      filename, mimeType: mime || guessMime(filename),
      downloadUrl: url || '#', thumbnailUrl,
      sizeBytes: parseSize(sizeText), sizeFormatted: sizeText || '—',
      sizeEstimated: !sizeText,
      sender, subject, date
    });
  });

  return found;
}

function getOpenEmailContext() {
  let sender = '', subject = '', date = '';
  const subjectEl = document.querySelector('h2.hP, [data-thread-perm-id] h2, h2[data-legacy-thread-id]');
  if (subjectEl) subject = subjectEl.innerText || '';
  const senderEl = document.querySelector('span[email], span.gD, [data-hovercard-id]');
  if (senderEl) sender = senderEl.getAttribute('email') || senderEl.innerText || '';
  const dateEl = document.querySelector('span.g3, span[title][aria-label]');
  if (dateEl) date = dateEl.getAttribute('title') || dateEl.innerText || '';
  return { sender: sender || 'Gmail', subject: subject || 'Correo', date: date || new Date().toISOString() };
}

// ── Merge en cache ─────────────────────────────────────────────────────
function mergeIntoCache(items) {
  let newCount = 0;
  items.forEach(item => {
    const key = dedupKey(item.filename, item.sender);
    if (!attachmentCache.has(key)) {
      attachmentCache.set(key, {
        id: `pudu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        ...item
      });
      newCount++;
    } else {
      // Enriquece datos existentes si tenemos más información
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

// ── Escaneo completo ─────────────────────────────────────────────────
function fullScan() {
  const t0 = performance.now();
  const fromList  = scanListView();
  const fromEmail = scanOpenedEmail();
  const n1 = mergeIntoCache(fromList);
  const n2 = mergeIntoCache(fromEmail);
  const ms = Math.round(performance.now() - t0);
  console.log(`[Pudú v3] ✅ Scan en ${ms}ms — Lista:${fromList.length}(+${n1}), Email:${fromEmail.length}(+${n2}), TOTAL:${attachmentCache.size}`);
  return Array.from(attachmentCache.values());
}

// ── Paginación + scroll ────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function reportProgress(page, message) {
  try {
    chrome.runtime.sendMessage({ action: 'SCAN_PROGRESS', count: attachmentCache.size, page, message }, () => {
      if (chrome.runtime.lastError) {} // silencioso
    });
  } catch(e) {}
}

async function scrollAndPaginate(maxPages = 50) {
  console.log('%c[Pudú v3] 📜 Iniciando paginación (hasta ' + maxPages + ' páginas)…', 'color:#a855f7;font-weight:bold');

  // Primero asegúrate de que Gmail esté en la vista has:attachment correcta
  if (!window.location.href.includes('#search')) {
    console.log('[Pudú v3] ⚠️ Gmail no está en vista de búsqueda. Navegando a has:attachment...');
    window.location.hash = '#search/has%3Aattachment';
    await sleep(3000);
  }

  let page = 1;
  fullScan();
  reportProgress(page, `Página ${page} escaneada — ${attachmentCache.size} adjuntos`);

  for (let i = 0; i < maxPages; i++) {
    const prevSize = attachmentCache.size;

    // Obtener los botones de paginación
    const nextBtn = document.querySelector(
      'div[aria-label="Resultados siguientes"], div[aria-label="Older"], div[aria-label="Más antiguos"], div[aria-label="Suivant"], .T-I-Js-Gs:not([aria-disabled="true"]):last-child'
    );

    if (!nextBtn) {
      console.log(`[Pudú v3] 🏁 No se encontró botón de siguiente página. Fin.`);
      break;
    }

    const isDisabled = nextBtn.getAttribute('aria-disabled') === 'true' ||
                       nextBtn.classList.contains('T-I-JE') ||
                       nextBtn.getAttribute('disabled') !== null;

    if (isDisabled) {
      console.log(`[Pudú v3] 🏁 Botón siguiente deshabilitado. Fin de la paginación.`);
      break;
    }

    // Guarda estado actual para saber si cambió
    const firstRow = document.querySelector('tr.zA');
    const firstRowId = firstRow ? firstRow.getAttribute('id') : '';
    
    // Obtener el texto de paginación actual (ej. "1-50 de 100")
    const pagSpan = document.querySelector('.ts');
    const pagText = pagSpan ? pagSpan.innerText : '';

    page++;
    console.log(`[Pudú v3] ➡️ Avanzando a página ${page}… (Texto actual: ${pagText})`);
    reportProgress(page, `Cargando página ${page}...`);
    
    // Función auxiliar para intentar avanzar
    let pageChanged = false;
    let attempts = 0;

    while (attempts < 3 && !pageChanged) {
      attempts++;
      console.log(`[Pudú v3] 🖱️ Clic en Siguiente (Intento ${attempts})`);
      nextBtn.click();

      // Espera activa hasta 6 segundos por intento
      let waited = 0;
      while (waited < 6000) {
        await sleep(300);
        waited += 300;
        
        const currentFirstRow = document.querySelector('tr.zA');
        const currentId = currentFirstRow ? currentFirstRow.getAttribute('id') : '';
        const currentPagSpan = document.querySelector('.ts');
        const currentPagText = currentPagSpan ? currentPagSpan.innerText : '';

        if ((currentId && currentId !== firstRowId) || (currentPagText && currentPagText !== pagText)) {
          console.log(`[Pudú v3] ✅ Nueva página detectada (Cambió ID o Texto de paginación)`);
          pageChanged = true;
          break;
        }
      }
    }

    if (!pageChanged) {
      console.log(`[Pudú v3] ⚠️ La página no cambió después de 3 intentos. Forzando fin.`);
      break;
    }

    await sleep(800); // margen extra para renderizado de chips e imágenes
    fullScan();
    console.log(`[Pudú v3] 📊 Página ${page}: ${attachmentCache.size - prevSize} nuevos, total: ${attachmentCache.size}`);
    reportProgress(page, `Página ${page} escaneada — ${attachmentCache.size} adjuntos en total`);
  }

  reportProgress(page, `✅ Escaneo completo: ${attachmentCache.size} adjuntos encontrados en ${page} páginas`);
  console.log(`%c[Pudú v3] 🎉 Paginación terminada. Total: ${attachmentCache.size} adjuntos en ${page} páginas`, 'color:#10b981;font-weight:bold');
}

// ── Observer ────────────────────────────────────────────────────────
let observerActive = false;
function startObserver() {
  if (observerActive) return;
  observerActive = true;
  const obs = new MutationObserver(() => {
    clearTimeout(obs._t);
    obs._t = setTimeout(() => fullScan(), 500);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  console.log('[Pudú v3] 👁️ MutationObserver activo');
}

// ── Listener de mensajes ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_ATTACHMENTS') {
    console.log('%c[Pudú v3] 📩 EXTRACT_ATTACHMENTS recibido', 'color:#f59e0b;font-weight:bold');

    // Smart wait for Gmail to render the rows
    const waitForRows = async (maxAttempts = 40) => { // 40 * 500ms = 20 seconds max
      console.log(`[Pudú v3] ⏳ Esperando que Gmail cargue los correos...`);
      for (let i = 0; i < maxAttempts; i++) {
        const rows = document.querySelectorAll('tr.zA');
        if (rows.length > 0) {
          console.log(`[Pudú v3] ✅ Correos cargados en DOM después de ${i * 500}ms`);
          return true;
        }
        await sleep(500);
      }
      return false; // Timeout
    };

    waitForRows().then((loaded) => {
      if (!loaded) {
        console.warn(`[Pudú v3] ⏰ Timeout esperando a que Gmail cargue la bandeja.`);
        sendResponse({ success: true, count: 0, attachments: [] });
        return;
      }

      if (request.autoScroll === false) {
        // Modo rápido sin scroll
        const results = fullScan();
        sendResponse({ success: true, count: results.length, attachments: results });
        return;
      }

      // Modo completo con paginación
      scrollAndPaginate(50).then(() => {
        const final = Array.from(attachmentCache.values());
        console.log(`%c[Pudú v3] 🎯 FINAL: ${final.length} adjuntos`, 'color:#10b981;font-weight:bold');
        sendResponse({ success: true, count: final.length, attachments: final });
      });
    });

    return true; // async
  }

  if (request.action === 'GET_CACHE_SIZE') {
    sendResponse({ count: attachmentCache.size });
    return false;
  }
});

// ── Init ─────────────────────────────────────────────────────────────
function init() {
  startObserver();
  setTimeout(() => {
    fullScan();
    console.log(`[Pudú v3] 🚀 Escaneo inicial: ${attachmentCache.size} adjuntos`);
  }, 2000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
