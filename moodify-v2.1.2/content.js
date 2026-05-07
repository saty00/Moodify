// ════════════════════════════════════════════════════════════
//  MOODIFY v2 - content.js
//  Floating draggable AI music discovery panel
//  No Spotify dependency. Works with 6 platforms.
// ════════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (document.getElementById('moodify-root')) return;

  // ── User's AI key (required) ──────────────────────────────
  // Stored only in chrome.storage.local. Provider auto-detected from format.
  let userApiKey = '';
  let userProvider = 'gemini'; // 'gemini' | 'claude' | 'openai'

  let tasteProfile = {
    likedArtists: [], likedGenres: [], dislikedArtists: [],
    searches: [], history: [],
    savedCount: 0, blockedCount: 0,
    moodCounts: {}, timeOfDayCounts: {}, sessionStart: Date.now()
  };
  let blacklist = new Map();
  let currentTracks = [];
  let activeTab = 'mood';
  let lastGenre = '', lastArtist = '';
  let preferredPlatform = 'spotify'; // user's default click platform
  let displayPlatforms = ['spotify', 'apple']; // which platform buttons to show on each track

  // ── Safe chrome API wrappers ─────────────────────────────
  function isContextValid() {
    try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch { return false; }
  }
  async function safeGet(keys) {
    if (!isContextValid()) return {};
    try {
      return await new Promise(r => chrome.storage.local.get(keys, d => r(chrome.runtime?.lastError ? {} : (d || {}))));
    } catch { return {}; }
  }
  async function safeSet(obj) {
    if (!isContextValid()) return;
    try { await new Promise(r => chrome.storage.local.set(obj, r)); } catch {}
  }
  function openLink(url, active = true) {
    if (!isContextValid()) { window.open(url, '_blank'); return; }
    try { chrome.runtime.sendMessage({ type: active ? 'OPEN_TAB' : 'OPEN_TAB_BG', url }); } catch { window.open(url, '_blank'); }
  }

  // ── Build shadow DOM ─────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'moodify-root';
  root.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
  document.documentElement.appendChild(root);
  const shadow = root.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
<style>
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: #34342c; border-radius: 2px; }

/* Editorial serif used sparingly for accent/branding only */
.mdy-serif { font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif; font-style: italic; font-weight: 500; }

/* ── Floating bubble ── */
#mdy-bubble {
  position: fixed; right: 22px; bottom: 78px;
  background: #0a0a0a;
  border: 1.5px solid #dedfcf;
  border-radius: 30px;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 9px 14px 9px 13px;
  box-shadow: 0 6px 28px rgba(0, 0, 0, 0.55);
  pointer-events: all; user-select: none;
  z-index: 2147483646;
  transition: transform .2s, box-shadow .2s, border-radius .25s;
  animation: mdy-bub-in .4s cubic-bezier(.34, 1.56, .64, 1) both;
  transform: rotate(-1deg);
}
@keyframes mdy-bub-in { from { opacity: 0; transform: rotate(-1deg) scale(.4) translateY(20px); } to { opacity: 1; transform: rotate(-1deg) scale(1); } }
#mdy-bubble:hover { transform: rotate(-1deg) scale(1.06); box-shadow: 0 8px 36px rgba(222, 223, 207, 0.25); }
#mdy-bubble.minimized { border-radius: 50%; padding: 7px; transform: rotate(0); }
#mdy-bubble.minimized:hover { transform: rotate(0) scale(1.06); }
#mdy-bubble.minimized .mdy-bub-label { display: none; }
.mdy-bub-logo { width: 26px; height: 26px; display: block; object-fit: contain; }
.mdy-bub-label { font-size: 12px; font-weight: 600; color: #f0ede2; letter-spacing: 0.2px; }

/* ── Main panel ── */
#mdy-panel {
  position: fixed; right: 74px; bottom: 20px;
  width: 384px; height: 624px;
  background: #0a0a0a;
  border-radius: 16px 18px 14px 17px;  /* slightly uneven corners */
  overflow: hidden;
  display: flex; flex-direction: column;
  pointer-events: all;
  box-shadow: 0 24px 70px rgba(0, 0, 0, .8), 0 0 0 1px #1c1c18 inset;
  opacity: 0; transform: scale(.96) translateY(8px); pointer-events: none;
  transition: opacity .25s cubic-bezier(.4, 0, .2, 1), transform .25s cubic-bezier(.4, 0, .2, 1);
}
#mdy-panel.open { opacity: 1; transform: scale(1) translateY(0); pointer-events: all; }

/* Subtle moving gradient bg + paper grain */
#mdy-panel::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .12; z-index: 0;
  background:
    radial-gradient(circle at 22% 0%, #dedfcf 0%, transparent 44%),
    radial-gradient(circle at 78% 100%, #a89878 0%, transparent 52%);
  animation: mdy-glow 14s ease-in-out infinite alternate;
}
#mdy-panel::after {
  /* faint film grain — gives it a less-perfect, hand-printed feel */
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .035; z-index: 1;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='5'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.5 0'/></filter><rect width='180' height='180' filter='url(%23n)'/></svg>");
  mix-blend-mode: screen;
}
@keyframes mdy-glow { 0% { transform: translate(0, 0); } 100% { transform: translate(-3%, 3%); } }

