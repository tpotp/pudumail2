/**
 * PUDÚ GMAIL - GOOGLE IDENTITY & GMAIL REST API SERVICE
 * 100% Client-side interaction with Gmail via Google Identity Services (GIS).
 */

class GmailService {
  constructor() {
    this.accessToken = null;
    this.tokenClient = null;
    this.currentUser = null;
  }

  getClientId() {
    const configId = (window.PUDU_CONFIG && window.PUDU_CONFIG.GOOGLE_CLIENT_ID) || '';
    const storedId = localStorage.getItem('pudu_gmail_client_id') || '';
    if (storedId && storedId.includes('.apps.googleusercontent.com')) {
      return storedId;
    }
    return configId;
  }

  setClientId(clientId) {
    if (clientId) {
      localStorage.setItem('pudu_gmail_client_id', clientId.trim());
      this.tokenClient = null;
    }
  }

  hasValidClientId() {
    const cid = this.getClientId();
    return !!cid && cid.includes('.apps.googleusercontent.com') && !cid.startsWith('TU_GOOGLE_CLIENT_ID');
  }

  async loginWithGoogle(callback) {
    if (window.PuduBridge) {
      try {
        const res = await window.PuduBridge.getAuthToken();
        if (res.success && res.token) {
          this.accessToken = res.token;
          const profile = await this.fetchUserProfile();
          if (callback) callback({ success: true, user: profile });
        } else {
          if (callback) callback({ success: false, error: res.error || 'No se obtuvo token de la extensión' });
        }
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    } else {
      if (callback) callback({ success: false, error: 'PuduBridge no está disponible. Asegúrate de instalar la extensión.' });
    }
  }

  logout() {
    this.accessToken = null;
    this.currentUser = null;
  }

  async fetchUserProfile() {
    if (!this.accessToken) return null;

    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res.ok) {
        this.currentUser = await res.json();
        return this.currentUser;
      }
    } catch (err) {
      console.error('Error obteniendo perfil de Gmail:', err);
    }
    return null;
  }

  /**
   * Progressive dynamic scanning in chunks.
   */
  async scanAttachments(onProgress, onChunkFound, maxMessages = 250) {
    if (!this.accessToken) {
      throw new Error('No hay sesión activa de Google. Por favor inicia sesión.');
    }

    if (onProgress) onProgress({ percent: 5, current: 0, total: 0, message: 'Buscando correos con adjuntos en Gmail...' });

    // 1. List messages with attachments
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=has%3Aattachment&maxResults=${maxMessages}`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!listRes.ok) {
      const err = await listRes.json();
      throw new Error(err.error?.message || 'Error al conectar con la API de Gmail.');
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];
    const totalMsgs = messages.length;

    if (totalMsgs === 0) {
      return [];
    }

    const allAttachments = [];
    let scanned = 0;

    // 2. Fetch in progressive chunks of 8 messages for smooth GUI updates
    const CHUNK_SIZE = 8;
    for (let i = 0; i < totalMsgs; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);
      const chunkAttachments = [];

      await Promise.all(chunk.map(async (m) => {
        try {
          const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`;
          const detailRes = await fetch(detailUrl, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
          });

          if (!detailRes.ok) return;
          const msg = await detailRes.json();

          const headers = msg.payload?.headers || [];
          const getHeader = (name) => {
            const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
            return h ? h.value : '';
          };

          const subject = getHeader('Subject') || '(Sin Asunto)';
          const senderRaw = getHeader('From') || 'Gmail';
          const dateRaw = getHeader('Date');
          const messageId = (getHeader('Message-ID') || '').replace(/[<>]/g, '');

          let senderName = senderRaw;
          let senderEmail = senderRaw;
          const match = senderRaw.match(/^(.*?)\s*<(.+)>$/);
          if (match) {
            senderName = match[1].replace(/["']/g, '').trim();
            senderEmail = match[2].trim();
          }

          const extractParts = (parts) => {
            if (!parts || !Array.isArray(parts)) return;
            for (const p of parts) {
              if (p.filename && p.body && p.body.attachmentId) {
                const mime = (p.mimeType || 'application/octet-stream').toLowerCase();
                const fn = p.filename;
                const sz = p.body.size || 0;
                const cat = this.determineCategory(fn, mime);

                const item = {
                  id: `${msg.id}_${p.body.attachmentId.substring(0, 16)}`,
                  msg_id: msg.id,
                  attachment_id: p.body.attachmentId,
                  message_id: messageId,
                  filename: fn,
                  content_type: mime,
                  category: cat,
                  size_bytes: sz,
                  date: this.formatDate(dateRaw, msg.internalDate),
                  sender: senderEmail,
                  sender_name: senderName,
                  subject: subject,
                  preview_url: null,
                  thumbnail_url: null,
                  status: 'active'
                };

                chunkAttachments.push(item);
                allAttachments.push(item);
              }

              if (p.parts) {
                extractParts(p.parts);
              }
            }
          };

          extractParts(msg.payload?.parts);
        } catch (e) {
          console.warn('Error al procesar mensaje:', e);
        }
      }));

      scanned += chunk.length;
      const pct = Math.round((scanned / totalMsgs) * 90) + 10;

      if (chunkAttachments.length > 0 && onChunkFound) {
        onChunkFound(chunkAttachments);
      }

      if (onProgress) {
        onProgress({
          percent: Math.min(pct, 98),
          current: scanned,
          total: totalMsgs,
          message: `Analizados ${scanned} de ${totalMsgs} correos (${allAttachments.length} adjuntos encontrados)...`
        });
      }
    }

    if (onProgress) {
      onProgress({ percent: 100, current: totalMsgs, total: totalMsgs, message: `¡Listo! Se encontraron ${allAttachments.length} adjuntos.` });
    }

    return allAttachments;
  }

  async downloadAttachmentBlob(att) {
    if (!att.attachment_id) {
      throw new Error('ID de adjunto no disponible.');
    }

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${att.msg_id}/attachments/${att.attachment_id}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      throw new Error(`Error descargando adjunto ${att.filename}`);
    }

    const data = await res.json();
    const base64Data = data.data.replace(/-/g, '+').replace(/_/g, '/');

    // High performance native C++ browser decoding
    try {
      const dataUri = `data:${att.content_type || 'application/octet-stream'};base64,${base64Data}`;
      const blobRes = await fetch(dataUri);
      return await blobRes.blob();
    } catch (e) {
      const binaryStr = atob(base64Data);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return new Blob([bytes], { type: att.content_type });
    }
  }

  async moveMessageToTrash(msgId) {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/trash`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'No se pudo mover el correo a la papelera de Gmail.');
    }
    return true;
  }

  determineCategory(filename, mimeType) {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.raw', '.svg'].includes(ext) || mime.startsWith('image/')) {
      return 'images';
    }
    if (['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v', '.3gp'].includes(ext) || mime.startsWith('video/')) {
      return 'videos';
    }
    if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext) || mime.startsWith('audio/')) {
      return 'audio';
    }
    if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'].includes(ext) || mime.includes('pdf') || mime.includes('word') || mime.includes('excel')) {
      return 'documents';
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
      return 'archives';
    }
    return 'others';
  }

  formatDate(dateStr, internalDate) {
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return d.toISOString().replace('T', ' ').substring(0, 19);
        }
      } catch (e) {}
    }
    if (internalDate) {
      try {
        const d = new Date(parseInt(internalDate));
        return d.toISOString().replace('T', ' ').substring(0, 19);
      } catch (e) {}
    }
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }
}

window.puduGmailService = new GmailService();
