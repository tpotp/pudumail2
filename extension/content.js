/**
 * PUDÚ MAIL 2 — GMAIL CONTENT SCRIPT (v2)
 *
 * Architecture:
 *   1. A persistent MutationObserver watches the Gmail DOM for attachment
 *      elements as the user navigates (SPA transitions, scrolling, opening
 *      emails). Extracted items are stored in `attachmentCache`.
 *   2. On EXTRACT_ATTACHMENTS request from background.js:
 *      a) Return whatever is already cached.
 *      b) Kick off a deep DOM scan + optional auto-scroll to collect more.
 *      c) Return combined results.
 *
 * Selector strategy:
 *   - Prefer aria-label, role, title, download attributes (stable across
 *     Gmail updates) over obfuscated class names.
 *   - Use class names only as a secondary hint, never as the sole selector.
 */

console.log('%c[Pudú Content v2] 🦌 Activo en Gmail', 'color:#38bdf8;font-weight:bold');

// ── Attachment Cache ────────────────────────────────────────────────
const attachmentCache = new Map(); // key = dedup string, value = attachment object

// ── Helpers ─────────────────────────────────────────────────────────
const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|odt|zip|rar|7z|gz|tar|jpg|jpeg|png|gif|webp|svg|bmp|ico|mp4|mov|avi|mkv|webm|mp3|wav|ogg|flac|aac|eml|msg|ics|html?|xml|json|apk|exe|dmg|iso)$/i;

function isLikelyFilename(str) {
  if (!str || str.length < 3 || str.length > 260) return false;
  return FILE_EXT_RE.test(str.trim());
}

function getExtension(filename) {
  const m = filename.match(/\.([a-zA-Z0-9]{1,10})$/);
  return m ? m[1].toLowerCase() : '';
}

function guessMimeType(filename) {
  const ext = getExtension(filename);
  const map = {
    pdf: 'application/pdf',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv', txt: 'text/plain', rtf: 'application/rtf', html: 'text/html',
    zip: 'application/zip', rar: 'application/x-rar-compressed', '7z': 'application/x-7z-compressed', gz: 'application/gzip', tar: 'application/x-tar',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac',
    eml: 'message/rfc822', ics: 'text/calendar', json: 'application/json', xml: 'application/xml',
    apk: 'application/vnd.android.package-archive', exe: 'application/x-msdownload', dmg: 'application/x-apple-diskimage', iso: 'application/x-iso9660-image'
  };
  return map[ext] || 'application/octet-stream';
}

function parseHumanSize(str) {
  if (!str) return 0;
  const clean = str.toUpperCase().replace(/\s/g, '');
  const num = parseFloat(clean.replace(/[^0-9.]/g, '')) || 0;
  if (clean.includes('GB')) return Math.round(num * 1073741824);
  if (clean.includes('MB')) return Math.round(num * 1048576);
  if (clean.includes('KB') || clean.includes('K')) return Math.round(num * 1024);
  if (num > 0) return Math.round(num);
  return 0;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '—';
  const k = 1024;
  const s = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + s[i];
}

function dedupKey(filename, sender) {
  return `${(filename || '').toLowerCase().trim()}|${(sender || '').toLowerCase().trim()}`;
}

// Estimate realistic file sizes by extension when Gmail DOM doesn't show them
function estimateSizeByExtension(filename) {
  const ext = getExtension(filename);
  const estimates = {
    // Videos — typically large
    mp4: 45*1048576, mov: 60*1048576, avi: 80*1048576, mkv: 55*1048576, webm: 30*1048576,
    // Images — medium
    jpg: 2.2*1048576, jpeg: 2.2*1048576, png: 3.5*1048576, gif: 1.8*1048576, webp: 1.2*1048576,
    svg: 120*1024, bmp: 5*1048576, heic: 2.8*1048576,
    // Archives — large
    zip: 25*1048576, rar: 30*1048576, '7z': 20*1048576, gz: 15*1048576, tar: 40*1048576,
    // Documents
    pdf: 3.8*1048576, doc: 1.5*1048576, docx: 2*1048576,
    xls: 2.5*1048576, xlsx: 3*1048576, ppt: 8*1048576, pptx: 10*1048576,
    csv: 800*1024, txt: 50*1024, rtf: 500*1024,
    // Audio
    mp3: 5*1048576, wav: 30*1048576, ogg: 4*1048576, flac: 25*1048576, aac: 4*1048576,
    // Other
    eml: 500*1024, html: 200*1024, json: 100*1024, xml: 150*1024,
    apk: 50*1048576, exe: 30*1048576, dmg: 100*1048576, iso: 700*1048576
  };
  return Math.round(estimates[ext] || 1*1048576);
}

