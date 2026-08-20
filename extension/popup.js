document.addEventListener('DOMContentLoaded', () => {
  const btnOpen = document.getElementById('btnOpenWeb');
  if (btnOpen) {
    btnOpen.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: 'https://pudumail2.vercel.app' });
    });
  }
});
