// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════
let requests     = [];
let isRecording  = false;
let selectedIndex = null;
let activeTab    = 'request';
let diffSelected = [];          // up to 2 request IDs for diff
let localhostMap = {};          // port → label  (persisted via chrome.storage)

// ═══════════════════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════════════════
const btnRecord    = document.getElementById('btnRecord');
const btnClear     = document.getElementById('btnClear');
const btnDiff      = document.getElementById('btnDiff');
const btnLocalhost = document.getElementById('btnLocalhost');
const btnExportHar = document.getElementById('btnExportHar');
const btnExportAi  = document.getElementById('btnExportAi');
const btnSummary   = document.getElementById('btnSummary');
const btnCopy      = document.getElementById('btnCopy');
const filterInput  = document.getElementById('filterInput');
const methodFilter = document.getElementById('methodFilter');
const statusFilter = document.getElementById('statusFilter');
const reqBody      = document.getElementById('reqBody');
const emptyState   = document.getElementById('emptyState');
const statsEl      = document.getElementById('stats');
const diffHint     = document.getElementById('diffHint');
const detailPanel  = document.getElementById('detailPanel');
const detailContent= document.getElementById('detailContent');
const toast        = document.getElementById('toast');

// Diff view
const diffView       = document.getElementById('diffView');
const diffClose      = document.getElementById('diffClose');
const diffLabel      = document.getElementById('diffLabel');
const diffSummaryBar = document.getElementById('diffSummaryBar');
const diffCols       = document.getElementById('diffCols');

// Localhost modal
const lhModal  = document.getElementById('lhModal');
const lhClose  = document.getElementById('lhClose');
const lhPort   = document.getElementById('lhPort');
const lhLabel  = document.getElementById('lhLabel');
const lhAdd    = document.getElementById('lhAdd');
const lhList   = document.getElementById('lhList');
const lhDetected     = document.getElementById('lhDetected');
const lhDetectedList = document.getElementById('lhDetectedList');

// ═══════════════════════════════════════════════════════════════════════════
// LOCALHOST MEMORY — load/save
// ═══════════════════════════════════════════════════════════════════════════
function loadLocalhostMap() {
  chrome.storage.local.get('localhostMap', data => {
    localhostMap = data.localhostMap || {};
    renderTable();
  });
}
function saveLocalhostMap() {
  chrome.storage.local.set({ localhostMap });
}

loadLocalhostMap();

// ═══════════════════════════════════════════════════════════════════════════
// RECORD / STOP
// ═══════════════════════════════════════════════════════════════════════════
btnRecord.addEventListener('click', () => {
  isRecording = !isRecording;
  btnRecord.textContent = isRecording ? '■ Stop' : '● Record';
  btnRecord.classList.toggle('recording', isRecording);
  if (isRecording) {
    chrome.devtools.network.onRequestFinished.addListener(onRequest);
    showToast('Recording started…');
  } else {
    chrome.devtools.network.onRequestFinished.removeListener(onRequest);
    showToast('Recording stopped');
  }
});

function onRequest(entry) {
  entry.getContent(content => {
    requests.push(buildRequest(entry, content));
    renderTable();
  });
}

function buildRequest(entry, responseBody) {
  const { request, response, time, startedDateTime } = entry;
  return {
    id: requests.length + 1,
    method: request.method,
    url: request.url,
    status: response.status,
    statusText: response.statusText,
    mimeType: response.content.mimeType || '',
    size: response.bodySize,
    time: Math.round(time),
    timestamp: startedDateTime,
    requestHeaders: request.headers,
    responseHeaders: response.headers,
    requestBody: request.postData ? request.postData.text : null,
    requestBodyMimeType: request.postData ? request.postData.mimeType : null,
    responseBody: responseBody || null,
    queryString: request.queryString,
  };
}