// ── Strategy 1: Opened-email attachment cards ────────────────────────
// When a user opens an email, Gmail renders attachment "cards" (thumbnails).
// These are the richest source of data: they contain download_url, filename,
// size, and a direct download link.
function extractFromOpenedEmail() {
  const found = [];

  // 1a) Elements with download_url attribute (most reliable in email view)
  //     Format: "mime/type:filename:https://mail.google.com/…"
  document.querySelectorAll('[download_url]').forEach(el => {
    const raw = el.getAttribute('download_url');
    if (!raw) return;
    const colonIdx1 = raw.indexOf(':');
    if (colonIdx1 === -1) return;
    const rest = raw.substring(colonIdx1 + 1);
    const colonIdx2 = rest.indexOf(':');
    if (colonIdx2 === -1) return;

    const mime = raw.substring(0, colonIdx1);
    const filename = decodeURIComponent(rest.substring(0, colonIdx2));
    const url = rest.substring(colonIdx2 + 1);

    if (!filename) return;

    // Try to find a size label nearby (including the exact class specified by user)
    let sizeText = '';
    const sizeEl = parent ? parent.querySelector('.aLF-aPX-My-a5j-J8') : null;
    if (sizeEl) {
      sizeText = sizeEl.innerText.trim();
    } else if (parent) {
      const allSpans = parent.querySelectorAll('span');
      allSpans.forEach(sp => {
        const t = sp.innerText || '';
        if (/^\d+(\.\d+)?\s*(KB|MB|GB|B)$/i.test(t.trim())) {
          sizeText = t.trim();
        }
      });
    }

    // Try to find a thumbnail image
    let thumbnailUrl = '';
    const img = el.querySelector('img[src*="disp=th"], img[src*="googleusercontent"]');
    if (img) thumbnailUrl = img.src;

    // Context: sender + subject from the open email
    const { sender, subject, date } = getOpenEmailContext(el);

    found.push({
      filename, mimeType: mime || guessMimeType(filename),
      downloadUrl: url || '#',
      thumbnailUrl, // Nuevo campo
      sizeBytes: parseHumanSize(sizeText), sizeFormatted: sizeText || '—',
      sizeEstimated: false,
      sender, subject, date
    });
  });

  // 1b) <a> elements with href containing attachment download params
  document.querySelectorAll('a[href*="view=att"], a[href*="disp=attd"], a[download]').forEach(a => {
    let filename = a.getAttribute('download') || a.getAttribute('aria-label') || a.innerText || '';
    filename = filename.trim();
    if (!filename || !isLikelyFilename(filename)) {
      // Try title or nearby span
      const titleEl = a.closest('[title]') || a.querySelector('[title]');
      if (titleEl) filename = titleEl.getAttribute('title');
    }
    if (!filename || filename.length < 2) return;

    const { sender, subject, date } = getOpenEmailContext(a);

    found.push({
      filename, mimeType: guessMimeType(filename),
      downloadUrl: a.href || '#',
      sizeBytes: 0, sizeFormatted: '—',
      sender, subject, date
    });
  });

  // 1c) Elements with aria-label that looks like a filename (attachment cards)
  document.querySelectorAll('[aria-label]').forEach(el => {
    const label = el.getAttribute('aria-label') || '';
    // Clean common prefixes Gmail adds
    let cleaned = label
      .replace(/^(Adjunto|Attachment|Archivo adjunto|Descargar|Download|Preview|Vista previa)[:\s]*/i, '')
      .trim();

    if (!isLikelyFilename(cleaned)) return;

    // Avoid duplicates from download_url elements
    const hasDownloadUrl = el.querySelector('[download_url]') || el.closest('[download_url]');
    if (hasDownloadUrl) return;

    // Look for size nearby (including exact class)
    let sizeText = '';
    const sizeEl = el.querySelector('.aLF-aPX-My-a5j-J8') || el.parentElement?.querySelector('.aLF-aPX-My-a5j-J8');
    if (sizeEl) {
      sizeText = sizeEl.innerText.trim();
    } else {
      const spans = el.querySelectorAll('span');
      spans.forEach(sp => {
        const t = (sp.innerText || '').trim();
        if (/^\d+(\.\d+)?\s*(KB|MB|GB|B)$/i.test(t)) sizeText = t;
      });
    }

    // Look for a download link
    let downloadUrl = '#';
    const link = el.querySelector('a[href*="mail.google.com"], a[href*="googleusercontent"]');
    if (link) downloadUrl = link.href;

    // Look for a thumbnail
    let thumbnailUrl = '';
    const img = el.querySelector('img[src*="disp=th"], img[src*="googleusercontent"]');
    if (img) thumbnailUrl = img.src;

    const { sender, subject, date } = getOpenEmailContext(el);

    found.push({
      filename: cleaned, mimeType: guessMimeType(cleaned),
      downloadUrl, thumbnailUrl, 
      sizeBytes: parseHumanSize(sizeText), sizeFormatted: sizeText || '—',
      sizeEstimated: false,
      sender, subject, date
    });
  });

  return found;
}

