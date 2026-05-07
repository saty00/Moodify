// Moodify v2 background service worker
// Reuses a single "Moodify Player" tab instead of opening new tabs each click.

let moodifyPlayerTabId = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('Moodify v2 - AI music discovery, platform-agnostic');
});

// Track when our reused tab gets closed so we open fresh next time
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === moodifyPlayerTabId) {
    moodifyPlayerTabId = null;
  }
});

async function openOrReusePlayerTab(url, makeActive) {
  // Try to reuse existing player tab
  if (moodifyPlayerTabId !== null) {
    try {
      const tab = await chrome.tabs.get(moodifyPlayerTabId);
      if (tab) {
        await chrome.tabs.update(moodifyPlayerTabId, { url, active: makeActive });
        return;
      }
    } catch (e) {
      // Tab no longer exists, fall through to create new
      moodifyPlayerTabId = null;
    }
  }
  // Create new tab and remember its ID
  const tab = await chrome.tabs.create({ url, active: makeActive });
  moodifyPlayerTabId = tab.id;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ping') { sendResponse({ ok: true }); return false; }

  if (msg.type === 'OPEN_TAB' && msg.url) {
    openOrReusePlayerTab(msg.url, msg.active !== false).catch(() => {
      chrome.tabs.create({ url: msg.url, active: msg.active !== false });
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'OPEN_TAB_BG' && msg.url) {
    openOrReusePlayerTab(msg.url, false).catch(() => {
      chrome.tabs.create({ url: msg.url, active: false });
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'OPEN_TAB_FRESH' && msg.url) {
    // Force new tab (used by e.g. taste export)
    chrome.tabs.create({ url: msg.url, active: msg.active !== false });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