// Load existing HAR on panel open
chrome.devtools.network.getHAR(harLog => {
  if (!harLog || !harLog.entries || !harLog.entries.length) return;
  let pending = harLog.entries.length;
  harLog.entries.forEach(entry => {
    entry.getContent(content => {
      requests.push(buildRequest(entry, content));
      if (--pending === 0) renderTable();
    });
  });
  showToast(`Loaded ${harLog.entries.length} existing requests`);
});

// ═══════════════════════════════════════════════════════════════════════════
// CLEAR
// ═══════════════════════════════════════════════════════════════════════════
btnClear.addEventListener('click', () => {
  requests = []; selectedIndex = null; diffSelected = [];
  detailPanel.style.display = 'none';
  hideDiffView();
  renderTable();
  showToast('Cleared');
});

// ═══════════════════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════════════════
filterInput.addEventListener('input', renderTable);
methodFilter.addEventListener('change', renderTable);
statusFilter.addEventListener('change', renderTable);

function getFiltered() {
  const txt    = filterInput.value.toLowerCase();
  const method = methodFilter.value;
  const status = statusFilter.value;
  return requests.filter(r => {
    if (txt    && !r.url.toLowerCase().includes(txt)) return false;
    if (method && r.method !== method) return false;
    if (status && !String(r.status).startsWith(status)) return false;
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER TABLE
// ═══════════════════════════════════════════════════════════════════════════
function renderTable() {
  const filtered = getFiltered();
  emptyState.style.display = filtered.length === 0 ? 'flex' : 'none';

  reqBody.innerHTML = filtered.map(r => {
    const isDiffA = diffSelected[0] === r.id;
    const isDiffB = diffSelected[1] === r.id;
    const rowClass = isDiffA ? 'diff-a' : isDiffB ? 'diff-b' : selectedIndex === r.id ? 'selected' : '';
    const lhBadge  = getLocalhostBadge(r.url);
    const checked  = diffSelected.includes(r.id);
    return `<tr class="${rowClass}" data-id="${r.id}">
      <td class="cb-col"><input type="checkbox" class="row-cb" data-id="${r.id}" ${checked ? 'checked' : ''}></td>
      <td style="color:#585b70">${r.id}</td>
      <td><span class="method-badge method-${['GET','POST','PUT','PATCH','DELETE'].includes(r.method)?r.method:'OTHER'}">${r.method}</span></td>
      <td class="${statusClass(r.status)}">${r.status||'—'}</td>
      <td title="${escapeHtml(r.url)}">${shortenUrl(r.url)}${lhBadge}</td>
      <td style="color:#585b70">${mimeShort(r.mimeType)}</td>
      <td style="color:#585b70">${formatSize(r.size)}</td>
      <td style="color:#585b70">${r.time}ms</td>
    </tr>`;
  }).join('');

  // Row click → detail
  reqBody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.type === 'checkbox') return;
      const id  = parseInt(row.dataset.id);
      selectedIndex = id;
      showDetail(requests.find(r => r.id === id));
      renderTable();
    });
  });

  // Checkbox click → diff selection
  reqBody.querySelectorAll('.row-cb').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const id = parseInt(cb.dataset.id);
      if (cb.checked) {
        if (diffSelected.length >= 2) {
          diffSelected.shift();         // drop oldest
        }
        diffSelected.push(id);
      } else {
        diffSelected = diffSelected.filter(x => x !== id);
      }
      updateDiffButton();
      renderTable();
    });
  });

  statsEl.textContent = `${filtered.length} / ${requests.length} requests`;
  updateDiffButton();
}

function updateDiffButton() {
  const can = diffSelected.length === 2;
  btnDiff.disabled = !can;
  diffHint.style.display = diffSelected.length === 1 ? 'inline' : 'none';
}

function getLocalhostBadge(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      const port = u.port || '80';
      const label = localhostMap[port];
      if (label) {
        return `<span class="lh-badge" title="Port ${port}: ${label}">${label}</span>`;
      }
    }
  } catch(e) {}
  return '';
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════════════
document.querySelectorAll('.detail-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    const req = requests.find(r => r.id === selectedIndex);
    if (req) showDetail(req);
  });
});