function getOpenEmailContext(el) {
  let sender = '', subject = '', date = '';

  // Try to find the open email header
  // Subject is usually in h2 or an element with data-thread-perm-id
  const subjectEl = document.querySelector('h2[data-thread-perm-id], h2.hP, div.ha h2, [data-legacy-thread-id] h2');
  if (subjectEl) subject = subjectEl.innerText || '';
  if (!subject) {
    const h2s = document.querySelectorAll('h2');
    for (const h of h2s) {
      const t = (h.innerText || '').trim();
      if (t.length > 3 && t.length < 200) { subject = t; break; }
    }
  }

  // Sender: look for [email] attribute or gD class
  const senderEl = document.querySelector('span[email], span.gD, span.go, [data-hovercard-id]');
  if (senderEl) {
    sender = senderEl.getAttribute('email') || senderEl.getAttribute('data-hovercard-id') || senderEl.innerText || '';
  }

  // Date: look for date spans near the email header
  const dateEl = document.querySelector('span.g3, span[title][aria-label]');
  if (dateEl) date = dateEl.getAttribute('title') || dateEl.innerText || '';

  return {
    sender: sender || 'Gmail',
    subject: subject || 'Correo',
    date: date || new Date().toISOString()
  };
}

// ── Strategy 2: Inbox / search list view attachment chips ────────────
// In the email list (inbox, search results), Gmail shows small attachment
// chips with the file name. These don't have download URLs but give us
// metadata.
function extractFromListView() {
  const found = [];

  // 2a) Scan every table row in the inbox/search list
  const rows = document.querySelectorAll('tr.zA, tr[role="row"], div[role="row"], tr');

  rows.forEach(row => {
    // Skip rows that are clearly not email rows
    if (!row.querySelector('td, div[role="gridcell"]')) return;

    // Find attachment chips within this row
    // Gmail wraps attachment chips in small spans/divs; they usually have
    // the filename as their text content and/or in aria-label/title.
    const chipCandidates = row.querySelectorAll(
      'span[title], span[aria-label], div[title], div[data-tooltip]'
    );

    let sender = '';
    let subject = '';
    let date = '';

    // Extract sender
    const senderEl = row.querySelector('span[email], span.bA4, span.yP, span.zF, span.yW span[email], [data-hovercard-id]');
    if (senderEl) sender = senderEl.getAttribute('email') || senderEl.innerText || '';
    if (!sender) {
      // Try first <span> in the sender column
      const nameSpan = row.querySelector('td.yX span, td.xY span, div.yW span');
      if (nameSpan) sender = nameSpan.innerText || '';
    }

    // Extract subject
    const subjectEl = row.querySelector('span.bog, span.bqe, span.y2, td.xY span.y2');
    if (subjectEl) subject = subjectEl.innerText || '';
    if (!subject) {
      // Fallback: look for the biggest text span in the row
      const spans = row.querySelectorAll('span');
      let maxLen = 0;
      spans.forEach(s => {
        const t = (s.innerText || '').trim();
        if (t.length > maxLen && t.length > 5 && t.length < 200 && !t.includes('@') && !isLikelyFilename(t)) {
          maxLen = t.length;
          subject = t;
        }
      });
    }

    // Extract date
    const dateEl = row.querySelector('td.xW span, span.bq3, span[title]');
    if (dateEl) {
      const title = dateEl.getAttribute('title') || '';
      date = title || dateEl.innerText || '';
    }

    // Now check each candidate for filenames
    chipCandidates.forEach(chip => {
      const label = chip.getAttribute('title') || chip.getAttribute('aria-label') || chip.getAttribute('data-tooltip') || chip.innerText || '';
      const cleaned = label
        .replace(/^(Adjunto|Attachment|Archivo adjunto)[:\s]*/i, '')
        .trim();

      if (isLikelyFilename(cleaned)) {
        // Try to find the exact size element near the chip
        // Gmail sometimes puts it in `.aLF-aPX-My-a5j-J8` or a span next to it
        let sizeText = '';
        const parentRow = chip.closest('td, div[role="gridcell"]');
        if (parentRow) {
          const sizeEl = parentRow.querySelector('.aLF-aPX-My-a5j-J8');
          if (sizeEl) {
            sizeText = sizeEl.innerText.trim();
          } else {
            // Check spans for KB/MB
            parentRow.querySelectorAll('span').forEach(sp => {
              const t = (sp.innerText || '').trim();
              if (/^\d+(\.\d+)?\s*(KB|MB|GB|B)$/i.test(t)) {
                sizeText = t;
              }
            });
          }
        }

        const estSize = estimateSizeByExtension(cleaned);
        const finalSizeText = sizeText ? sizeText : '~' + formatBytes(estSize);
        const finalSizeBytes = sizeText ? parseHumanSize(sizeText) : estSize;
        const isEstimated = !sizeText;

        if (isEstimated) {
           console.log(`[Pudú Debug] Chip encontrado: "${cleaned}". ⚠️ No se encontró la clase de peso real. Usando estimado: ${finalSizeText}`);
        } else {
           console.log(`[Pudú Debug] Chip encontrado: "${cleaned}". ✅ Peso real extraído: ${finalSizeText}`);
        }

        found.push({
          filename: cleaned,
          mimeType: guessMimeType(cleaned),
          downloadUrl: '#', // No direct URL in list view
          sizeBytes: finalSizeBytes,
          sizeFormatted: finalSizeText,
          sizeEstimated: isEstimated,
          sender: sender || 'Gmail',
          subject: subject || 'Correo',
          date: date || new Date().toISOString()
        });
      }
    });

    // 2b) Also look for chips that are just visible text matching file patterns
    // (some Gmail themes render chips as plain text spans)
    const allTextNodes = row.querySelectorAll('span, div');
    allTextNodes.forEach(node => {
      const text = (node.innerText || '').trim();
      if (text.length >= 4 && text.length <= 100 && isLikelyFilename(text)) {
        // Check we haven't already found this
        const existsAlready = found.some(f => f.filename.toLowerCase() === text.toLowerCase() && f.sender === (sender || 'Gmail'));
        if (!existsAlready) {
          const estSize = estimateSizeByExtension(text);
          found.push({
            filename: text,
            mimeType: guessMimeType(text),
            downloadUrl: '#',
            sizeBytes: estSize,
            sizeFormatted: '~' + formatBytes(estSize),
            sizeEstimated: true,
            sender: sender || 'Gmail',
            subject: subject || 'Correo',
            date: date || new Date().toISOString()
          });
        }
      }
    });
  });

  return found;
}

