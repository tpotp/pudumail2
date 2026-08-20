const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const source = [read('background.js'), read('content.js'), read('../js/extension_bridge.js'), read('../js/app.js')]
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

assert.equal(manifest.permissions.includes('identity'), false);
assert.equal(manifest.permissions.includes('cookies'), false);
assert.equal(/gmail\.googleapis\.com|client_id|client_secret|access[_-]?token|refresh[_-]?token/i.test(source), false);
assert.equal(/getSampleData|Contenido de \$\{item\.filename\}/.test(source), false);
assert.match(read('background.js'), /RESOLVE_ATTACHMENT/);
assert.match(read('background.js'), /waitForDownload/);
assert.match(read('background.js'), /PURGE_CONVERSATIONS/);
assert.match(read('background.js'), /fileSize/);
assert.match(read('background.js'), /publicAttachment/);
assert.match(read('background.js'), /ensureGmailReceiver/);
assert.match(read('background.js'), /for \(let attempt = 0; attempt < 4; attempt\+\+\)/);
assert.match(read('content.js'), /scanOnePage/);
assert.match(read('../js/extension_bridge.js'), /sendScan\(true\)/);
assert.match(read('content.js'), /data-legacy-thread-id/);
assert.match(read('content.js'), /threadUrl/);
assert.match(read('content.js'), /GMAIL_READY/);
assert.match(read('content.js'), /TRASH_CONVERSATIONS/);
assert.match(read('content.js'), /PURGE_CONVERSATIONS/);
assert.match(read('../js/app.js'), /eliminar permanentemente/);
assert.match(read('../js/app.js'), /cleanVerifiedConversations/);
assert.match(read('../index.html'), /btnCleanGmail/);
assert.equal(read('../index.html').includes('trashAfterSave'), false);
assert.equal(read('../js/extension_bridge.js').includes('El conector tardó demasiado'), false);
assert.equal(read('../index.html').includes('cdnjs.cloudflare.com/ajax/libs/jszip'), false);
assert.equal(read('../privacy.html').includes('Google AdSense'), false);
console.log('Extension privacy and real-download checks passed.');