function showDetail(req) {
  detailPanel.style.display = 'flex';
  let content = '';

  if (activeTab === 'request') {
    const body = tryParseJson(req.requestBody);
    content = `<pre>${jsonHighlight(JSON.stringify({
      method: req.method, url: req.url,
      queryString: req.queryString,
      body: body || req.requestBody || null
    }, null, 2))}</pre>`;

  } else if (activeTab === 'response') {
    const body = tryParseJson(req.responseBody);
    content = `<pre>${jsonHighlight(JSON.stringify(
      body || req.responseBody || '(empty)', null, 2
    ))}</pre>`;

  } else if (activeTab === 'headers') {
    content = `<pre>${jsonHighlight(JSON.stringify({
      request: headersToObj(req.requestHeaders),
      response: headersToObj(req.responseHeaders)
    }, null, 2))}</pre>`;

  } else if (activeTab === 'ai') {
    content = `<pre style="color:#a6e3a1">${escapeHtml(formatForAI([req]))}</pre>`;
  }

  detailContent.innerHTML = content;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⇄  API RESPONSE DIFF
// ═══════════════════════════════════════════════════════════════════════════
btnDiff.addEventListener('click', () => {
  if (diffSelected.length !== 2) return;
  const [a, b] = diffSelected.map(id => requests.find(r => r.id === id));
  showDiff(a, b);
});

diffClose.addEventListener('click', hideDiffView);

function hideDiffView() {
  diffView.classList.remove('visible');
  diffView.style.height = '';
}

function showDiff(a, b) {
  // Parse responses
  const bodyA = tryParseJson(a.responseBody) || a.responseBody || '';
  const bodyB = tryParseJson(b.responseBody) || b.responseBody || '';

  // Flatten both to path→value maps
  const flatA = flattenObj(bodyA);
  const flatB = flattenObj(bodyB);

  // Build diff lines
  const allKeys = new Set([...Object.keys(flatA), ...Object.keys(flatB)]);
  const lines = [];
  let added = 0, removed = 0, changed = 0, same = 0;

  allKeys.forEach(key => {
    const va = flatA[key];
    const vb = flatB[key];
    if (va === undefined) {
      lines.push({ key, va: null, vb, type: 'added' }); added++;
    } else if (vb === undefined) {
      lines.push({ key, va, vb: null, type: 'removed' }); removed++;
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
      lines.push({ key, va, vb, type: 'changed' }); changed++;
    } else {
      lines.push({ key, va, vb, type: 'same' }); same++;
    }
  });

  // Sort: changed/added/removed first, then same
  lines.sort((x, y) => {
    const order = { changed: 0, added: 1, removed: 2, same: 3 };
    return (order[x.type] || 3) - (order[y.type] || 3);
  });

  // Summary bar
  diffSummaryBar.innerHTML = `
    <span class="ds-added">+${added} added</span>
    <span class="ds-removed">−${removed} removed</span>
    <span class="ds-changed">~${changed} changed</span>
    <span class="ds-same">${same} same</span>
    <span style="color:#585b70;margin-left:auto;font-size:10px">
      Showing ${lines.length} fields total
    </span>`;

  // Header labels
  diffLabel.textContent = `#${a.id} vs #${b.id}  ·  ${shortenUrlPlain(a.url)} ↔ ${shortenUrlPlain(b.url)}`;

  // Build columns
  const colA = buildDiffColumn(lines, 'va', `#${a.id} — ${a.method} ${shortenUrlPlain(a.url)} [${a.status}]`, 'diff-col-a');
  const colB = buildDiffColumn(lines, 'vb', `#${b.id} — ${b.method} ${shortenUrlPlain(b.url)} [${b.status}]`, 'diff-col-b');
  diffCols.innerHTML = '';
  diffCols.appendChild(colA);
  diffCols.appendChild(colB);

  // Show / size
  diffView.classList.add('visible');
  diffView.style.height = '340px';

  // Hide detail panel to make room
  detailPanel.style.display = 'none';
  showToast(`Diff: ${changed} changed, ${added} added, ${removed} removed`);
}

function buildDiffColumn(lines, side, headerText, cls) {
  const col = document.createElement('div');
  col.className = `diff-col ${cls}`;
  col.innerHTML = `<div class="diff-col-header">${escapeHtml(headerText)}</div>`;

  lines.forEach((line, i) => {
    const val  = line[side];
    const type = line.type;
    const div  = document.createElement('div');
    div.className = `diff-line ${type}`;

    const valStr = val === null || val === undefined
      ? '<span style="color:#585b70">(missing)</span>'
      : escapeHtml(JSON.stringify(val));

    div.innerHTML = `
      <span class="diff-line-num">${i + 1}</span>
      <span class="diff-line-sig"></span>
      <span><span style="color:#89b4fa">${escapeHtml(line.key)}</span>: ${valStr}</span>`;
    col.appendChild(div);
  });

  if (lines.length === 0) {
    col.innerHTML += `<div style="padding:16px;color:#585b70;font-size:12px">No JSON fields found</div>`;
  }
  return col;
}

// Flatten nested object to dot-notation paths
function flattenObj(obj, prefix = '', result = {}) {
  if (obj === null || obj === undefined) return result;
  if (typeof obj !== 'object') { result[prefix || '_value'] = obj; return result; }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flattenObj(v, prefix ? `${prefix}[${i}]` : `[${i}]`, result));
  } else {
    Object.entries(obj).forEach(([k, v]) => {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object') flattenObj(v, path, result);
      else result[path] = v;
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔌  LOCALHOST MEMORY
// ═══════════════════════════════════════════════════════════════════════════
btnLocalhost.addEventListener('click', openLocalhostModal);
lhClose.addEventListener('click', () => { lhModal.classList.remove('open'); });
lhModal.addEventListener('click', e => { if (e.target === lhModal) lhModal.classList.remove('open'); });

function openLocalhostModal() {
  renderLocalhostList();
  renderDetectedPorts();
  lhModal.classList.add('open');
}

lhAdd.addEventListener('click', addLocalhostEntry);
lhPort.addEventListener('keydown', e => { if (e.key === 'Enter') lhLabel.focus(); });
lhLabel.addEventListener('keydown', e => { if (e.key === 'Enter') addLocalhostEntry(); });

function addLocalhostEntry() {
  const port  = lhPort.value.trim().replace(/[^0-9]/g, '');
  const label = lhLabel.value.trim();
  if (!port || !label) { showToast('Enter both port and label'); return; }
  localhostMap[port] = label;
  saveLocalhostMap();
  lhPort.value  = '';
  lhLabel.value = '';
  renderLocalhostList();
  renderDetectedPorts();
  renderTable();
  showToast(`Saved: localhost:${port} → ${label}`);
}

function renderLocalhostList() {
  const entries = Object.entries(localhostMap);
  if (!entries.length) {
    lhList.innerHTML = `<div style="color:#585b70;font-size:12px;padding:4px 0">No labels saved yet.</div>`;
    return;
  }
  lhList.innerHTML = entries.map(([port, label]) => `
    <div class="lh-item">
      <span class="lh-item-port">localhost:${port}</span>
      <span class="lh-item-label">${escapeHtml(label)}</span>
      <span class="lh-item-count">${countLocalhostPort(port)} hits</span>
      <span class="lh-item-del" data-port="${port}" title="Delete">✕</span>
    </div>`).join('');

  lhList.querySelectorAll('.lh-item-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const port = btn.dataset.port;
      delete localhostMap[port];
      saveLocalhostMap();
      renderLocalhostList();
      renderDetectedPorts();
      renderTable();
      showToast(`Removed label for port ${port}`);
    });
  });
}