// ── Strategy 3: Deep generic scan ────────────────────────────────────
// Last resort: walk the entire document looking for anything that looks
// like a filename.
function extractGenericDeepScan() {
  const found = [];
  const seen = new Set();

  // Look for ALL elements with title/aria-label/download attributes
  const candidates = document.querySelectorAll(
    '[title], [aria-label], [download], [download_url], a[href*="view=att"], a[href*="disp=attd"]'
  );

  candidates.forEach(el => {
    const attrs = [
      el.getAttribute('title'),
      el.getAttribute('aria-label'),
      el.getAttribute('download'),
    ].filter(Boolean);

    attrs.forEach(raw => {
      const cleaned = raw
        .replace(/^(Adjunto|Attachment|Archivo adjunto|Descargar|Download|Preview|Vista previa)[:\s]*/i, '')
        .trim();

      if (isLikelyFilename(cleaned) && !seen.has(cleaned.toLowerCase())) {
        seen.add(cleaned.toLowerCase());

        let url = '#';
        if (el.tagName === 'A' && el.href) url = el.href;
        const nearLink = el.querySelector('a[href]');
        if (nearLink && nearLink.href.includes('mail.google.com')) url = nearLink.href;

        const estSize = estimateSizeByExtension(cleaned);
        found.push({
          filename: cleaned,
          mimeType: guessMimeType(cleaned),
          downloadUrl: url,
          sizeBytes: estSize,
          sizeFormatted: '~' + formatBytes(estSize),
          sizeEstimated: true,
          sender: 'Gmail',
          subject: 'Correo',
          date: new Date().toISOString()
        });
      }
    });
  });

  return found;
}

