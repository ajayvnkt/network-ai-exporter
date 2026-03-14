# ⚡ Network AI Exporter

**Capture, diff, and export browser network traffic — built for AI-assisted debugging.**

A Chrome DevTools extension that records HTTP requests, compares API responses side-by-side, remembers your localhost ports with custom labels, and exports everything in formats ready to paste into ChatGPT, Claude, or any AI assistant.

---

## What it does

| Feature | Description |
|--------|-------------|
| **● Record** | Start/stop capturing every request the page makes. Method, URL, status, headers, and bodies — all in one table. |
| **⇄ Diff** | Pick any two requests and see a **field-level JSON diff**: added, removed, changed, and unchanged keys in a flattened view. No more eyeballing two responses. |
| **🔌 Localhost memory** | Label ports like `3000` → "React – ProjectX" or `8080` → "API server". Labels persist and show as badges next to every localhost URL. Detects unlabelled ports from your session so you can name them in one click. |
| **⬇ HAR** | Export a standard HAR file for tools that speak HAR. |
| **🤖 AI Export** | Download a JSON bundle (request/response + headers + your localhost labels) tailored for feeding into an AI. |
| **📋 Summary** | One text file: domains, error counts, slow requests (>500ms), and a full request list. |
| **📋 Copy Prompt** | Copies a ready-made analysis prompt plus the first 50 requests in AI-friendly format. Paste into your favorite LLM and ask it to find errors, performance issues, or anomalies. |

The panel lives under **Chrome DevTools → Network AI**. Open DevTools, switch to the "Network AI" tab, hit Record, and use your app. When you're done, filter, diff, or export.

---

## Install

1. **Clone or download** this repo.
2. Open Chrome → `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `network-ai-exporter` folder (the one containing `manifest.json`).
5. Open any page, then **DevTools (F12)** → find the **Network AI** tab.

No account, no backend — everything runs in the browser. Labels are stored in Chrome’s local storage.

---

## Quick start

1. Open a site (or your localhost app).
2. Open DevTools → **Network AI** tab.
3. Click **● Record** (it turns green while recording).
4. Navigate or trigger the requests you care about.
5. Click **■ Stop** when done.
6. Use the table: **click a row** for request/response/headers, **check two rows** and click **⇄ Diff** to compare responses, or use **🔌 Localhost** to name ports.
7. Export via **🤖 AI Export** or **📋 Copy Prompt** and paste into your AI chat.

Existing requests in the Network tab are loaded when you open the panel, so you can also just open DevTools and export without recording.

---

## Project layout

```
network-ai-exporter/
├── manifest.json     # MV3 extension manifest
├── devtools.html     # DevTools entry
├── devtools.js       # Creates the "Network AI" panel
├── panel.html        # Main UI (toolbar, table, detail, diff, modal)
├── panel.js          # Recording, filters, diff, localhost, exports
├── icons/            # 16, 48, 128px icons
└── README.md
```

---

## Tech

- **Chrome Extension Manifest V3**
- **chrome.devtools.network** for HAR and request finished events
- **chrome.storage.local** for localhost port labels
- No build step — plain HTML, CSS, and JS

---

## Permissions

- **`storage`** — to persist localhost port labels.

The extension only runs inside DevTools and does not inject scripts into pages or read data from sites you don’t open in DevTools yourself.

---

## Tips

- **Filter** by URL substring, HTTP method, or status (2xx / 3xx / 4xx / 5xx). Exports and summary use the filtered list.
- **Diff** flattens JSON to dot-notation paths (`user.name`, `items[0].id`) so nested changes are easy to spot.
- **Copy Prompt** limits to 50 requests to keep context size reasonable; use **AI Export** for the full set and attach the file if your AI supports it.

---

**v1.1.0** · [Report an issue](https://github.com/ajayvnkt/network-ai-exporter/issues) · [View on GitHub](https://github.com/ajayvnkt/network-ai-exporter)
