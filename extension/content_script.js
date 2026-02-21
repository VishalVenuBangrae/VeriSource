/**
 * Content script: runs only on supported AI chat URLs.
 * Responds to GET_SERVICE and GET_CITATIONS. Listens for AICredibilityCitations
 * from inject.js (ChatGPT conversation stream) and stores last extracted sources.
 */

(function () {
  'use strict';

  /** Last citations extracted from the conversation stream (ChatGPT). */
  let lastCitations = [];

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'AICredibilityCitations' && Array.isArray(event.data.sources)) {
      lastCitations = event.data.sources;
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'GET_SERVICE') {
      const pageUrl = window.location.href;
      const service = detectServiceFromUrl(pageUrl);
      sendResponse({ service: service || 'unknown', pageUrl });
      return true;
    }
    if (message.type === 'GET_CITATIONS') {
      sendResponse({ sources: lastCitations });
      return true;
    }
  });
})();

/**
 * Detect AI service from URL. Shared logic; keep in sync with popup.js or move to shared module later.
 * @param {string} url - Full URL (e.g. location.href or tab.url)
 * @returns {string|null} - Service key or null if unknown
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
