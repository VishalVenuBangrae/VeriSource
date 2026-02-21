/**
 * Popup: real-time AI service detection for the active tab.
 * 1) Get active tab URL and run detectServiceFromUrl for immediate fallback.
 * 2) Try content script message for authoritative response.
 * 3) Render service name, truncated URL, and status.
 * No tabId storage; detection is real-time on each popup open.
 */

(function () {
  'use strict';

  const serviceEl = document.getElementById('service-name');
  const urlEl = document.getElementById('tab-url');
  const statusEl = document.getElementById('status');

  /** Current citations for Copy JSON (array of { url, title, attribution }). */
  let currentCitations = [];

  function setStatus(kind, text) {
    statusEl.textContent = text;
    statusEl.className = 'status ' + kind;
  }

  function setService(key) {
    serviceEl.textContent = prettyServiceName(key);
  }

  function setUrl(url, fullUrl) {
    urlEl.textContent = truncateUrl(url || '—');
    urlEl.title = fullUrl || url || '';
  }

  /**
   * Truncate long URLs for display (e.g. max ~50 chars with ellipsis).
   */
  function truncateUrl(url) {
    const max = 52;
    if (!url || url.length <= max) return url || '—';
    return url.slice(0, max - 3) + '…';
  }

  /**
   * Display name for service key. Reusable for Milestone 2+.
   */
  function prettyServiceName(serviceKey) {
    const names = {
      chatgpt: 'ChatGPT',
      claude: 'Claude',
      gemini: 'Gemini',
      perplexity: 'Perplexity',
      unknown: 'Unknown / Not supported',
    };
    return names[serviceKey] ?? names.unknown;
  }

  /**
   * Detect AI service from URL. Must stay in sync with content_script.js.
   * @param {string} url
   * @returns {string|null} - Service key or null
   */
  function detectServiceFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (host === 'chatgpt.com' || host === 'chat.openai.com') return 'chatgpt';
      if (host === 'claude.ai') return 'claude';
      if (host === 'gemini.google.com') return 'gemini';
      if (host === 'perplexity.ai') return 'perplexity';
    } catch (_) {}
    return null;
  }

  function renderFallback(tab) {
    const url = tab?.url || '';
    const service = detectServiceFromUrl(url);
    setService(service || 'unknown');
    setUrl(url, url);
    if (service) {
      setStatus('fallback', 'Fallback mode — refresh this tab');
      document.getElementById('refresh-hint').classList.remove('hidden');
      if (service === 'chatgpt' && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'GET_CITATIONS' }, (citeRes) => {
          renderCitations(service, (citeRes && citeRes.sources) ? citeRes.sources : []);
        });
      } else {
        renderCitations(service, []);
      }
    } else {
      setStatus('unsupported', 'Open a supported chat site');
      renderCitations('unknown', []);
      const refreshHint = document.getElementById('refresh-hint');
      if (refreshHint) refreshHint.classList.add('hidden');
    }
  }

  function renderFromContentScript(service, pageUrl, sources) {
    setService(service);
    setUrl(pageUrl, pageUrl);
    const isSupported = service && service !== 'unknown';
    setStatus(isSupported ? 'detected' : 'unsupported', isSupported ? 'Detected' : 'Open a supported chat site');
    renderCitations(service, sources);
  }

  function renderCitations(service, sources) {
    const section = document.getElementById('citations-section');
    const countEl = document.getElementById('citations-count');
    const listEl = document.getElementById('citations-list');
    const copyBtn = document.getElementById('copy-json-btn');
    const copyFeedback = document.getElementById('copy-json-feedback');
    const isChatGPT = service === 'chatgpt';
    if (!isChatGPT || !section || !countEl || !listEl) {
      if (section) section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');
    const list = Array.isArray(sources) ? sources : [];
    currentCitations = list.map((s) => ({ url: s.url || '', title: s.title || '', attribution: s.attribution || '' }));

    if (copyBtn) {
      copyBtn.style.display = list.length > 0 ? '' : 'none';
      copyBtn.onclick = copyCitationsJson;
    }
    if (copyFeedback) copyFeedback.classList.add('hidden');
    countEl.textContent = list.length === 0 ? 'No citations yet (ask with web search)' : list.length + ' source' + (list.length !== 1 ? 's' : '');
    listEl.innerHTML = '';
    list.slice(0, 20).forEach((s) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = s.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      let label = s.attribution || s.title || '';
      if (!label && s.url) {
        try {
          label = new URL(s.url).hostname || s.url;
        } catch (_) {
          label = s.url;
        }
      }
      a.textContent = (label || 'Source').slice(0, 60) + (label && label.length > 60 ? '…' : '');
      a.title = s.title || s.url || '';
      li.appendChild(a);
      listEl.appendChild(li);
    });
    if (list.length > 20) {
      const li = document.createElement('li');
      li.textContent = '… and ' + (list.length - 20) + ' more';
      li.style.fontStyle = 'italic';
      listEl.appendChild(li);
    }
  }

  /**
   * Build JSON: array of { url, title, attribution } for use in backend/next milestone.
   */
  function copyCitationsJson() {
    const json = JSON.stringify(currentCitations, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      const feedback = document.getElementById('copy-json-feedback');
      if (feedback) {
        feedback.classList.remove('hidden');
        setTimeout(() => feedback.classList.add('hidden'), 1500);
      }
    }).catch(() => {});
  }

  function init() {
    setStatus('pending', 'Checking…');
    setService('unknown');
    setUrl('', '');
    const refreshHint = document.getElementById('refresh-hint');
    if (refreshHint) refreshHint.classList.add('hidden');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        setStatus('unsupported', 'Open a supported chat site');
        return;
      }

      const fallbackService = detectServiceFromUrl(tab.url);
      setService(fallbackService || 'unknown');
      setUrl(tab.url, tab.url);

      chrome.tabs.sendMessage(tab.id, { type: 'GET_SERVICE' }, (response) => {
        if (chrome.runtime.lastError || !response) {
          renderFallback(tab);
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: 'GET_CITATIONS' }, (citeRes) => {
          const sources = (citeRes && citeRes.sources) ? citeRes.sources : [];
          const refreshHint = document.getElementById('refresh-hint');
        if (refreshHint) refreshHint.classList.add('hidden');
        renderFromContentScript(response.service, response.pageUrl, sources);
        });
      });
    });
  }

  init();
})();