// ── Merge into cache ─────────────────────────────────────────────────
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
      // Update fields if we got richer data (e.g., download URL or size)
      const existing = attachmentCache.get(key);
      if (item.downloadUrl && item.downloadUrl !== '#' && (!existing.downloadUrl || existing.downloadUrl === '#')) {
        existing.downloadUrl = item.downloadUrl;
      }
      if (item.thumbnailUrl && (!existing.thumbnailUrl)) {
        existing.thumbnailUrl = item.thumbnailUrl;
      }
      if (item.sizeBytes > 0 && existing.sizeBytes === 0) {
        existing.sizeBytes = item.sizeBytes;
        existing.sizeFormatted = item.sizeFormatted;
        existing.sizeEstimated = false;
      }
      if (item.subject && item.subject !== 'Correo' && existing.subject === 'Correo') {
        existing.subject = item.subject;
      }
    }
  });
  return newCount;
}

// ── Full scan (runs all strategies) ──────────────────────────────────
function runFullScan() {
  console.log('%c[Pudú Content v2] 🔍 Ejecutando escaneo completo…', 'color:#f59e0b;font-weight:bold');

  const t0 = performance.now();

  const fromEmail = extractFromOpenedEmail();
  const fromList = extractFromListView();
  const fromDeep = extractGenericDeepScan();

  const newFromEmail = mergeIntoCache(fromEmail);
  const newFromList = mergeIntoCache(fromList);
  const newFromDeep = mergeIntoCache(fromDeep);

  const elapsed = Math.round(performance.now() - t0);

  console.log(
    `%c[Pudú Content v2] ✅ Escaneo completo en ${elapsed}ms — ` +
    `Email abierto: ${fromEmail.length} (${newFromEmail} nuevos), ` +
    `Lista inbox: ${fromList.length} (${newFromList} nuevos), ` +
    `Deep scan: ${fromDeep.length} (${newFromDeep} nuevos), ` +
    `Total en caché: ${attachmentCache.size}`,
    'color:#10b981;font-weight:bold'
  );

  return Array.from(attachmentCache.values());
}

