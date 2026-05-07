// Robust launcher: tries to message content.js, auto-injects if missing
async function openPanel() {
  const status = document.getElementById('status');
  status.textContent = 'Opening panel...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      status.textContent = 'No active tab found';
      return;
    }

    // Special pages cannot have content scripts injected
    const url = tab.url || '';
    const blocked = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'chrome.google.com/webstore', 'addons.mozilla.org'];
    if (blocked.some(p => url.startsWith(p) || url.includes(p))) {
      status.textContent = 'Open a regular website (not chrome:// or web store) to use Moodify.';
      return;
    }

    // Try to send the toggle message
    let messaged = false;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
      messaged = true;
    } catch (e) {
      // Content script not present, inject it manually
      messaged = false;
    }

    if (!messaged) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // Give it a moment to initialize, then send the message
        await new Promise(r => setTimeout(r, 250));
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
      } catch (injectErr) {
        status.textContent = 'Could not load on this page. Try a different site.';
        return;
      }
    }

    window.close();
  } catch (e) {
    status.textContent = 'Something went wrong. Reload the page and try again.';
    console.error('Moodify launcher error:', e);
  }
}

document.getElementById('open-btn').addEventListener('click', openPanel);
