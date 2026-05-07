# Moodify

A Chrome extension that turns how you feel into a list of real songs you can play anywhere.

You type a mood — *"3am driving home from a fight"*, *"deep focus on something I care about"*, *"slow morning, no rush"* — and Moodify gives you twelve real songs that fit. One click opens any of them on Spotify, Apple Music, YouTube Music, Tidal, Amazon Music, or Deezer.

It runs as a floating panel on any web page. There is no separate site, no login, no playlist quotas, no servers I run.

---

## Why this exists (the honest version)

Moodify started life as a Spotify-API project — describe a mood, the model maps it onto Spotify's `energy` / `valence` / `danceability` / `tempo` features, the `/recommendations` endpoint hands back tracks, you save the playlist directly to your account.

Two things broke that plan, both outside my control:

1. **November 27, 2024.** Spotify deprecated `/v1/recommendations`, `/v1/audio-features`, `/v1/audio-analysis`, related-artists, and featured-playlists for all newly-created applications. The endpoints my whole pitch depended on returned 404 for any app created after that date. ([Spotify announcement](https://developer.spotify.com/blog/2024-11-27-changes-to-the-web-api))

2. **February 11, 2026.** Spotify cut Development Mode from 25 users to 5 users per app and made Extended Quota Mode organizations-only with a 250,000 MAU minimum. Solo developers and student projects can no longer scale beyond 5 beta testers, period. ([Spotify announcement](https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security))

So Moodify pivoted. The current architecture:

- **No Spotify API.** No quota cap, no allowlist, no client secret to leak.
- **AI generates real song titles + artists**, scored against the user's saved taste fingerprint (favorite artists + up to three genres).
- **Each result becomes a search-link-out** to whichever streaming service the user prefers. Click "Spotify" on a result and it opens `open.spotify.com/search/<song>`. Same for Apple Music, YouTube Music, Tidal, Amazon Music, Deezer.
- **The AI runs on the user's own API key** (Gemini, Anthropic, or OpenAI). Stored only in the browser. The free Gemini tier is plenty for normal use.

This is a worse demo than "we generate Spotify playlists via mood-to-audio-features." It's a more honest one. The Spotify rules don't allow what I originally pitched. This works for everyone, today, on any service, without quota gymnastics.

---

## Install

### Load as an unpacked extension (Chrome, Edge, Brave, Arc — anything Chromium)

1. Clone or download this repo
2. Open `chrome://extensions`
3. Toggle **Developer mode** (top right)
4. Click **Load unpacked**, pick this folder
5. Pin Moodify to your toolbar
6. Click it on any normal webpage. The 30-second onboarding starts.

### Get an AI key (you'll need one)

Onboarding asks for an AI key. The free Gemini key is what most users want:

1. Open [aistudio.google.com/apikey](https://aistudio.google.com/apikey) in a new tab
2. Sign in with any Google account
3. Click **Create API key** — pick any project
4. Copy the key, paste it into Moodify

If you'd rather use Anthropic (Claude) or OpenAI, paste an `sk-ant-...` or `sk-...` key. Moodify auto-detects which provider it is.

The key stays in `chrome.storage.local`. It is never sent anywhere except the AI provider's endpoint.

---

## How it works

```
┌─────────────────────────┐         ┌────────────────────────┐
│  Moodify panel          │         │  AI provider           │
│  (content.js,           │  POST   │  (Gemini / Anthropic / │
│   shadow DOM injected   │ ──────► │   OpenAI)              │
│   on any web page)      │         │                        │
│                         │ ◄────── │  returns 12 real songs │
│  Click result           │  JSON   │  in JSON               │
│       │                 │         └────────────────────────┘
│       ▼                 │
│  open.spotify.com/search/...
│  music.apple.com/search?term=...
│  music.youtube.com/search?q=...
│  ... etc
└─────────────────────────┘
```

The user's onboarding stores in `chrome.storage.local`:
- 2 favorite artists (taste seed)
- up to 3 favorite genres
- preferred play platform + which platform buttons to display
- the AI key

That's it. No analytics, no telemetry, no remote config. The taste profile (artists you save, songs you block, recent searches) lives entirely in your browser. There is an "Export taste" button so you can take it with you.

### Taste fingerprint

Every prompt the model receives includes a "fingerprint" line built from your saved data. If you favor *Frank Ocean, Steve Lacy, Tame Impala* and pick *r&b, indie, electronic* as your genres, that goes in. If you've saved a few songs (♡), the artists become positive signal; if you've blocked any, those become "avoid" signal.

The system prompt also instructs the model to **deliberately blend** when artists and genres clash. If your artists are rappers but you also picked metal as a genre, the model is told to pick crossover acts (trap-metal, hardcore-rap-rock, etc.) rather than ignoring one signal.

---

## Privacy

- The AI prompt and response go directly from your browser to the AI provider you chose. Nothing routes through any server I run.
- Your taste profile (saved artists, blocked songs, recent searches) lives entirely in your browser's local storage. Clearing the extension's storage erases it.
- The extension uses `<all_urls>` host permission only because the floating panel injects on any page. It does not read page content.

---

## File map

```
manifest.json          Chrome MV3 manifest
background.js          Service worker — reuses one tab for "open in player"
content.js             The whole UI (shadow DOM, ~1600 lines)
popup.html             Toolbar popup
popup-launcher.js      Toolbar popup logic (sends TOGGLE_PANEL)
icons/                 16/48/128 toolbar icons
assets/                In-panel logo
```

---

## Known limitations

- **AI hallucinations.** The model occasionally invents a song that doesn't exist. ~3% in my testing. The search-link-out approach softens this: even if the song is fake, the streaming service shows "no exact match," which the user reads as "skip this one."
- **No in-app playback.** That requires the Spotify Web Playback SDK (Premium-only, quota-restricted). The link-out flow handles this without touching Spotify's API.
- **Cover art.** Pulled from the iTunes Search API (free, no key, generous rate limit). If covers fail to load, the track row still works — it falls back to a letter avatar.
- **Chrome Web Store submission.** Pending. The `<all_urls>` host permission slows review even when the use case is honest.

---

## License

MIT for the code. Logo and brand assets are not licensed for reuse.
