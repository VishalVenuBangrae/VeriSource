# AI Source Credibility Extension

Browser extension that detects which AI chat service is open and, on ChatGPT, extracts cited sources from the conversation stream for future credibility scoring.

## Milestone 1 – Load & Test

### Load unpacked in Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select the folder that contains `manifest.json` (this project folder).
5. The extension should appear in the toolbar; pin it if needed.

### How to test

- **ChatGPT**  
  Open [https://chatgpt.com](https://chatgpt.com) or [https://chat.openai.com](https://chat.openai.com), then click the extension. You should see **Service: ChatGPT**, the tab URL, and status **Detected**. After you ask a question **with web search** and get an answer, open the popup again: the **Citations** section shows the sources extracted from the last answer (title/attribution and link).

- **Claude**  
  Open [https://claude.ai](https://claude.ai), click the extension. Service should show **Claude**, status **Detected**.

- **Gemini**  
  Open [https://gemini.google.com](https://gemini.google.com), click the extension. Service should show **Gemini**, status **Detected**.

- **Perplexity**  
  Open [https://perplexity.ai](https://perplexity.ai), click the extension. Service should show **Perplexity**, status **Detected**.

- **Unsupported site**  
  Open any other site (e.g. `https://example.com`), click the extension. Service should show **Unknown / Not supported**, status **Open a supported chat site**.

- **Fallback mode**  
  On a supported URL, if the content script hasn’t loaded yet or messaging fails, the popup falls back to URL-based detection and shows **Fallback mode**.