function renderDetectedPorts() {
  // Find localhost ports seen in requests but not yet labelled
  const seen = {};
  requests.forEach(r => {
    try {
      const u = new URL(r.url);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        const p = u.port || '80';
        if (!localhostMap[p]) seen[p] = (seen[p] || 0) + 1;
      }
    } catch(e) {}
  });

  const entries = Object.entries(seen);
  if (!entries.length) { lhDetected.style.display = 'none'; return; }
  lhDetected.style.display = 'block';
  lhDetectedList.innerHTML = entries.map(([port, count]) => `
    <div class="lh-detected-item">
      <span class="lh-detected-port">localhost:${port}</span>
      <span class="lh-detected-count">${count} request${count>1?'s':''}</span>
      <button class="btn btn-localhost" style="font-size:10px;padding:2px 8px"
        onclick="prefillPort('${port}')">Label it</button>
    </div>`).join('');
}

window.prefillPort = (port) => {
  lhPort.value = port;
  lhLabel.focus();
};

function countLocalhostPort(port) {
  return requests.filter(r => {
    try {
      const u = new URL(r.url);
      return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
             (u.port || '80') === port;
    } catch(e) { return false; }
  }).length;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
btnExportHar.addEventListener('click', () => {
  chrome.devtools.network.getHAR(harLog => {
    downloadJson(harLog, 'network-capture.har');
    showToast('HAR downloaded');
  });
});

btnExportAi.addEventListener('click', () => {
  const filtered = getFiltered();
  if (!filtered.length) { showToast('No requests to export'); return; }
  const data = filtered.map(r => ({
    id: r.id, method: r.method, url: r.url,
    status: r.status, statusText: r.statusText,
    mimeType: r.mimeType, durationMs: r.time, timestamp: r.timestamp,
    localhostLabel: getLocalhostLabel(r.url),
    requestHeaders:  headersToObj(r.requestHeaders),
    requestBody:     tryParseJson(r.requestBody) || r.requestBody || null,
    responseHeaders: headersToObj(r.responseHeaders),
    responseBody:    tryParseJson(r.responseBody) ||
                     (r.responseBody ? r.responseBody.substring(0, 2000) : null),
    queryString: r.queryString
  }));
  downloadJson(data, 'network-for-ai.json');
  showToast(`Exported ${filtered.length} requests`);
});

btnSummary.addEventListener('click', () => {
  const filtered = getFiltered();
  if (!filtered.length) { showToast('No requests to summarize'); return; }
  downloadText(formatSummary(filtered), 'network-summary.txt');
  showToast('Summary downloaded');
});

btnCopy.addEventListener('click', () => {
  const filtered = getFiltered();
  if (!filtered.length) { showToast('No requests to copy'); return; }
  navigator.clipboard.writeText(buildAIPrompt(filtered))
    .then(() => showToast('AI prompt copied!'));
});

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════════════════
function formatForAI(reqs) {
  return reqs.map(r => {
    const lhLabel = getLocalhostLabel(r.url);
    const lines = [
      `=== Request #${r.id} ===`,
      `${r.method} ${r.url}${lhLabel ? ` [${lhLabel}]` : ''}`,
      `Status: ${r.status} ${r.statusText} | Time: ${r.time}ms | Type: ${mimeShort(r.mimeType)}`,
    ];
    if (r.queryString && r.queryString.length)
      lines.push(`Query: ${r.queryString.map(q=>`${q.name}=${q.value}`).join('&')}`);
    if (r.requestBody) {
      const p = tryParseJson(r.requestBody);
      lines.push(`Request Body: ${JSON.stringify(p || r.requestBody, null, 2)}`);
    }
    if (r.responseBody) {
      const p = tryParseJson(r.responseBody);
      const s = typeof (p||r.responseBody) === 'string'
        ? (p||r.responseBody) : JSON.stringify(p||r.responseBody, null, 2);
      lines.push(`Response Body: ${s.substring(0,1500)}${s.length>1500?'\n...(truncated)':''}`);
    }
    return lines.join('\n');
  }).join('\n\n');
}

function formatSummary(reqs) {
  const byDomain = {};
  reqs.forEach(r => {
    try {
      const d = new URL(r.url).hostname;
      (byDomain[d] = byDomain[d] || []).push(r);
    } catch(e) {}
  });
  return [
    '=== NETWORK CAPTURE SUMMARY ===',
    `Total: ${reqs.length} | Date: ${new Date().toISOString()}`,
    '',
    '--- BY DOMAIN ---',
    ...Object.entries(byDomain).map(([d, rs]) =>
      `${d}: ${rs.length} requests, ${rs.filter(r=>r.status>=400).length} errors`),
    '',
    '--- LOCALHOST LABELS ---',
    ...Object.entries(localhostMap).map(([p,l])=>`  :${p} → ${l}`),
    '',
    '--- ERRORS ---',
    ...reqs.filter(r=>r.status>=400).map(r=>`[${r.status}] ${r.method} ${r.url}`),
    reqs.filter(r=>r.status>=400).length===0 ? 'None!' : '',
    '',
    '--- SLOW (>500ms) ---',
    ...reqs.filter(r=>r.time>500).sort((a,b)=>b.time-a.time).slice(0,10)
      .map(r=>`${r.time}ms — ${r.method} ${shortenUrlPlain(r.url)}`),
    '',
    '--- ALL ---',
    ...reqs.map(r=>`[${r.id}] ${r.method} ${r.url} → ${r.status} (${r.time}ms)`)
  ].filter(l=>l!==null).join('\n');
}

function buildAIPrompt(reqs) {
  return [
    'Analyze this Chrome network capture and identify:',
    '1. Errors or failed requests',
    '2. Performance issues',
    '3. Unusual patterns or anomalies',
    '',
    `Requests: ${reqs.length} | Errors: ${reqs.filter(r=>r.status>=400).length} | Slow(>1s): ${reqs.filter(r=>r.time>1000).length}`,
    '',
    '=== NETWORK DATA ===',
    '',
    formatForAI(reqs.slice(0, 50))
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function getLocalhostLabel(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      return localhostMap[u.port || '80'] || null;
    }
  } catch(e) {}
  return null;
}

function statusClass(s) {
  if (!s) return 'status-pend';
  if (s >= 200 && s < 300) return 'status-ok';
  if (s >= 300 && s < 400) return 'status-redir';
  return 'status-err';
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    const path = u.pathname.substring(0, 48) + (u.pathname.length > 48 ? '…' : '');
    return escapeHtml(u.hostname + path);
  } catch(e) { return escapeHtml(url.substring(0, 60)); }
}

