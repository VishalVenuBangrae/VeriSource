/**
 * Injected into page (MAIN world) on ChatGPT to intercept the conversation stream.
 * Wraps fetch, tees the response body, parses SSE for content_references / sources_footnote,
 * and dispatches a custom event with extracted citations so the content script can receive them.
 *
 * Target: POST https://chatgpt.com/backend-api/f/conversation (and chat.openai.com)
 */

(function () {
  'use strict';

  const CONVERSATION_PATH = '/backend-api/';
  const CONVERSATION_SUBPATH = 'conversation';
  const CITATIONS_EVENT = 'AICredibilityCitations';
  const DEBUG = true;

  function getRequestUrl(input, options) {
    if (typeof input === 'string') return input;
    if (input && typeof input === 'object' && 'url' in input) return input.url;
    return '';
  }

  function getRequestMethod(input, options) {
    if (input && typeof input === 'object' && input instanceof Request) return input.method || 'GET';
    return (options && options.method) ? String(options.method).toUpperCase() : 'GET';
  }

  /**
   * Recursively find source-like arrays in the stream payload (sources_footnote or content_references items).
   * Returns an array of { url, title, attribution? }.
   */
  function extractSourcesFromPayload(obj, found) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) extractSourcesFromPayload(obj[i], found);
      return;
    }
    if (obj.type === 'sources_footnote' && Array.isArray(obj.sources)) {
      for (const s of obj.sources) {
        if (s && typeof s.url === 'string') found.push({ url: s.url, title: s.title || '', attribution: s.attribution || '' });
      }
      return;
    }
    if (Array.isArray(obj.items)) {
      for (const item of obj.items) {
        if (item && typeof item.url === 'string') found.push({ url: item.url, title: item.title || '', attribution: item.attribution || '' });
      }
    }
    for (const key of Object.keys(obj)) extractSourcesFromPayload(obj[key], found);
  }

  /**
   * Parse SSE-style chunks: split by double newline, then "data: " lines as JSON.
   */
  function parseSSEChunk(buffer, decoder) {
    const text = buffer ? decoder.decode(buffer, { stream: true }) : '';
    return text;
  }

  /**
   * Process a full data line (after "data: "). Parse JSON and extract any sources.
   */
  function processDataLine(line, collected) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '[DONE]') return;
    try {
      const data = JSON.parse(trimmed);
      extractSourcesFromPayload(data, collected);
    } catch (_) {
      /* ignore parse errors */
    }
  }

  /**
   * Consume the second tee'd stream, accumulate SSE, extract sources, dispatch when done.
   */
  function consumeStream(stream, decoder) {
    const reader = stream.getReader();
    let buffer = '';
    const collected = [];

    function processBuffer() {
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          processDataLine(payload, collected);
        }
      }
    }

    function read() {
      return reader.read().then(({ value, done }) => {
        if (value) buffer += decoder.decode(value, { stream: true });
        processBuffer();
        if (done) {
          processBuffer();
          const seen = new Set();
          const unique = collected.filter((s) => {
            const key = s.url;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (DEBUG) console.log('[AI Source Credibility] Stream ended. Extracted', unique.length, 'sources.');
          if (unique.length > 0) {
            try {
              window.postMessage({ type: CITATIONS_EVENT, sources: unique }, '*');
              if (DEBUG) console.log('[AI Source Credibility] Dispatched', unique.length, 'citations to extension.');
            } catch (e) {
              if (DEBUG) console.warn('[AI Source Credibility] Dispatch error', e);
            }
          }
          return;
        }
        return read();
      });
    }
    return read();
  }

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = getRequestUrl(input, init);
    const method = getRequestMethod(input, init);

    const isConversation = url && url.includes(CONVERSATION_PATH) && url.includes(CONVERSATION_SUBPATH) && method === 'POST';
    if (!isConversation) {
      return originalFetch.apply(this, arguments);
    }

    if (DEBUG) console.log('[AI Source Credibility] Intercepting conversation request:', url);

    return originalFetch.apply(this, arguments).then((response) => {
      if (!response.ok || !response.body) return response;
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream') && !contentType.includes('text/plain')) {
        if (DEBUG) console.log('[AI Source Credibility] Skipping (content-type):', contentType);
        return response;
      }

      const tee = response.body.tee();
      const stream1 = tee[0];
      const stream2 = tee[1];
      const decoder = new TextDecoder();
      consumeStream(stream2, decoder);

      return new Response(stream1, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });
  };
})();
