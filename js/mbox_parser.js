/**
 * PUDÚ MAIL 2 - LOCAL MBOX & EML ATTACHMENT PARSER (CLIENT-SIDE)
 * Allows exploring attachments directly from exported Google Takeout MBOX or EML files without any API.
 */

class MboxParser {
  /**
   * Parse a file (.mbox or .eml) in the browser
   */
  static async parseFile(file, onProgress) {
    const fileSize = file.size;
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let bytesRead = 0;
    const attachments = [];
    let currentMessageHeaders = {};
    let isBoundary = false;
    let currentBoundary = '';
    let readingAttachment = false;
    let currentAttachment = null;
    let messageIndex = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.length;
      if (onProgress) {
        onProgress(Math.min(99, Math.round((bytesRead / fileSize) * 100)));
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep last incomplete line

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // New Message Marker in MBOX
        if (line.startsWith('From ') || line.startsWith('From:')) {
          if (line.startsWith('From:')) {
            currentMessageHeaders.from = line.replace('From:', '').trim();
          }
        }

        if (line.startsWith('Subject:')) {
          currentMessageHeaders.subject = line.replace('Subject:', '').trim();
        }
        if (line.startsWith('Date:')) {
          currentMessageHeaders.date = line.replace('Date:', '').trim();
        }

        // Boundary detection for multipart MIME
        if (line.includes('boundary=')) {
          const match = line.match(/boundary=["']?([^"';]+)["']?/i);
          if (match) currentBoundary = '--' + match[1];
        }

        // Attachment header detection
        if (line.startsWith('Content-Disposition:') && line.includes('attachment')) {
          readingAttachment = true;
          const nameMatch = line.match(/filename=["']?([^"';\n]+)["']?/i);
          const filename = nameMatch ? nameMatch[1] : `adjunto_${attachments.length + 1}`;

          currentAttachment = {
            id: `mbox_att_${Date.now()}_${attachments.length}`,
            filename: filename,
            mimeType: 'application/octet-stream',
            sizeBytes: 0,
            base64Data: '',
            sender: currentMessageHeaders.from || 'Remitente',
            subject: currentMessageHeaders.subject || 'Sin asunto',
            date: currentMessageHeaders.date || new Date().toISOString()
          };
        }

        if (readingAttachment && currentAttachment) {
          if (line.startsWith('Content-Type:')) {
            const typeMatch = line.match(/Content-Type:\s*([^;\s]+)/i);
            if (typeMatch) currentAttachment.mimeType = typeMatch[1];
          }

          // Content boundary ended
          if (currentBoundary && line.startsWith(currentBoundary)) {
            if (currentAttachment && currentAttachment.base64Data.length > 10) {
              const estimatedBytes = Math.round((currentAttachment.base64Data.length * 3) / 4);
              currentAttachment.sizeBytes = estimatedBytes;
              currentAttachment.sizeFormatted = PuduFormats.formatBytes(estimatedBytes);
              
              // Create Blob URL for preview and download
              try {
                const byteCharacters = atob(currentAttachment.base64Data.replace(/\s/g, ''));
                const byteNumbers = new Array(byteCharacters.length);
                for (let j = 0; j < byteCharacters.length; j++) {
                  byteNumbers[j] = byteCharacters.charCodeAt(j);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: currentAttachment.mimeType });
                currentAttachment.downloadUrl = URL.createObjectURL(blob);
                currentAttachment.blob = blob;
              } catch (e) {
                currentAttachment.downloadUrl = '#';
              }

              attachments.push(currentAttachment);
            }
            readingAttachment = false;
            currentAttachment = null;
          } else if (!line.startsWith('Content-') && line.length > 0) {
            // Collecting base64 chunk
            if (/^[A-Za-z0-9+/=\s]+$/.test(line) && line.length > 20) {
              currentAttachment.base64Data += line;
            }
          }
        }
      }
    }

    if (onProgress) onProgress(100);
    return attachments;
  }
}

window.MboxParser = MboxParser;