/* Top header */
#mdy-head {
  position: relative; z-index: 2;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 2px 17px;
  flex-shrink: 0; cursor: grab;
}
#mdy-head:active { cursor: grabbing; }
.mdy-brand {
  display: flex; align-items: baseline; gap: 9px;
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
  font-style: italic;
  font-size: 19px; font-weight: 600; color: #f0ede2;
  letter-spacing: -0.015em;
  position: relative;
}
.mdy-brand::after {
  /* hand-drawn-ish underline */
  content: ''; position: absolute;
  left: 32px; right: -4px; bottom: -2px;
  height: 1.5px;
  background: linear-gradient(90deg, transparent 0%, #a89878 18%, #dedfcf 50%, #a89878 82%, transparent 100%);
  border-radius: 2px;
  opacity: .55;
  transform: rotate(-0.5deg);
}
.mdy-brand-logo {
  width: 23px; height: 23px;
  display: block;
  object-fit: contain;
  transform: rotate(-2deg);
  align-self: center;
}
.mdy-head-actions { display: flex; gap: 4px; }
.mdy-ibtn {
  width: 28px; height: 28px; border: none; background: transparent;
  color: #6e6c64; cursor: pointer; border-radius: 7px;
  font-size: 16px; display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.mdy-ibtn:hover { color: #f0ede2; background: rgba(255, 255, 255, .06); }

/* Tabs */
.mdy-tabs {
  position: relative; z-index: 2;
  display: flex; gap: 2px;
  padding: 12px 12px 0;
  border-bottom: 1px solid #1c1c18;
  flex-shrink: 0;
}
.mdy-tab {
  padding: 8px 12px; background: none; border: none;
  color: #4e4c44; cursor: pointer;
  font-family: inherit; font-size: 11px; font-weight: 600;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: all .15s; letter-spacing: .3px; text-transform: uppercase;
}
.mdy-tab:hover { color: #8a877c; }
.mdy-tab.active { color: #f0ede2; border-bottom-color: #dedfcf; }

/* Content */
.mdy-content {
  position: relative; z-index: 2;
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 14px;
  display: flex; flex-direction: column; gap: 12px;
}
.mdy-pane { display: none; flex-direction: column; gap: 12px; }
.mdy-pane.active { display: flex; }

/* Inputs */
.mdy-input, .mdy-textarea {
  width: 100%;
  background: #161614;
  border: 1px solid #262622;
  border-radius: 9px;
  color: #f0ede2;
  font-family: inherit; font-size: 13px;
  padding: 10px 12px;
  outline: none;
  transition: border-color .15s;
}
.mdy-textarea { resize: none; height: 70px; line-height: 1.5; }
.mdy-input:focus, .mdy-textarea:focus { border-color: rgba(222, 223, 207, .35); }
.mdy-input::placeholder, .mdy-textarea::placeholder { color: #4e4c44; }

/* Chips */
.mdy-chips { display: flex; flex-wrap: wrap; gap: 5px 6px; }
.mdy-chip {
  background: #161614;
  border: 1px solid #262622;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: 11px;
  color: #8a877c;
  cursor: pointer;
  transition: all .15s;
  font-family: inherit;
}
.mdy-chip:nth-child(odd)  { transform: rotate(-0.4deg); }
.mdy-chip:nth-child(even) { transform: rotate(0.5deg); }
.mdy-chip:nth-child(3n)   { transform: rotate(-0.2deg); }
.mdy-chip:hover { border-color: #dedfcf; color: #dedfcf; background: rgba(222, 223, 207, .06); transform: rotate(0) translateY(-1px); }

/* Buttons */
.mdy-btn {
  padding: 10px 14px; border: none; border-radius: 9px;
  font-family: inherit; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: opacity .15s, transform .1s;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.mdy-btn:hover:not(:disabled) { opacity: .9; }
.mdy-btn:active:not(:disabled) { transform: translateY(1px); }
.mdy-btn:disabled { opacity: .35; cursor: not-allowed; }
.mdy-btn-primary {
  background: linear-gradient(135deg, #dedfcf, #c4b58e);
  color: #0a0a0a;
  border-radius: 9px 11px 8px 10px;  /* uneven corners */
  box-shadow: 0 0 0 1.5px #0a0a0a inset, 0 2px 0 #6e6c64;
}
.mdy-btn-ghost { background: #161614; color: #f0ede2; border: 1px solid #262622; }
.mdy-btn-ghost:hover:not(:disabled) { border-color: #34342c; }
.mdy-btn-full { width: 100%; }
.mdy-btn-sm { padding: 7px 11px; font-size: 11px; }
.mdy-btn-xs { padding: 4px 9px; font-size: 10px; border-radius: 6px; }

/* Section labels - editorial italic feel */
.mdy-sec-label {
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
  font-style: italic;
  font-size: 12px; font-weight: 500; color: #6e6c64;
  text-transform: none; letter-spacing: 0;
}
.mdy-sec-row { display: flex; align-items: center; justify-content: space-between; }
.mdy-sec-action { font-size: 11px; color: #dedfcf; cursor: pointer; background: none; border: none; font-family: inherit; }
.mdy-sec-action:hover { text-decoration: underline; }

/* Genre grid */
.mdy-genre-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.mdy-genre-card {
  background: #161614;
  border: 1px solid #262622;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: all .15s;
}
.mdy-genre-card:hover, .mdy-genre-card.sel { border-color: #dedfcf; background: rgba(222, 223, 207, .06); }
.mgc-name { font-size: 11px; font-weight: 600; color: #f0ede2; }
.mgc-sub { font-size: 9px; color: #4e4c44; margin-top: 2px; }

/* Track list */
.mdy-track {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 6px;
  border-radius: 7px;
  position: relative;
  transition: background .12s;
}
.mdy-track:hover { background: #161614; }
.mdy-track-num { font-size: 10px; color: #4e4c44; width: 16px; text-align: center; flex-shrink: 0; }
.mdy-track-art {
  width: 38px; height: 38px;
  border-radius: 5px; flex-shrink: 0;
  background: linear-gradient(135deg, rgba(222, 223, 207, .15), rgba(168, 152, 120, .25));
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700;
  color: #f0ede2;
}
.mdy-track-info { flex: 1; min-width: 0; overflow: hidden; padding-right: 4px; }
.mdy-track-name { font-size: 12px; font-weight: 500; color: #f0ede2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mdy-track-meta { font-size: 10px; color: #8a877c; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mdy-track-why { font-size: 9px; color: #5e5c54; font-style: italic; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mdy-badge {
  font-size: 8px; background: #f59e0b; color: #0a0a0a;
  border-radius: 3px; padding: 1px 4px; font-weight: 700; margin-left: 4px;
}
.mdy-t-actions { display: flex; gap: 3px; flex-shrink: 0; align-items: center; }

.mdy-plat-btn {
  width: 30px; height: 24px; border: none; border-radius: 5px;
  cursor: pointer;
  font-size: 9px; font-weight: 800; letter-spacing: .3px;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .15s, transform .1s;
}
.mdy-plat-btn:hover { opacity: .8; }
.mdy-plat-btn:active { transform: scale(.95); }
.mdy-plat-sp { background: rgba(29, 185, 84, .18); color: #1ed760; }
.mdy-plat-am { background: rgba(252, 60, 68, .18); color: #fc6470; }
.mdy-plat-yt { background: rgba(255, 0, 0, .18); color: #ff5757; }
.mdy-plat-tdl { background: rgba(255, 255, 255, .12); color: #f0ede2; }
.mdy-plat-amz { background: rgba(0, 168, 224, .18); color: #00c0ff; }
.mdy-plat-dz { background: rgba(255, 145, 0, .18); color: #ffaa3d; }

.mdy-mtb {
  width: 24px; height: 24px; border: none; border-radius: 50%;
  cursor: pointer; background: transparent; color: #4e4c44;
  font-size: 13px; display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.mdy-mtb:hover { background: rgba(255, 255, 255, .06); color: #f0ede2; }
.mdy-mtb.liked { color: #a89878; }

/* Stat cards */
.mdy-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.mdy-stat-card {
  background: #161614; border: 1px solid #262622;
  border-radius: 9px; padding: 11px;
}
.mdy-stat-label { font-size: 10px; color: #4e4c44; text-transform: uppercase; letter-spacing: .4px; }
.mdy-stat-num { font-size: 20px; font-weight: 700; color: #f0ede2; margin-top: 3px; letter-spacing: -0.02em; }
.mdy-stat-sub { font-size: 9px; color: #4e4c44; margin-top: 2px; }

/* List items */
.mdy-list-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 8px 6px; border-radius: 6px;
}
.mdy-list-item:hover { background: #161614; }
.mdy-li-info { flex: 1; min-width: 0; overflow: hidden; }
.mdy-li-name { font-size: 12px; color: #f0ede2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mdy-li-meta { font-size: 10px; color: #8a877c; }

/* Platform selector */
.mdy-plat-row {
  display: flex; flex-wrap: wrap; gap: 5px;
  background: #161614; border: 1px solid #262622;
  border-radius: 8px; padding: 6px;
}
.mdy-plat-pick {
  flex: 1; min-width: 60px;
  padding: 6px 8px; border: 1px solid transparent;
  background: transparent; color: #8a877c;
  border-radius: 5px; cursor: pointer;
  font-size: 10px; font-weight: 600; font-family: inherit;
  transition: all .15s;
}
.mdy-plat-pick:hover { color: #f0ede2; }
.mdy-plat-pick.sel { background: rgba(222, 223, 207, .12); color: #dedfcf; border-color: rgba(222, 223, 207, .25); }

/* Toast */
.mdy-toast {
  position: absolute; bottom: 14px; left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: #161614; border: 1px solid #262622;
  color: #f0ede2;
  padding: 9px 16px; border-radius: 999px;
  font-size: 11px; font-weight: 500;
  opacity: 0; pointer-events: none;
  transition: opacity .25s, transform .25s;
  z-index: 5;
}
.mdy-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* Loading */
.mdy-loading {
  display: none; align-items: center; gap: 9px;
  font-size: 12px; color: #a8a59a;
  padding: 8px 16px 4px;
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
  font-style: italic;
}
.mdy-loading.on { display: flex; }
.mdy-spinner {
  width: 12px; height: 12px;
  border: 2px solid #2e2c28;
  border-top-color: #dedfcf;
  border-radius: 50%;
  animation: mdy-spin .8s linear infinite;
  flex-shrink: 0;
}
@keyframes mdy-spin { to { transform: rotate(360deg); } }
@keyframes mdy-shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}
.mdy-skel-row {
  display: flex; gap: 10px; align-items: center;
  padding: 10px 4px;
  border-bottom: 1px solid #1a1916;
}
.mdy-skel-art {
  width: 38px; height: 38px;
  border-radius: 6px;
  background: linear-gradient(90deg, #1a1a17 0%, #232320 50%, #1a1a17 100%);
  background-size: 400px 100%;
  animation: mdy-shimmer 1.4s linear infinite;
  flex-shrink: 0;
}
.mdy-skel-lines { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.mdy-skel-line {
  height: 9px; border-radius: 3px;
  background: linear-gradient(90deg, #1a1a17 0%, #232320 50%, #1a1a17 100%);
  background-size: 400px 100%;
  animation: mdy-shimmer 1.4s linear infinite;
}
.mdy-skel-line.short { width: 50%; }

/* Error */
.mdy-err {
  display: none;
  background: rgba(168, 152, 120, .08);
  border: 1px solid rgba(168, 152, 120, .2);
  border-radius: 7px;
  padding: 9px 12px;
  font-size: 11px; color: #a89878;
}
.mdy-err.on { display: block; }

.mdy-empty { color: #4e4c44; font-size: 12px; padding: 20px 0; text-align: center; }

/* ── ONBOARDING OVERLAY ── */
.mdy-onboard {
  position: absolute; inset: 0;
  background: #0a0a0a;
  z-index: 10;
  display: none;
  flex-direction: column;
  padding: 24px 22px;
  overflow-y: auto;
}
.mdy-onboard.show { display: flex; }
.mdy-ob-step { display: none; flex-direction: column; gap: 14px; height: 100%; }
.mdy-ob-step.active { display: flex; }
.mdy-ob-head { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.mdy-ob-logo { width: 44px; height: 44px; object-fit: contain; margin-bottom: 4px; }
.mdy-ob-counter { font-size: 10px; color: #8a877c; letter-spacing: 0.7px; text-transform: uppercase; font-weight: 600; }
.mdy-ob-head h2 {
  font-family: 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif;
  font-style: italic;
  font-size: 22px; font-weight: 600; color: #f0ede2;
  letter-spacing: -0.015em; margin: 2px 0;
  line-height: 1.15;
}
.mdy-ob-head p { font-size: 12px; color: #8a877c; line-height: 1.5; }

.mdy-ob-plats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; flex: 1; align-content: start; }
.mdy-ob-plat {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 12px;
  background: #161614;
  border: 1px solid #262622;
  border-radius: 8px;
  color: #f0ede2;
  font-family: inherit; font-size: 12px; font-weight: 500;
  cursor: pointer;
  transition: all .15s;
}
.mdy-ob-plat:hover { border-color: #4e4c44; }
.mdy-ob-plat.sel { border-color: #dedfcf; background: rgba(222, 223, 207, 0.08); }
.mdy-ob-plat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.mdy-ob-hint { font-size: 11px; color: #8a877c; text-align: center; }

.mdy-ob-genres { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; flex: 1; align-content: start; }
.mdy-ob-genre {
  padding: 10px 8px;
  background: #161614;
  border: 1px solid #262622;
  border-radius: 8px;
  color: #f0ede2;
  font-family: inherit; font-size: 11px; font-weight: 500;
  cursor: pointer;
  transition: all .15s;
}
.mdy-ob-genre:hover { border-color: #4e4c44; }
.mdy-ob-genre.sel { border-color: #dedfcf; background: rgba(222, 223, 207, 0.08); }
</style>

<!-- Floating bubble -->
<div id="mdy-bubble" class="minimized" title="Open Moodify">
  <img class="mdy-bub-logo" alt="" />
  <span class="mdy-bub-label">Moodify</span>
</div>

<!-- Main panel -->
<div id="mdy-panel">
  <!-- ONBOARDING OVERLAY (shown to first-time users) -->
  <div id="mdy-onboard" class="mdy-onboard">
    <div class="mdy-ob-step active" data-step="1">
      <div class="mdy-ob-head">
        <img class="mdy-ob-logo" alt="" />
        <h2>Welcome to Moodify</h2>
        <p>Quick setup. We'll ask 4 questions, takes about a minute. Everything stays in your browser.</p>
      </div>
      <button class="mdy-btn mdy-btn-primary mdy-btn-full" id="mdy-ob-start">Get started</button>
    </div>

    <div class="mdy-ob-step" data-step="2">
      <div class="mdy-ob-head">
        <div class="mdy-ob-counter">step 1 of 4</div>
        <h2>Get a free Gemini key</h2>
        <p>Moodify uses your AI key directly from your browser. The free Google Gemini key works perfectly and takes about 30 seconds.</p>
      </div>

      <div style="background:#161614; border:1px solid #262622; border-radius:9px; padding:13px 14px; line-height:1.65;">
        <div style="font-size:11px; color:#dedfcf; font-weight:600; margin-bottom:8px;">Quick steps</div>
        <ol style="font-size:11px; color:#a8a59a; padding-left:18px; margin:0;">
          <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" style="color:#dedfcf; text-decoration:underline;">aistudio.google.com/apikey</a> in a new tab</li>
          <li>Sign in with any Google account</li>
          <li>Click "Create API key" — pick any project</li>
          <li>Copy the key and paste it below</li>
        </ol>
      </div>

      <input class="mdy-input" id="mdy-ob-key" placeholder="Paste your key here (starts with AIza... or sk-...)" autocomplete="off" />
      <div class="mdy-ob-hint" id="mdy-ob-key-hint">Stays in your browser. Never sent anywhere except the AI provider.</div>

      <div style="font-size:10px; color:#5e5c54; line-height:1.55;">
        Already have an Anthropic (sk-ant-) or OpenAI (sk-) key? Paste it. Moodify auto-detects.
      </div>

      <button class="mdy-btn mdy-btn-primary mdy-btn-full" id="mdy-ob-key-next" disabled>Continue</button>
    </div>

    <div class="mdy-ob-step" data-step="3">
      <div class="mdy-ob-head">
        <div class="mdy-ob-counter">step 2 of 4</div>
        <h2>Where do you listen?</h2>
        <p>Pick the 2 platforms you use most. We'll show those buttons big, hide the rest.</p>
      </div>
      <div class="mdy-ob-plats" id="mdy-ob-plats">
        <button class="mdy-ob-plat" data-p="spotify"><span class="mdy-ob-plat-dot" style="background:#1ed760"></span>Spotify</button>
        <button class="mdy-ob-plat" data-p="apple"><span class="mdy-ob-plat-dot" style="background:#fc6470"></span>Apple Music</button>
        <button class="mdy-ob-plat" data-p="youtube"><span class="mdy-ob-plat-dot" style="background:#ff5757"></span>YouTube Music</button>
        <button class="mdy-ob-plat" data-p="tidal"><span class="mdy-ob-plat-dot" style="background:#f0ede2"></span>Tidal</button>
        <button class="mdy-ob-plat" data-p="amazon"><span class="mdy-ob-plat-dot" style="background:#00c0ff"></span>Amazon Music</button>
        <button class="mdy-ob-plat" data-p="deezer"><span class="mdy-ob-plat-dot" style="background:#ffaa3d"></span>Deezer</button>
      </div>
      <div class="mdy-ob-hint" id="mdy-ob-plat-hint">Pick up to 2.</div>
      <button class="mdy-btn mdy-btn-primary mdy-btn-full" id="mdy-ob-plats-next" disabled>Continue</button>
    </div>

    <div class="mdy-ob-step" data-step="4">
      <div class="mdy-ob-head">
        <div class="mdy-ob-counter">step 3 of 4</div>
        <h2>Two artists you love</h2>
        <p>Type two artists. Moodify uses them as the starting point for your taste.</p>
      </div>
      <input class="mdy-input" id="mdy-ob-artist-1" placeholder="Artist 1 (e.g. Frank Ocean)" />
      <input class="mdy-input" id="mdy-ob-artist-2" placeholder="Artist 2 (e.g. Tame Impala)" />
      <button class="mdy-btn mdy-btn-primary mdy-btn-full" id="mdy-ob-artists-next">Continue</button>
    </div>

    <div class="mdy-ob-step" data-step="5">
      <div class="mdy-ob-head">
        <div class="mdy-ob-counter">step 4 of 4</div>
        <h2>Pick up to 3 genres</h2>
        <p>The ones you reach for most. Moodify blends them with your artists when picking songs.</p>
      </div>
      <div class="mdy-ob-genres" id="mdy-ob-genres">
        <button class="mdy-ob-genre" data-g="hip-hop">Hip-Hop</button>
        <button class="mdy-ob-genre" data-g="r-n-b">R&amp;B</button>
        <button class="mdy-ob-genre" data-g="pop">Pop</button>
        <button class="mdy-ob-genre" data-g="rock">Rock</button>
        <button class="mdy-ob-genre" data-g="electronic">Electronic</button>
        <button class="mdy-ob-genre" data-g="indie">Indie</button>
        <button class="mdy-ob-genre" data-g="jazz">Jazz</button>
        <button class="mdy-ob-genre" data-g="lo-fi">Lo-Fi</button>
        <button class="mdy-ob-genre" data-g="latin">Latin</button>
        <button class="mdy-ob-genre" data-g="afrobeats">Afrobeats</button>
        <button class="mdy-ob-genre" data-g="metal">Metal</button>
        <button class="mdy-ob-genre" data-g="classical">Classical</button>
      </div>
      <div class="mdy-ob-hint" id="mdy-ob-genre-hint" style="margin-top:6px;">Pick 1, 2, or 3.</div>
      <button class="mdy-btn mdy-btn-primary mdy-btn-full" id="mdy-ob-finish" disabled>Finish setup</button>
    </div>
  </div>

  <div id="mdy-head">
    <div class="mdy-brand">
      <img class="mdy-brand-logo" alt="" />
      <span>Moodify</span>
    </div>
    <div class="mdy-head-actions">
      <button class="mdy-ibtn" id="mdy-min-btn" title="Minimize">−</button>
    </div>
  </div>

  <div class="mdy-tabs">
    <button class="mdy-tab active" data-tab="mood">Mood</button>
    <button class="mdy-tab" data-tab="genres">Genre</button>
    <button class="mdy-tab" data-tab="artists">Artist</button>
    <button class="mdy-tab" data-tab="taste">Taste</button>
    <button class="mdy-tab" data-tab="settings">⚙</button>
  </div>

  <div class="mdy-loading" id="mdy-loading">
    <span class="mdy-spinner"></span>
    <span id="mdy-loading-text">Finding songs you'll like…</span>
  </div>

  <div class="mdy-content">

    <!-- MOOD -->
    <div class="mdy-pane active" id="mdy-pane-mood">
      <textarea class="mdy-textarea" id="mdy-mood-input" placeholder="What are you doing, where are you, how do you feel? Anything works.
e.g. driving home from school, making dinner, just got bad news"></textarea>
      <div class="mdy-chips" id="mdy-mood-chips">
        <button class="mdy-chip" data-m="working on something I care about, need momentum">in the zone</button>
        <button class="mdy-chip" data-m="winding down at the end of the day">winding down</button>
        <button class="mdy-chip" data-m="driving alone, just thinking">driving alone</button>
        <button class="mdy-chip" data-m="getting ready to go out, building energy">getting ready</button>
        <button class="mdy-chip" data-m="quiet morning, slow start">slow morning</button>
        <button class="mdy-chip" data-m="something heavy on my mind, processing">processing</button>
      </div>
      <div style="display:flex; gap:6px;">
        <button class="mdy-btn mdy-btn-primary mdy-btn-full" id="mdy-mood-gen">Find songs</button>
        <button class="mdy-btn mdy-btn-ghost mdy-btn-sm" id="mdy-mood-regen" style="display:none;">More</button>
      </div>
      <div class="mdy-err" id="mdy-mood-err"></div>
      <div id="mdy-mood-results"></div>
    </div>

    <!-- GENRES -->
    <div class="mdy-pane" id="mdy-pane-genres">
      <div class="mdy-genre-grid">
        <div class="mdy-genre-card" data-g="hip-hop"><div class="mgc-name">Hip-Hop</div><div class="mgc-sub">classics + new wave</div></div>
        <div class="mdy-genre-card" data-g="r-n-b"><div class="mgc-name">R&amp;B</div><div class="mgc-sub">smooth + soulful</div></div>
        <div class="mdy-genre-card" data-g="pop"><div class="mgc-name">Pop</div><div class="mgc-sub">chart + alt-pop</div></div>
        <div class="mdy-genre-card" data-g="rock"><div class="mgc-name">Rock</div><div class="mgc-sub">all eras</div></div>
        <div class="mdy-genre-card" data-g="electronic"><div class="mgc-name">Electronic</div><div class="mgc-sub">dance, house, techno</div></div>
        <div class="mdy-genre-card" data-g="jazz"><div class="mgc-name">Jazz</div><div class="mgc-sub">cool to nu-jazz</div></div>
        <div class="mdy-genre-card" data-g="lo-fi"><div class="mgc-name">Lo-Fi</div><div class="mgc-sub">chill, study</div></div>
        <div class="mdy-genre-card" data-g="latin"><div class="mgc-name">Latin</div><div class="mgc-sub">reggaeton, bachata, more</div></div>
        <div class="mdy-genre-card" data-g="afrobeats"><div class="mgc-name">Afrobeats</div><div class="mgc-sub">amapiano + afro pop</div></div>
        <div class="mdy-genre-card" data-g="indie"><div class="mgc-name">Indie</div><div class="mgc-sub">bedroom, dream, alt</div></div>
        <div class="mdy-genre-card" data-g="metal"><div class="mgc-name">Metal</div><div class="mgc-sub">heavy + prog</div></div>
        <div class="mdy-genre-card" data-g="classical"><div class="mgc-name">Classical</div><div class="mgc-sub">orchestral, modern</div></div>
      </div>
      <div id="mdy-genre-gen-wrap" style="display:none; gap:6px;">
        <button class="mdy-btn mdy-btn-primary mdy-btn-full" id="mdy-genre-gen">Find songs</button>
        <button class="mdy-btn mdy-btn-ghost mdy-btn-sm" id="mdy-genre-regen" style="display:none;">Shuffle</button>
      </div>
      <div class="mdy-err" id="mdy-genre-err"></div>
      <div id="mdy-genre-results"></div>
    </div>

    <!-- ARTISTS -->
    <div class="mdy-pane" id="mdy-pane-artists">
      <input class="mdy-input" id="mdy-artist-input" placeholder="Enter an artist (e.g. Frank Ocean)" />
      <div style="display:flex; gap:6px;">
        <button class="mdy-btn mdy-btn-primary" id="mdy-artist-gen" style="flex:1;">Similar artists</button>
        <button class="mdy-btn mdy-btn-ghost" id="mdy-artist-gems" style="flex:1;">Hidden gems</button>
        <button class="mdy-btn mdy-btn-ghost mdy-btn-sm" id="mdy-artist-regen" style="display:none;">Shuffle</button>
      </div>
      <div class="mdy-err" id="mdy-artist-err"></div>
      <div id="mdy-artist-results"></div>
    </div>

    <!-- TASTE PROFILE -->
    <div class="mdy-pane" id="mdy-pane-taste">
      <div class="mdy-stat-grid">
        <div class="mdy-stat-card">
          <div class="mdy-stat-label">Songs saved</div>
          <div class="mdy-stat-num" id="mdy-stat-saved">0</div>
          <div class="mdy-stat-sub">via Moodify</div>
        </div>
        <div class="mdy-stat-card">
          <div class="mdy-stat-label">Searches</div>
          <div class="mdy-stat-num" id="mdy-stat-searches">0</div>
          <div class="mdy-stat-sub">tracked</div>
        </div>
        <div class="mdy-stat-card">
          <div class="mdy-stat-label">Artists liked</div>
          <div class="mdy-stat-num" id="mdy-stat-artists">0</div>
          <div class="mdy-stat-sub">in profile</div>
        </div>
        <div class="mdy-stat-card">
          <div class="mdy-stat-label">Songs blocked</div>
          <div class="mdy-stat-num" id="mdy-stat-blocked">0</div>
          <div class="mdy-stat-sub">all time</div>
        </div>
      </div>

      <div id="mdy-taste-recs-wrap" style="display:none;">
        <div class="mdy-sec-row">
          <span class="mdy-sec-label">Personalized for you</span>
          <button class="mdy-sec-action" id="mdy-personalized-refresh">Refresh</button>
        </div>
        <div id="mdy-taste-recs"></div>
      </div>

      <div id="mdy-taste-artists-wrap" style="display:none;">
        <div class="mdy-sec-label" style="margin-bottom:6px;">Artists you've saved</div>
        <div id="mdy-taste-artists"></div>
      </div>

      <div id="mdy-taste-searches-wrap" style="display:none;">
        <div class="mdy-sec-label" style="margin-bottom:6px;">Recent searches</div>
        <div class="mdy-chips" id="mdy-taste-searches"></div>
      </div>

      <div id="mdy-taste-empty" class="mdy-empty">
        Save songs (♡) and Moodify learns your taste.<br/>
        The more you use it, the more personal recs become.
      </div>
    </div>

    <!-- SETTINGS -->
    <div class="mdy-pane" id="mdy-pane-settings">
      <div class="mdy-sec-label">AI key <span id="mdy-set-source-label" style="color:#8a877c;font-weight:400;text-transform:none;letter-spacing:0;"></span></div>
      <div style="display:flex; gap:6px; align-items:center;">
        <input class="mdy-input" id="mdy-set-key" placeholder="Paste your Gemini, Anthropic, or OpenAI key" style="flex:1;" autocomplete="off" />
        <button class="mdy-btn mdy-btn-ghost mdy-btn-sm" id="mdy-set-key-save">Save</button>
      </div>
      <div style="font-size:10px; color:#5e5c54; line-height:1.5;">
        Free Gemini key at <a href="https://aistudio.google.com/apikey" target="_blank" style="color:#dedfcf;">aistudio.google.com/apikey</a>. Stays in your browser.
      </div>

      <div class="mdy-sec-label" style="margin-top:6px;">Default play platform</div>
      <div class="mdy-plat-row" id="mdy-plat-picker">
        <button class="mdy-plat-pick sel" data-p="spotify">Spotify</button>
        <button class="mdy-plat-pick" data-p="apple">Apple Music</button>
        <button class="mdy-plat-pick" data-p="youtube">YouTube</button>
        <button class="mdy-plat-pick" data-p="tidal">Tidal</button>
        <button class="mdy-plat-pick" data-p="amazon">Amazon</button>
        <button class="mdy-plat-pick" data-p="deezer">Deezer</button>
      </div>
      <div style="font-size:10px; color:#5e5c54; line-height:1.5; margin-top:-2px;">Clicking a song opens it on this platform. Track rows show quick buttons for the rest.</div>

      <div class="mdy-sec-label" style="margin-top:6px;">Blocked songs <span id="mdy-bl-cnt" style="color:#5e5c54;font-weight:400;"></span></div>
      <div id="mdy-bl-list"></div>

      <div style="display:flex;gap:6px;margin-top:6px;">
        <button class="mdy-btn mdy-btn-ghost mdy-btn-sm" style="flex:1;" id="mdy-export-taste">Export taste</button>
        <button class="mdy-btn mdy-btn-ghost mdy-btn-sm" style="flex:1;" id="mdy-reset-taste">Reset taste</button>
      </div>
    </div>

  </div>

  <div class="mdy-toast" id="mdy-toast"></div>
</div>
`;

  // ── DOM helpers ─────────────────────────────────────────
  const $ = id => shadow.getElementById(id);
  const $$ = sel => shadow.querySelectorAll(sel);
  const esc = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

  const bubble = $('mdy-bubble');
  const panel = $('mdy-panel');
  const toast = $('mdy-toast');

  // Inline skeleton HTML injected into a specific results container.
  // We clear it as soon as renderTracks is called, OR setLoading(false) is hit.
  const SKELETON_HTML = `
    <div class="mdy-skel-row"><div class="mdy-skel-art"></div><div class="mdy-skel-lines"><div class="mdy-skel-line"></div><div class="mdy-skel-line short"></div></div></div>
    <div class="mdy-skel-row"><div class="mdy-skel-art"></div><div class="mdy-skel-lines"><div class="mdy-skel-line"></div><div class="mdy-skel-line short"></div></div></div>
    <div class="mdy-skel-row"><div class="mdy-skel-art"></div><div class="mdy-skel-lines"><div class="mdy-skel-line"></div><div class="mdy-skel-line short"></div></div></div>
    <div class="mdy-skel-row"><div class="mdy-skel-art"></div><div class="mdy-skel-lines"><div class="mdy-skel-line"></div><div class="mdy-skel-line short"></div></div></div>
  `;
  let _skelTarget = null;
  function setLoading(on, text, resultsId) {
    const el = $('mdy-loading');
    if (text) $('mdy-loading-text').textContent = text;
    el?.classList.toggle('on', on);
    // Inline skeleton in the results container, if one was passed
    if (on && resultsId) {
      const container = $(resultsId);
      if (container) {
        container.innerHTML = SKELETON_HTML;
        container.dataset.skel = '1';
        _skelTarget = container;
      }
    } else if (!on && _skelTarget) {
      // Clear skeleton only if the container still has a skeleton (renderTracks may have already replaced it)
      if (_skelTarget.dataset.skel === '1') {
        _skelTarget.innerHTML = '';
        delete _skelTarget.dataset.skel;
      }
      _skelTarget = null;
    }
  }
  function showErr(id, msg) { const e = $(id); if (e) { e.textContent = msg; e.classList.add('on'); } }
  function clearErr(id) { const e = $(id); if (e) e.classList.remove('on'); }
  function showToast(msg) { toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 2200); }
  function showPane(name) {
    activeTab = name;
    $$('.mdy-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.mdy-pane').forEach(p => p.classList.toggle('active', p.id === 'mdy-pane-' + name));
    safeSet({ activeTab: name });
    if (name === 'taste') renderTaste();
    if (name === 'settings') renderSettings();
  }
  function togglePanel(open) {
    if (open === undefined) open = !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    if (open) bubble.classList.add('minimized');
    // NOTE: We do NOT persist panel open state. Panel only opens when user clicks bubble.
  }

  // ── Persistence ─────────────────────────────────────────
  function persistTaste() { safeSet({ tasteProfile: JSON.stringify(tasteProfile) }); }
  function persistBl() { safeSet({ blacklist: JSON.stringify([...blacklist]) }); }

  // ── Taste profile learning ──────────────────────────────
  function learnFromSearch(q, kind) {
    tasteProfile.searches.unshift({ q, kind, at: Date.now() });
    tasteProfile.searches = tasteProfile.searches.slice(0, 20);
    if (kind === 'mood') {
      tasteProfile.moodCounts[q] = (tasteProfile.moodCounts[q] || 0) + 1;
    }
    const hr = new Date().getHours();
    const slot = hr < 6 ? 'late_night' : hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : hr < 22 ? 'evening' : 'late_night';
    tasteProfile.timeOfDayCounts[slot] = (tasteProfile.timeOfDayCounts[slot] || 0) + 1;
    persistTaste();
  }
  function learnFromSave(t) {
    const a = t.artist?.split(',')[0]?.trim();
    if (a && !tasteProfile.likedArtists.includes(a)) {
      tasteProfile.likedArtists.unshift(a);
      tasteProfile.likedArtists = tasteProfile.likedArtists.slice(0, 30);
    }
    tasteProfile.savedCount = (tasteProfile.savedCount || 0) + 1;
    tasteProfile.history.unshift({ name: t.name, artist: t.artist, savedAt: Date.now() });
    tasteProfile.history = tasteProfile.history.slice(0, 50);
    persistTaste();
  }
  function learnFromBlock(t) {
    const a = t.artist?.split(',')[0]?.trim();
    if (a && !tasteProfile.dislikedArtists.includes(a)) {
      tasteProfile.dislikedArtists.push(a);
      tasteProfile.dislikedArtists = tasteProfile.dislikedArtists.slice(0, 15);
    }
    tasteProfile.blockedCount = (tasteProfile.blockedCount || 0) + 1;
    persistTaste();
  }
  function filterBl(tracks) { return tracks.filter(t => !blacklist.has(t.id)); }

  // ── PLATFORM URL BUILDERS ───────────────────────────────
  function platUrl(platform, t) {
    const q = encodeURIComponent(`${t.artist} ${t.name}`);
    const map = {
      spotify: `https://open.spotify.com/search/${q}`,
      apple: `https://music.apple.com/search?term=${q}`,
      youtube: `https://music.youtube.com/search?q=${q}`,
      tidal: `https://tidal.com/search?q=${q}`,
      amazon: `https://music.amazon.com/search/${q}`,
      deezer: `https://www.deezer.com/search/${q}`
    };
    return map[platform] || map.spotify;
  }

  // ── Cover art via iTunes Search API (free, no auth) ─────
  const coverCache = new Map();  // id -> url
  async function fetchCoverArt(t) {
    if (coverCache.has(t.id)) return coverCache.get(t.id);
    try {
      const q = encodeURIComponent(`${t.artist} ${t.name}`);
      const url = `https://itunes.apple.com/search?term=${q}&entity=song&limit=1`;
      const r = await fetch(url);
      if (!r.ok) { coverCache.set(t.id, null); return null; }
      const data = await r.json();
      const result = data.results?.[0];
      if (result?.artworkUrl100) {
        // Bump to higher resolution (iTunes serves up to 600x600)
        const hiRes = result.artworkUrl100.replace('100x100', '300x300');
        coverCache.set(t.id, hiRes);
        return hiRes;
      }
      coverCache.set(t.id, null);
      return null;
    } catch (e) {
      coverCache.set(t.id, null);
      return null;
    }
  }

  // ── Auto-detect provider from key format ────────────────
  function detectProvider(key) {
    if (!key) return null;
    const k = key.trim();
    if (k.startsWith('sk-ant')) return 'claude';
    if (k.startsWith('sk-proj-') || k.startsWith('sk-')) return 'openai';
    // Gemini keys are alphanumeric with dashes/underscores, ~39 chars
    if (k.length >= 30 && /^[A-Za-z0-9_-]+$/.test(k)) return 'gemini';
    return null;
  }

  // ── AI: gets REAL songs ─────────────────────────────────
  async function aiGetSongs(input, mode) {
    if (!userApiKey || userApiKey.length < 20) {
      throw new Error('No API key. Open Settings and add your AI key (Gemini is free).');
    }
    const provider = detectProvider(userApiKey);
    if (!provider) {
      throw new Error('Unknown key format. Use a Gemini, Claude (sk-ant), or OpenAI (sk-) key.');
    }
    userProvider = provider;

    // ── Taste/genre blend ──
    // The "fingerprint" is what makes Moodify feel personal: artists they love +
    // genres they pick get baked into every prompt so genres actually steer picks.
    const liked = tasteProfile.likedArtists.slice(0, 6);
    const genres = (tasteProfile.likedGenres || []).slice(0, 3);
    const disliked = tasteProfile.dislikedArtists.slice(0, 4);
    const recent = tasteProfile.searches.slice(0, 3).map(s => s.q).filter(Boolean);

    let fingerprint = '';
    if (liked.length || genres.length) {
      const parts = [];
      if (liked.length) parts.push(`Their favorite artists: ${liked.join(', ')}.`);
      if (genres.length) parts.push(`Genres they reach for: ${genres.join(', ')}.`);
      if (disliked.length) parts.push(`Avoid: ${disliked.join(', ')}.`);
      if (recent.length) parts.push(`Recent vibes: ${recent.join(', ')}.`);
      fingerprint = `\n\nUser fingerprint:\n${parts.join('\n')}\n\nWhen genres differ from typical artist genres, deliberately pick songs that BLEND both worlds (e.g. rap artists + metal genre = aggressive trap-metal crossover, indie-electronic, etc). Genre weight is roughly equal to artist weight.`;
    }

    const systems = {
      mood: `You are a music curator with deep knowledge across genres and eras. The user describes a mood, vibe, or situation. Return ONLY a valid JSON array of 12 real songs that fit. Each: {"name":"Song Title","artist":"Artist Name","album":"Album Name","why":"one short reason (under 12 words) why this fits"}. All songs must actually exist. No markdown, no preamble.${fingerprint}`,
      genre: `You are a music curator. Return ONLY a valid JSON array of 12 real songs for this genre. Mix iconic anchors with deeper cuts. Each: {"name":"Song Title","artist":"Artist Name","album":"Album Name","why":"brief note"}. No markdown.${fingerprint}`,
      artist: `You are a music curator. The user names an artist. Return ONLY a valid JSON array of 12 real songs: 4 by the named artist, 8 by genuinely similar artists across the user's preferred genres. Each: {"name":"Song Title","artist":"Artist Name","album":"Album Name","why":"brief note"}. No markdown.${fingerprint}`,
      underground: `You are a music curator who specializes in deep cuts and rising artists. Return ONLY a valid JSON array of 12 genuinely lesser-known songs that share the SAME musical vibe and sonic palette as the input. Rules: no chart hits, prioritize smaller artists, regional acts, B-sides, or rising artists. Vibe match matters more than how obscure it is. Each: {"name":"Song Title","artist":"Artist Name","album":"Album Name","why":"why it matches the vibe (under 14 words)"}. No markdown.${fingerprint}`,
      personalized: `You are a music curator. Build a personalized 12-song playlist mixing favorites with fresh discoveries that match the user's fingerprint. Each: {"name":"Song Title","artist":"Artist Name","album":"Album Name","why":"brief reason"}. No markdown.${fingerprint}`
    };
    const systemPrompt = systems[mode] || systems.mood;

    let rawText = '';
    if (provider === 'claude') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': userApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 900,
          system: systemPrompt,
          messages: [{ role: 'user', content: input }]
        })
      });
      if (!r.ok) { let msg='AI error'; try{const e=await r.json();msg=e.error?.message||msg;}catch{} throw new Error(msg); }
      const data = await r.json();
      rawText = data.content?.[0]?.text || '';
    } else if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 900,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input }
          ]
        })
      });
      if (!r.ok) { let msg='AI error'; try{const e=await r.json();msg=e.error?.message||msg;}catch{} throw new Error(msg); }
      const data = await r.json();
      rawText = data.choices?.[0]?.message?.content || '';
    } else {
      // Gemini (default, free tier)
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(userApiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: input }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.9, maxOutputTokens: 1100 }
        })
      });
      if (!r.ok) { let msg='AI error'; try{const e=await r.json();msg=e.error?.message||msg;}catch{} throw new Error(msg); }
      const data = await r.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    let txt = rawText.replace(/```json|```/g, '').trim();
    const start = txt.indexOf('[');
    const end = txt.lastIndexOf(']');
    if (start !== -1 && end !== -1) txt = txt.slice(start, end + 1);
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch { throw new Error('Got a weird response. Try again.'); }
    if (!Array.isArray(parsed)) throw new Error('Unexpected response shape.');
    return parsed.map(t => ({
      id: `${t.artist}-${t.name}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name: t.name,
      artist: t.artist,
      album: t.album || '',
      why: t.why || ''
    }));
  }

  // ── Generate flows ──────────────────────────────────────
  async function genMood(shuffle = false) {
    const mood = $('mdy-mood-input').value.trim();
    if (!mood) { showToast('Describe your mood first'); return; }
    clearErr('mdy-mood-err');
    setLoading(true, 'Finding songs that match…', 'mdy-mood-results');
    try {
      learnFromSearch(mood, 'mood');
      const tracks = filterBl(await aiGetSongs(mood, 'mood'));
      if (!tracks.length) throw new Error('No tracks found - try rephrasing');
      renderTracks('mdy-mood-results', tracks);
      currentTracks = tracks;
      $('mdy-mood-regen').style.display = 'flex';
      safeSet({ savedMoodResults: tracks, savedMoodText: mood });
    } catch (e) { showErr('mdy-mood-err', e.message); }
    finally { setLoading(false); }
  }

  async function genGenre(shuffle = false) {
    if (!lastGenre) { showToast('Pick a genre first'); return; }
    clearErr('mdy-genre-err');
    setLoading(true, `Finding ${lastGenre} tracks…`, 'mdy-genre-results');
    try {
      learnFromSearch(lastGenre, 'genre');
      const tracks = filterBl(await aiGetSongs(lastGenre, 'genre'));
      if (!tracks.length) throw new Error('No tracks found');
      renderTracks('mdy-genre-results', tracks);
      currentTracks = tracks;
      $('mdy-genre-regen').style.display = 'flex';
      safeSet({ savedGenreResults: tracks, savedGenre: lastGenre });
    } catch (e) { showErr('mdy-genre-err', e.message); }
    finally { setLoading(false); }
  }

  async function genArtist(gemsMode = false, shuffle = false) {
    const artist = $('mdy-artist-input').value.trim();
    if (!artist) { showToast('Enter an artist'); return; }
    lastArtist = artist;
    clearErr('mdy-artist-err');
    setLoading(true, gemsMode ? 'Hunting hidden gems…' : `Finding similar to ${artist}…`, 'mdy-artist-results');
    try {
      learnFromSearch(artist, 'artist');
      const mode = gemsMode ? 'underground' : 'artist';
      const tracks = filterBl(await aiGetSongs(artist, mode));
      if (!tracks.length) throw new Error('No tracks found - try a different artist');
      if (gemsMode) tracks.forEach((t, i) => { if (i > 3) t._gem = true; });
      renderTracks('mdy-artist-results', tracks);
      currentTracks = tracks;
      $('mdy-artist-regen').style.display = 'flex';
      safeSet({ savedArtistResults: tracks, savedArtist: artist });
    } catch (e) { showErr('mdy-artist-err', e.message); }
    finally { setLoading(false); }
  }

  async function genPersonalized() {
    setLoading(true, 'Picking songs for you…', 'mdy-taste-recs');
    try {
      const seed = `Build me a personalized playlist. I tend to like ${tasteProfile.likedArtists.slice(0, 5).join(', ') || 'a variety of music'}.`;
      const tracks = filterBl(await aiGetSongs(seed, 'personalized'));
      renderTracks('mdy-taste-recs', tracks);
    } catch (e) { showToast(e.message); }
    finally { setLoading(false); }
  }

  // ── Render tracks (with platform buttons) ───────────────
  function renderTracks(containerId, tracks) {
    const container = typeof containerId === 'string' ? $(containerId) : containerId;
    if (!container) return;
    container.innerHTML = '';
    delete container.dataset.skel; // skeleton (if any) is gone now

    tracks.forEach((t, i) => {
      const isBlocked = blacklist.has(t.id);

      const row = document.createElement('div');
      row.className = 'mdy-track';

      // Number
      const num = document.createElement('span');
      num.className = 'mdy-track-num';
      num.textContent = i + 1;
      row.appendChild(num);

      // Art (letter avatar, replaced with cover art when iTunes responds)
      const art = document.createElement('div');
      art.className = 'mdy-track-art';
      art.textContent = (t.artist || '?').charAt(0).toUpperCase();
      row.appendChild(art);

      // Cover art: first 4 fetch immediately, rest are deferred so the
      // results render fast and we don't hammer iTunes with 12 simultaneous
      // requests on every regenerate.
      const loadArt = () => {
        fetchCoverArt(t).then(url => {
          if (url) {
            art.style.backgroundImage = `url('${url}')`;
            art.style.backgroundSize = 'cover';
            art.style.backgroundPosition = 'center';
            art.textContent = '';
          }
        }).catch(() => { /* keep letter fallback */ });
      };
      if (i < 4) {
        loadArt();
      } else {
        // Stagger: each later track waits a bit longer than the last
        setTimeout(loadArt, (i - 3) * 80);
      }

      // Info - clicking opens preferred platform
      const info = document.createElement('div');
      info.className = 'mdy-track-info';
      info.style.cursor = 'pointer';
      info.innerHTML = `
        <div class="mdy-track-name">${esc(t.name)}${t._gem ? '<span class="mdy-badge">GEM</span>' : ''}</div>
        <div class="mdy-track-meta">${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}</div>
        ${t.why ? `<div class="mdy-track-why">${esc(t.why)}</div>` : ''}
      `;
      info.addEventListener('click', e => {
        e.stopPropagation();
        openLink(platUrl(preferredPlatform, t));
      });
      row.appendChild(info);

      // Platform buttons - only show user's chosen platforms
      const acts = document.createElement('div');
      acts.className = 'mdy-t-actions';

      const allPlatBtns = {
        spotify:  { cls: 'mdy-plat-sp',  label: 'SP', title: 'Spotify' },
        apple:    { cls: 'mdy-plat-am',  label: 'AM', title: 'Apple Music' },
        youtube:  { cls: 'mdy-plat-yt',  label: 'YT', title: 'YouTube Music' },
        tidal:    { cls: 'mdy-plat-tdl', label: 'TD', title: 'Tidal' },
        amazon:   { cls: 'mdy-plat-amz', label: 'AZ', title: 'Amazon Music' },
        deezer:   { cls: 'mdy-plat-dz',  label: 'DZ', title: 'Deezer' }
      };
      const showPlats = (displayPlatforms && displayPlatforms.length > 0) ? displayPlatforms : ['spotify', 'apple'];
      showPlats.forEach(p => {
        const pb = allPlatBtns[p];
        if (!pb) return;
        const b = document.createElement('button');
        b.className = `mdy-plat-btn ${pb.cls}`;
        b.textContent = pb.label;
        b.title = `Open on ${pb.title}`;
        b.addEventListener('click', e => { e.stopPropagation(); openLink(platUrl(p, t)); });
        acts.appendChild(b);
      });

      // Save
      const saveBtn = document.createElement('button');
      saveBtn.className = 'mdy-mtb';
      saveBtn.title = 'Save - Moodify learns your taste';
      saveBtn.innerHTML = '♡';
      saveBtn.addEventListener('click', e => {
        e.stopPropagation();
        learnFromSave(t);
        saveBtn.innerHTML = '♥';
        saveBtn.classList.add('liked');
        showToast('Saved - Moodify is learning');
      });
      acts.appendChild(saveBtn);

      // Block
      const banBtn = document.createElement('button');
      banBtn.className = 'mdy-mtb';
      banBtn.title = 'Block - never recommend again';
      banBtn.style.fontSize = '14px';
      banBtn.innerHTML = '×';
      banBtn.addEventListener('click', e => {
        e.stopPropagation();
        blacklist.set(t.id, { name: t.name, artist: t.artist });
        persistBl();
        learnFromBlock(t);
        row.style.opacity = '0';
        row.style.transition = 'opacity .3s';
        setTimeout(() => row.remove(), 300);
        showToast('Blocked');
      });
      acts.appendChild(banBtn);

      row.appendChild(acts);
      container.appendChild(row);
    });
  }

  // ── Render Taste pane ───────────────────────────────────
  function renderTaste() {
    $('mdy-stat-saved').textContent = tasteProfile.savedCount || 0;
    $('mdy-stat-searches').textContent = tasteProfile.searches.length;
    $('mdy-stat-artists').textContent = tasteProfile.likedArtists.length;
    $('mdy-stat-blocked').textContent = tasteProfile.blockedCount || 0;

    const hasData = tasteProfile.likedArtists.length > 0 || tasteProfile.searches.length > 0 || tasteProfile.savedCount > 0;
    $('mdy-taste-empty').style.display = hasData ? 'none' : 'block';

    // Personalized recs section (only if user has saved artists)
    if (tasteProfile.likedArtists.length >= 2) {
      $('mdy-taste-recs-wrap').style.display = 'flex';
      $('mdy-taste-recs-wrap').style.flexDirection = 'column';
      $('mdy-taste-recs-wrap').style.gap = '8px';
    } else {
      $('mdy-taste-recs-wrap').style.display = 'none';
    }

    // Liked artists
    const aWrap = $('mdy-taste-artists-wrap');
    const aList = $('mdy-taste-artists');
    if (tasteProfile.likedArtists.length) {
      aWrap.style.display = 'block';
      aList.innerHTML = '';
      tasteProfile.likedArtists.slice(0, 12).forEach((a, i) => {
        const row = document.createElement('div');
        row.className = 'mdy-list-item';
        row.style.cursor = 'pointer';
        row.innerHTML = `
          <div style="display:flex;align-items:center;gap:9px;">
            <span style="font-size:10px;color:#4e4c44;width:14px;">${i + 1}</span>
            <div class="mdy-track-art" style="width:28px;height:28px;font-size:12px;">${esc(a.charAt(0).toUpperCase())}</div>
            <span style="font-size:12px;color:#f0ede2;">${esc(a)}</span>
          </div>
          <span style="font-size:10px;color:#5e5c54;">→</span>
        `;
        row.addEventListener('click', () => {
          $('mdy-artist-input').value = a;
          showPane('artists');
          genArtist(false);
        });
        aList.appendChild(row);
      });
    } else { aWrap.style.display = 'none'; }

    // Recent searches
    const sWrap = $('mdy-taste-searches-wrap');
    const sList = $('mdy-taste-searches');
    if (tasteProfile.searches.length) {
      sWrap.style.display = 'block';
      sList.innerHTML = '';
      tasteProfile.searches.slice(0, 8).forEach(s => {
        const c = document.createElement('button');
        c.className = 'mdy-chip';
        c.textContent = s.q;
        c.addEventListener('click', () => {
          if (s.kind === 'mood') { $('mdy-mood-input').value = s.q; showPane('mood'); genMood(); }
          else if (s.kind === 'artist') { $('mdy-artist-input').value = s.q; showPane('artists'); genArtist(false); }
          else if (s.kind === 'genre') { lastGenre = s.q; showPane('genres'); genGenre(); }
        });
        sList.appendChild(c);
      });
    } else { sWrap.style.display = 'none'; }
  }

  // ── Render Settings pane ────────────────────────────────
  function renderSettings() {
    // Provider label next to "AI key"
    const srcLabel = $('mdy-set-source-label');
    if (srcLabel) {
      if (userApiKey) {
        const labels = { gemini: '· Gemini', claude: '· Anthropic', openai: '· OpenAI' };
        srcLabel.textContent = labels[userProvider] || '';
      } else {
        srcLabel.textContent = '· not set';
      }
    }

    // Pre-fill API key (mask the middle)
    const keyInput = $('mdy-set-key');
    if (keyInput && userApiKey) {
      const k = userApiKey;
      keyInput.value = k.slice(0, Math.min(8, k.length - 4)) + '...' + k.slice(-4);
      keyInput.dataset.masked = 'true';
      keyInput.addEventListener('focus', function clearMask() {
        if (keyInput.dataset.masked === 'true') {
          keyInput.value = '';
          keyInput.dataset.masked = 'false';
        }
      }, { once: true });
    }

    // Blocked
    const bl = $('mdy-bl-list');
    $('mdy-bl-cnt').textContent = blacklist.size ? `(${blacklist.size})` : '';
    bl.innerHTML = blacklist.size ? '' : '<div style="color:#4e4c44;font-size:11px;padding:4px 0;">No blocked songs.</div>';
    blacklist.forEach((v, k) => {
      const row = document.createElement('div');
      row.className = 'mdy-list-item';
      row.innerHTML = `<div class="mdy-li-info"><div class="mdy-li-name">${esc(v.name)}</div><div class="mdy-li-meta">${esc(v.artist)}</div></div><button class="mdy-btn mdy-btn-ghost mdy-btn-xs">Unblock</button>`;
      row.querySelector('button').addEventListener('click', () => { blacklist.delete(k); persistBl(); renderSettings(); showToast('Unblocked'); });
      bl.appendChild(row);
    });
  }

  function exportTaste() {
    const data = JSON.stringify({ tasteProfile, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    // Use fresh-tab path so this doesn't replace the music player tab
    if (isContextValid()) {
      try { chrome.runtime.sendMessage({ type: 'OPEN_TAB_FRESH', url }); }
      catch { window.open(url, '_blank'); }
    } else { window.open(url, '_blank'); }
    showToast('Taste profile exported');
  }

  function resetTaste() {
    tasteProfile = {
      likedArtists: [], likedGenres: [], dislikedArtists: [],
      searches: [], history: [],
      savedCount: 0, blockedCount: 0,
      moodCounts: {}, timeOfDayCounts: {}, sessionStart: Date.now()
    };
    persistTaste();
    renderTaste();
    renderSettings();
    showToast('Taste profile reset');
  }

  // ── Wire up events ──────────────────────────────────────

  // ── ONBOARDING ──────────────────────────────────────────
  let obSelectedPlats = [];

  function showOnboard(stepNum) {
    $('mdy-onboard').classList.add('show');
    shadow.querySelectorAll('.mdy-ob-step').forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.step) === stepNum);
    });
  }
  function hideOnboard() {
    $('mdy-onboard').classList.remove('show');
  }

  // Step 1: Get started → go to API key step
  $('mdy-ob-start').addEventListener('click', () => showOnboard(2));

  // Step 2: API key (required)
  $('mdy-ob-key').addEventListener('input', () => {
    const v = $('mdy-ob-key').value.trim();
    const prov = detectProvider(v);
    const valid = v.length > 20 && prov !== null;
    $('mdy-ob-key-next').disabled = !valid;
    if (v.length > 0 && !valid) {
      $('mdy-ob-key-hint').textContent = 'That doesn\'t look like a valid key. Try again.';
      $('mdy-ob-key-hint').style.color = '#a89878';
    } else if (valid) {
      const labels = { gemini: 'Gemini', claude: 'Anthropic', openai: 'OpenAI' };
      $('mdy-ob-key-hint').textContent = `Detected: ${labels[prov]} key. Looks good.`;
      $('mdy-ob-key-hint').style.color = '#dedfcf';
    } else {
      $('mdy-ob-key-hint').textContent = 'Stays in your browser. Never sent anywhere except the AI provider.';
      $('mdy-ob-key-hint').style.color = '#8a877c';
    }
  });
  $('mdy-ob-key-next').addEventListener('click', async () => {
    const key = $('mdy-ob-key').value.trim();
    if (!key || !detectProvider(key)) { showToast('Add a valid key first'); return; }
    userApiKey = key;
    userProvider = detectProvider(key);
    await safeSet({ userApiKey: key });
    showOnboard(3);
  });

  // Step 3: Pick platforms (max 2)
  shadow.querySelectorAll('.mdy-ob-plat').forEach(b => {
    b.addEventListener('click', () => {
      const p = b.dataset.p;
      if (b.classList.contains('sel')) {
        b.classList.remove('sel');
        obSelectedPlats = obSelectedPlats.filter(x => x !== p);
      } else if (obSelectedPlats.length < 2) {
        b.classList.add('sel');
        obSelectedPlats.push(p);
      } else {
        $('mdy-ob-plat-hint').textContent = 'Max 2. Tap one to deselect first.';
        $('mdy-ob-plat-hint').style.color = '#a89878';
        return;
      }
      $('mdy-ob-plat-hint').textContent = obSelectedPlats.length === 0 ? 'Pick up to 2.' : `${obSelectedPlats.length} selected`;
      $('mdy-ob-plat-hint').style.color = '#8a877c';
      $('mdy-ob-plats-next').disabled = obSelectedPlats.length === 0;
    });
  });
  $('mdy-ob-plats-next').addEventListener('click', () => showOnboard(4));

  // Step 4: Two artists
  $('mdy-ob-artists-next').addEventListener('click', () => {
    const a1 = $('mdy-ob-artist-1').value.trim();
    const a2 = $('mdy-ob-artist-2').value.trim();
    if (!a1 && !a2) {
      $('mdy-ob-artist-1').focus();
      return;
    }
    [a1, a2].filter(Boolean).forEach(a => {
      if (!tasteProfile.likedArtists.includes(a)) tasteProfile.likedArtists.unshift(a);
    });
    persistTaste();
    showOnboard(5);
  });

  // Step 5: Pick up to 3 genres
  let obSelectedGenres = [];
  shadow.querySelectorAll('.mdy-ob-genre').forEach(b => {
    b.addEventListener('click', () => {
      const g = b.dataset.g;
      if (b.classList.contains('sel')) {
        b.classList.remove('sel');
        obSelectedGenres = obSelectedGenres.filter(x => x !== g);
      } else if (obSelectedGenres.length < 3) {
        b.classList.add('sel');
        obSelectedGenres.push(g);
      } else {
        $('mdy-ob-genre-hint').textContent = 'Max 3. Tap one to deselect first.';
        $('mdy-ob-genre-hint').style.color = '#a89878';
        return;
      }
      $('mdy-ob-genre-hint').textContent = obSelectedGenres.length === 0
        ? 'Pick 1, 2, or 3.'
        : `${obSelectedGenres.length} selected`;
      $('mdy-ob-genre-hint').style.color = '#8a877c';
      $('mdy-ob-finish').disabled = obSelectedGenres.length === 0;
    });
  });
  $('mdy-ob-finish').addEventListener('click', async () => {
    if (obSelectedPlats.length > 0) {
      preferredPlatform = obSelectedPlats[0];
      displayPlatforms = obSelectedPlats;
      await safeSet({ preferredPlatform, displayPlatforms });
    }
    if (obSelectedGenres.length > 0) {
      tasteProfile.likedGenres = obSelectedGenres.slice();
      persistTaste();
    }
    await safeSet({ onboarded: true });
    updatePlatformDisplay();
    hideOnboard();
    showToast('Setup complete. Try a mood, hit Find songs.');
  });

  // ── Standard wiring ─────────────────────────────────────
  bubble.addEventListener('click', () => togglePanel(true));
  $('mdy-min-btn').addEventListener('click', () => togglePanel(false));

  $$('.mdy-tab').forEach(t => t.addEventListener('click', () => showPane(t.dataset.tab)));

  // Mood
  $$('#mdy-mood-chips .mdy-chip').forEach(c => c.addEventListener('click', () => {
    $('mdy-mood-input').value = c.dataset.m;
  }));
  $('mdy-mood-gen').addEventListener('click', () => genMood(false));
  $('mdy-mood-regen').addEventListener('click', () => genMood(true));
  $('mdy-mood-input').addEventListener('input', () => safeSet({ savedMoodText: $('mdy-mood-input').value }));

  // Genre
  $$('.mdy-genre-card').forEach(c => c.addEventListener('click', () => {
    $$('.mdy-genre-card').forEach(x => x.classList.remove('sel'));
    c.classList.add('sel');
    lastGenre = c.dataset.g;
    $('mdy-genre-gen-wrap').style.display = 'flex';
    $('mdy-genre-gen-wrap').style.gap = '6px';
    safeSet({ savedGenre: lastGenre });
  }));
  $('mdy-genre-gen').addEventListener('click', () => genGenre(false));
  $('mdy-genre-regen').addEventListener('click', () => genGenre(true));

  // Artist
  $('mdy-artist-gen').addEventListener('click', () => genArtist(false));
  $('mdy-artist-gems').addEventListener('click', () => genArtist(true));
  $('mdy-artist-regen').addEventListener('click', () => genArtist(false, true));
  $('mdy-artist-input').addEventListener('keydown', e => { if (e.key === 'Enter') genArtist(false); });
  $('mdy-artist-input').addEventListener('input', () => safeSet({ savedArtist: $('mdy-artist-input').value }));

  // Taste
  $('mdy-personalized-refresh').addEventListener('click', genPersonalized);

  // Settings
  $$('.mdy-plat-pick').forEach(b => b.addEventListener('click', () => {
    $$('.mdy-plat-pick').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
    preferredPlatform = b.dataset.p;
    safeSet({ preferredPlatform });
    showToast(`Default: ${b.textContent}`);
  }));
  $('mdy-export-taste').addEventListener('click', exportTaste);
  $('mdy-reset-taste').addEventListener('click', resetTaste);

  // API key save in Settings
  $('mdy-set-key-save').addEventListener('click', async () => {
    const newKey = $('mdy-set-key').value.trim();
    const prov = detectProvider(newKey);
    if (!newKey || newKey.length < 20 || !prov) {
      showToast('Invalid key format');
      return;
    }
    userApiKey = newKey;
    userProvider = prov;
    await safeSet({ userApiKey: newKey });
    const labels = { gemini: 'Gemini', claude: 'Anthropic', openai: 'OpenAI' };
    showToast(`${labels[prov]} key saved`);
    renderSettings();
  });

  // Drag panel
  let dragging = false, dragStartX = 0, dragStartY = 0, panelStartLeft = 0, panelStartTop = 0;
  $('mdy-head').addEventListener('mousedown', e => {
    if (e.target.closest('.mdy-ibtn')) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    dragStartX = e.clientX; dragStartY = e.clientY;
    panelStartLeft = rect.left; panelStartTop = rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newLeft = panelStartLeft + (e.clientX - dragStartX);
    const newTop = panelStartTop + (e.clientY - dragStartY);
    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; const r = panel.getBoundingClientRect(); safeSet({ panelX: r.left, panelY: r.top }); }
  });

  // Listen for popup-launcher message
  if (isContextValid()) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'TOGGLE_PANEL') {
        bubble.style.display = '';
        bubble.classList.remove('minimized');
        togglePanel(true);
      }
    });
  }

  // ── Boot: restore state ─────────────────────────────────
  async function loadState() {
    // Set logo images via chrome.runtime.getURL (only available in extension context)
    try {
      if (isContextValid()) {
        const logoUrl = chrome.runtime.getURL('assets/logo-small.png');
        // Set src on ALL logo elements (bubble, brand mark in header, onboarding welcome)
        shadow.querySelectorAll('.mdy-bub-logo, .mdy-brand-logo, .mdy-ob-logo').forEach(img => {
          img.src = logoUrl;
        });
      }
    } catch (e) { /* logo not critical */ }

    const d = await safeGet([
      'blacklist', 'tasteProfile',
      'savedMoodText', 'savedMoodResults',
      'savedGenre', 'savedGenreResults',
      'savedArtist', 'savedArtistResults',
      'panelOpen', 'panelX', 'panelY',
      'preferredPlatform', 'displayPlatforms', 'activeTab', 'onboarded',
      'userApiKey'
    ]);

    if (d.userApiKey) {
      userApiKey = d.userApiKey;
      userProvider = detectProvider(d.userApiKey) || 'gemini';
    }
    if (d.blacklist) try { blacklist = new Map(JSON.parse(d.blacklist)); } catch {}
    if (d.tasteProfile) try { tasteProfile = { ...tasteProfile, ...JSON.parse(d.tasteProfile) }; } catch {}
    if (d.preferredPlatform) {
      preferredPlatform = d.preferredPlatform;
      $$('.mdy-plat-pick').forEach(b => b.classList.toggle('sel', b.dataset.p === preferredPlatform));
    }
    if (d.displayPlatforms?.length) {
      displayPlatforms = d.displayPlatforms;
    }
    if (d.panelX !== undefined && d.panelY !== undefined) {
      panel.style.left = d.panelX + 'px'; panel.style.top = d.panelY + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    }

    if (d.savedMoodText) $('mdy-mood-input').value = d.savedMoodText;
    if (d.savedMoodResults?.length) { renderTracks('mdy-mood-results', d.savedMoodResults); $('mdy-mood-regen').style.display = 'flex'; }
    if (d.savedGenre) {
      lastGenre = d.savedGenre;
      $$('.mdy-genre-card').forEach(c => c.classList.toggle('sel', c.dataset.g === lastGenre));
      $('mdy-genre-gen-wrap').style.display = 'flex';
      $('mdy-genre-gen-wrap').style.gap = '6px';
    }
    if (d.savedGenreResults?.length) { renderTracks('mdy-genre-results', d.savedGenreResults); $('mdy-genre-regen').style.display = 'flex'; }
    if (d.savedArtist) $('mdy-artist-input').value = d.savedArtist;
    if (d.savedArtistResults?.length) { renderTracks('mdy-artist-results', d.savedArtistResults); $('mdy-artist-regen').style.display = 'flex'; }

    if (d.activeTab) showPane(d.activeTab);
    // NOTE: Do NOT auto-open panel on page load. Panel only opens when user clicks the bubble.

    // Show onboarding if first time
    if (!d.onboarded) {
      showOnboard(1);
      togglePanel(true);  // first-time only: open panel so user sees onboarding
    }
  }

  // Update settings UI after platform changes
  function updatePlatformDisplay() {
    $$('.mdy-plat-pick').forEach(b => b.classList.toggle('sel', b.dataset.p === preferredPlatform));
  }

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => { if (isContextValid()) loadState(); }, { timeout: 2000 });
  } else {
    setTimeout(() => { if (isContextValid()) loadState(); }, 100);
  }

})();