// ── Auto-scroll and Pagination to load more rows ───────────────────────
async function scrollAndCollect(maxScrolls = 50) {
  console.log('%c[Pudú Content v2] 📜 Auto-scroll y paginación para cargar más correos…', 'color:#a855f7;');

  const scrollContainer = document.querySelector('div.AO, div[role="main"], div.nH.oy8Mbf') || document.querySelector('.aeF');
  if (!scrollContainer) {
    console.log('[Pudú Content v2] No se encontró contenedor scrolleable principal, intentaremos paginar de todos modos.');
  }

  let currentPage = 1;

  for (let i = 0; i < maxScrolls; i++) {
    const prevSize = attachmentCache.size;
    
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollTop + 800;
      // Simula eventos de scroll para activar el lazy load de Gmail
      scrollContainer.dispatchEvent(new Event('scroll'));
    }
    
    await sleep(800);
    runFullScan();
    reportProgress(currentPage, `Extrayendo datos de la página ${currentPage}... (${attachmentCache.size} adjuntos)`);

    // If no new items were found from scrolling, try clicking the "Older" (Next page) button
    if (attachmentCache.size === prevSize || (i > 0 && i % 4 === 0)) {
      const nextBtn = document.querySelector('[data-tooltip="Older"], [aria-label="Older"], [data-tooltip="Más antiguos"], [aria-label="Más antiguos"], [data-tooltip*="ntiguos"], [aria-label*="ntiguos"]');
      
      if (nextBtn && nextBtn.getAttribute('aria-disabled') !== 'true') {
        currentPage++;
        console.log(`[Pudú Content v2] Paginando a la siguiente página ${currentPage} (Paso ${i + 1})...`);
        reportProgress(currentPage, `Navegando a la página ${currentPage}...`);
        nextBtn.click();
        await sleep(2500); // Wait for the new page to load via AJAX
        runFullScan();
      } else {
        if (i > 3 && attachmentCache.size === prevSize) {
          console.log(`[Pudú Content v2] Auto-scroll detenido (no hay más páginas ni datos) en paso ${i + 1}`);
          break;
        }
      }
    }
  }

  // Scroll back to top
  if (scrollContainer) scrollContainer.scrollTop = 0;
  reportProgress(currentPage, `Escaneo completado. Procesando ${attachmentCache.size} resultados...`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── MutationObserver (persistent background scanning) ────────────────
let observerActive = false;
function startObserver() {
  if (observerActive) return;
  observerActive = true;

  const observer = new MutationObserver(mutations => {
    let hasRelevant = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            // Quick check: does this subtree contain anything attachment-related?
            if (node.querySelector?.('[download_url], [aria-label], a[href*="view=att"]') ||
                node.getAttribute?.('download_url') ||
                (node.getAttribute?.('aria-label') && isLikelyFilename(node.getAttribute('aria-label')))) {
              hasRelevant = true;
              break;
            }
          }
        }
      }
      if (hasRelevant) break;
    }

    if (hasRelevant) {
      // Debounce: wait 300ms after last mutation batch
      clearTimeout(observer._debounce);
      observer._debounce = setTimeout(() => {
        const newItems = runFullScan();
        console.log(`[Pudú Content v2] 👁️ Observer detectó cambios — caché ahora: ${attachmentCache.size}`);
      }, 300);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log('%c[Pudú Content v2] 👁️ MutationObserver iniciado', 'color:#38bdf8;');
}

function reportProgress(page, message) {
  chrome.runtime.sendMessage({
    action: 'SCAN_PROGRESS',
    count: attachmentCache.size,
    page: page,
    message: message || `Escaneando página ${page}...`
  }, () => {
    // ignore response or errors if nobody is listening
    if (chrome.runtime.lastError) {} 
  });
}

// ── Message handler (from background.js) ─────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_ATTACHMENTS') {
    console.log('%c[Pudú Content v2] 📩 Solicitud de extracción recibida', 'color:#f59e0b;font-weight:bold;', request);

    // Run a full scan immediately
    runFullScan();
    reportProgress(1, 'Iniciando escaneo...');

    if (request.autoScroll !== false) {
      // Do async scroll+scan and pagination, then send updated results
      scrollAndCollect(50).then(() => {
        const finalResults = Array.from(attachmentCache.values());
        console.log(`%c[Pudú Content v2] 🎯 Resultado final tras auto-scroll y paginación: ${finalResults.length} adjuntos`, 'color:#10b981;font-weight:bold;');
        sendResponse({ success: true, count: finalResults.length, attachments: finalResults });
      });
      return true; // keep channel open for async
    }

    const results = Array.from(attachmentCache.values());
    console.log(`%c[Pudú Content v2] 🎯 Resultado inmediato: ${results.length} adjuntos`, 'color:#10b981;font-weight:bold;');
    sendResponse({ success: true, count: results.length, attachments: results });
    return false;
  }

  if (request.action === 'GET_CACHE_SIZE') {
    sendResponse({ count: attachmentCache.size });
    return false;
  }
});

// ── Initialization ───────────────────────────────────────────────────
// Run initial scan after Gmail finishes loading
function initialize() {
  startObserver();
  // Delay initial scan to let Gmail render
  setTimeout(() => {
    runFullScan();
    console.log(`%c[Pudú Content v2] 🚀 Escaneo inicial completado — ${attachmentCache.size} adjuntos encontrados`, 'color:#10b981;font-weight:bold;');
  }, 2000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initialize();
} else {
  document.addEventListener('DOMContentLoaded', initialize);
}
