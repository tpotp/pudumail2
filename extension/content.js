/**
 * PUDÚ MAIL 2 - CONTENT SCRIPT (GMAIL DOM SCANNER)
 * Intelligent extractor for Gmail Web attachments, chips, threads, and download URLs.
 */

console.log('%c[Pudú Mail Conector] 🦌 Activo en Gmail Web', 'color: #38bdf8; font-weight: bold;');

// Listen for background requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_ATTACHMENTS') {
    console.log('%c[Pudú Content] 🔍 Solicitud de escaneo recibida:', 'color: #f59e0b;', request);
    const attachments = extractGmailAttachments(request.query);
    console.log('%c[Pudú Content] ✅ Adjuntos encontrados:', 'color: #10b981; font-weight: bold;', attachments.length, attachments);
    sendResponse({ success: true, count: attachments.length, attachments: attachments });
  }
  return true;
});

/**
 * Extract attachments visible in the Gmail web interface
 */
function extractGmailAttachments(query) {
  const list = [];
  const seenKeys = new Set();

  try {
    // 1. Selector strategy A: Attachment Cards inside opened emails (div.aZo, div.hq, div[role="listitem"] attachment chips)
    const attachmentCards = document.querySelectorAll('div.aZo, div.hq, div.a3I, div[aria-label*="Adjunto:"], div[aria-label*="Attachment:"]');
    console.log('[Pudú Content] Tarjetas de adjunto encontradas en vista de correo:', attachmentCards.length);

    attachmentCards.forEach((card, idx) => {
      try {
        let filename = '';
        let mimeType = 'application/octet-stream';
        let downloadUrl = '';
        let sizeBytes = 1024 * 1024;
        let sizeFormatted = '1.0 MB';

        // Extract download_url attribute if present (MIME:filename:URL)
        const dlAttr = card.getAttribute('download_url') || card.querySelector('[download_url]')?.getAttribute('download_url') || '';
        if (dlAttr) {
          const parts = dlAttr.split(':');
          if (parts.length >= 3) {
            mimeType = parts[0] || mimeType;
            filename = decodeURIComponent(parts[1] || '');
            downloadUrl = parts.slice(2).join(':');
          }
        }

        // Search for direct download links <a>
        const linkEl = card.querySelector('a[href*="view=att"], a[href*="disp=attd"], a[href*="disp=inline"], a[download]');
        if (linkEl && linkEl.href) {
          downloadUrl = linkEl.href;
        }

        // Search for title/name
        const nameEl = card.querySelector('.aV3, .aQA, span[title], div[title], .a48');
        if (nameEl) {
          const text = nameEl.getAttribute('title') || nameEl.innerText || '';
          if (text.trim()) filename = text.trim();
        }

        // Search for size (e.g. "2.4 MB", "540 KB")
        const sizeEl = card.querySelector('.a44, span.aS2, .aV3 + span, .a49');
        if (sizeEl && sizeEl.innerText) {
          sizeFormatted = sizeEl.innerText.trim();
          sizeBytes = parseHumanSizeToBytes(sizeFormatted);
        }

        // Find parent email details
        const msgContainer = card.closest('div[role="listitem"], tr, div.nH');
        let sender = 'Remitente Gmail';
        let subject = 'Correo con adjunto';
        let date = new Date().toISOString();

        if (msgContainer) {
          const senderEl = msgContainer.querySelector('span[email], .yP, .zF, .bqe, .gD');
          if (senderEl) sender = senderEl.innerText || senderEl.getAttribute('email') || sender;

          const subjEl = document.querySelector('h2.hP, .bog, span[data-thread-perm-id]');
          if (subjEl) subject = subjEl.innerText || subject;
        }

        filename = sanitizeFilename(filename, idx + 1, mimeType);
        const key = filename + '_' + sizeBytes;

        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          list.push({
            id: `pudu_gmail_att_${idx}_${Date.now()}`,
            filename: filename,
            mimeType: mimeType,
            sizeBytes: sizeBytes,
            sizeFormatted: sizeFormatted || formatBytes(sizeBytes),
            sender: sender,
            subject: subject,
            date: date,
            downloadUrl: formatDownloadUrl(downloadUrl)
          });
        }
      } catch (err) {
        console.warn('[Pudú Content] Error procesando tarjeta:', err);
      }
    });

    // 2. Selector strategy B: Attachment Chips in Search / Inbox List View (e.g. search "has:attachment")
    const listChips = document.querySelectorAll('div.brs, span.brc, div[role="button"][aria-label*="."], div.y6 span[title*="."]');
    console.log('[Pudú Content] Chips de adjuntos en lista de correos:', listChips.length);

    listChips.forEach((chip, idx) => {
      try {
        let chipName = chip.getAttribute('aria-label') || chip.getAttribute('title') || chip.innerText || '';
        chipName = chipName.replace(/^(Archivo adjunto:|Attachment:)/i, '').trim();

        if (chipName && chipName.includes('.')) {
          const row = chip.closest('tr, div[role="row"], div.zA');
          let sender = 'Remitente';
          let subject = 'Correo con adjunto';
          let date = new Date().toISOString();

          if (row) {
            const senderEl = row.querySelector('.yP, .zF, .bqe, span[email]');
            if (senderEl) sender = senderEl.innerText || senderEl.getAttribute('email') || sender;

            const subjEl = row.querySelector('.bog, .bqe');
            if (subjEl) subject = subjEl.innerText || subject;

            const dateEl = row.querySelector('.xW, span[title]');
            if (dateEl) date = dateEl.innerText || date;
          }

          // Estimate realistic sizes based on extension if not in DOM
          const ext = chipName.split('.').pop().toLowerCase();
          let estimatedBytes = 2.4 * 1024 * 1024;
          if (['zip', 'rar', 'mp4', 'mov'].includes(ext)) estimatedBytes = 45 * 1024 * 1024;
          else if (['pdf', 'docx', 'xlsx'].includes(ext)) estimatedBytes = 3.8 * 1024 * 1024;
          else if (['jpg', 'png', 'webp'].includes(ext)) estimatedBytes = 1.6 * 1024 * 1024;

          const key = chipName + '_' + sender;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            list.push({
              id: `pudu_chip_${idx}_${Date.now()}`,
              filename: chipName,
              mimeType: getMimeFromFilename(chipName),
              sizeBytes: estimatedBytes,
              sizeFormatted: formatBytes(estimatedBytes),
              sender: sender,
              subject: subject,
              date: date,
              downloadUrl: '#'
            });
          }
        }
      } catch (e) {
        console.warn('[Pudú Content] Error procesando chip:', e);
      }
    });

  } catch (error) {
    console.error('[Pudú Content] Error general en extractGmailAttachments:', error);
  }

  return list;
}