function shortenUrlPlain(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.substring(0, 40);
  } catch(e) { return url.substring(0, 50); }
}

function mimeShort(mime) {
  if (!mime) return '';
  if (mime.includes('json'))       return 'JSON';
  if (mime.includes('html'))       return 'HTML';
  if (mime.includes('javascript')) return 'JS';
  if (mime.includes('css'))        return 'CSS';
  if (mime.includes('image'))      return 'IMG';
  if (mime.includes('font'))       return 'Font';
  if (mime.includes('xml'))        return 'XML';
  return mime.split('/')[1] || mime;
}

function formatSize(bytes) {
  if (bytes <= 0) return '—';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1048576).toFixed(1) + 'MB';
}

function headersToObj(headers) {
  const obj = {};
  (headers || []).forEach(h => { obj[h.name] = h.value; });
  return obj;
}

function tryParseJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch(e) { return null; }
}

function jsonHighlight(json) {
  return escapeHtml(json)
    .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="string">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="number">$1</span>');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function downloadJson(data, filename) {
  triggerDownload(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}), filename);
}
function downloadText(text, filename) {
  triggerDownload(new Blob([text],{type:'text/plain'}), filename);
}
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'),{href:url,download:filename});
  a.click();
  URL.revokeObjectURL(url);
}

function showToast(msg) {
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>{ toast.style.display='none'; }, 2600);
}
