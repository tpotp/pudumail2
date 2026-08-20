/**
 * PUDÚ MAIL 2 - CONTENT SCRIPT
 * Injected into mail.google.com to inspect attachments and provide seamless connector bridge.
 */

console.log('[Pudú Mail Conector] Activo en Gmail Web');

// Listen for background requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_ATTACHMENTS') {
    const attachments = extractGmailAttachments(request.query);
    sendResponse({ success: true, count: attachments.length, attachments: attachments });
  }
  return true;
});

/**
 * Extract attachments visible in the Gmail web interface
 */
function extractGmailAttachments(query) {
  const list = [];
  const seenIds = new Set();

  try {
    // 1. Find attachment chips and download elements in Gmail DOM
    const attachmentElements = document.querySelectorAll('div[role="listitem"] span[download_url], div.aZo, div[aria-label*="Adjunto"], div[aria-label*="Attachment"], div.hq, div.a3I');

    attachmentElements.forEach((el, index) => {
      try {
        const downloadAttr = el.getAttribute('download_url') || '';
        let mimeType = 'application/octet-stream';
        let filename = 'adjunto_' + (index + 1);
        let downloadUrl = '';

        if (downloadAttr) {
          const parts = downloadAttr.split(':');
          if (parts.length >= 3) {
            mimeType = parts[0] || mimeType;
            filename = decodeURIComponent(parts[1] || filename);
            downloadUrl = parts.slice(2).join(':');
          }
        }

        // Try extracting text/name from inner elements
        const nameEl = el.querySelector('.aV3, .aQA, span[title], span');
        if (nameEl && nameEl.innerText && (!filename || filename.startsWith('adjunto_'))) {
          filename = nameEl.innerText.trim();
        }

        // Try extracting size text (e.g. "2.4 MB", "540 KB")
        const sizeEl = el.querySelector('.a44, span.aS2, .aV3 + span');
        let sizeBytes = 1024 * 1024; // Default estimate 1MB
        let sizeText = '1.0 MB';

        if (sizeEl && sizeEl.innerText) {
          sizeText = sizeEl.innerText.trim();
          sizeBytes = parseHumanSizeToBytes(sizeText);
        }

        // Find parent message info
        const messageRow = el.closest('tr, div[role="main"], div.nH');
        let sender = 'Gmail User';
        let subject = 'Correo con adjunto';
        let date = new Date().toISOString();

        if (messageRow) {
          const senderEl = messageRow.querySelector('span[email], .yP, .zF, .bqe');
          if (senderEl) sender = senderEl.innerText || senderEl.getAttribute('email') || sender;

          const subjEl = messageRow.querySelector('.bog, .hP, span[data-thread-perm-id]');
          if (subjEl) subject = subjEl.innerText || subject;
        }

        const id = 'pudu_att_' + index + '_' + Math.random().toString(36).substring(2, 9);
        if (!seenIds.has(filename + sizeBytes)) {
          seenIds.add(filename + sizeBytes);
          list.push({
            id: id,
            filename: filename,
            mimeType: mimeType,
            sizeBytes: sizeBytes,
            sizeFormatted: sizeText || formatBytes(sizeBytes),
            sender: sender,
            subject: subject,
            date: date,
            downloadUrl: downloadUrl || window.location.href
          });
        }
      } catch (err) {
        console.warn('[Pudú] Error parseando elemento de adjunto:', err);
      }
    });

    // If DOM extraction returned few items, generate helpful sample items or scanned entries
    if (list.length === 0) {
      console.log('[Pudú] Escaneo DOM completado. Listo para recibir más adjuntos al navegar por correos.');
    }

  } catch (error) {
    console.error('[Pudú] Error en extractGmailAttachments:', error);
  }

  return list;
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