function sanitizeFilename(filename, index, mimeType) {
  if (!filename || filename.startsWith('adjunto_') || filename.length < 3) {
    let ext = '.pdf';
    if (mimeType.includes('image')) ext = '.png';
    else if (mimeType.includes('video')) ext = '.mp4';
    else if (mimeType.includes('zip')) ext = '.zip';
    return `Documento_Adjunto_${index}${ext}`;
  }
  return filename;
}

function formatDownloadUrl(url) {
  if (!url || url === '#' || url.startsWith('http://localhost') || url.includes('mail2.vercel.app')) {
    return '#';
  }
  if (url.startsWith('/')) {
    return 'https://mail.google.com' + url;
  }
  if (url.startsWith('?')) {
    return 'https://mail.google.com/mail/u/0/' + url;
  }
  return url;
}

function getMimeFromFilename(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  if (ext === 'pdf') return 'application/pdf';
  if (['mp4', 'mov', 'webm'].includes(ext)) return `video/${ext}`;
  if (['zip', 'rar', '7z'].includes(ext)) return 'application/zip';
  return 'application/octet-stream';
}

function parseHumanSizeToBytes(str) {
  if (!str) return 1024 * 1024;
  const clean = str.toUpperCase().trim();
  const num = parseFloat(clean.replace(/[^0-9.]/g, '')) || 1;
  if (clean.includes('GB')) return Math.round(num * 1024 * 1024 * 1024);
  if (clean.includes('MB')) return Math.round(num * 1024 * 1024);
  if (clean.includes('KB') || clean.includes('K')) return Math.round(num * 1024);
  return Math.round(num);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
