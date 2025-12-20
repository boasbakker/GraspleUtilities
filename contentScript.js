// contentScript.js - Injected into app.grasple.com
// Adds a "Copy question" button to the exercise header

(function() {
  'use strict';

  // Cross-browser compatibility
  const hasBrowser = (typeof browser !== 'undefined');
  const hasChrome = (typeof chrome !== 'undefined');
  const api = hasBrowser ? browser : (hasChrome ? chrome : null);

  // Default configuration values
  const DEFAULT_CONFIG = {
    stripDecorative: false,
    aiPrompt: ''
  };

  /**
   * Get configuration value(s) from storage
   * @param {string|object} keys - Single key (string) or object with default values
   * @returns {Promise<any>} Configuration value(s)
   */
  async function configGet(keys) {
    try {
      if (!api || !api.storage) {
        console.warn('Storage API not available');
        return typeof keys === 'string' ? DEFAULT_CONFIG[keys] : keys;
      }

      // Try sync first, fallback to local
      const storage = api.storage.sync || api.storage.local;
      if (!storage) {
        console.warn('No storage backend available');
        return typeof keys === 'string' ? DEFAULT_CONFIG[keys] : keys;
      }

      // Normalize keys to object format
      const keysObj = typeof keys === 'string' 
        ? { [keys]: DEFAULT_CONFIG[keys] } 
        : { ...DEFAULT_CONFIG, ...keys };

      if (hasBrowser) {
        // Firefox
        const result = await storage.get(keysObj);
        return typeof keys === 'string' ? result[keys] : result;
      } else if (hasChrome) {
        // Chrome
        return new Promise((resolve) => {
          storage.get(keysObj, (result) => {
            if (api.runtime && api.runtime.lastError) {
              console.error('Error loading config:', api.runtime.lastError);
              resolve(typeof keys === 'string' ? DEFAULT_CONFIG[keys] : keysObj);
              return;
            }
            resolve(typeof keys === 'string' ? result[keys] : result);
          });
        });
      }
      return typeof keys === 'string' ? DEFAULT_CONFIG[keys] : keys;
    } catch (err) {
      console.error('Failed to load config:', err);
      return typeof keys === 'string' ? DEFAULT_CONFIG[keys] : keys;
    }
  }

  /**
   * Set configuration value(s) in storage
   * @param {object} config - Configuration object to save
   * @returns {Promise<void>}
   */
  async function configSet(config) {
    try {
      if (!api || !api.storage) {
        console.warn('Storage API not available');
        return;
      }

      // Try sync first, fallback to local
      const storage = api.storage.sync || api.storage.local;
      if (!storage) {
        console.warn('No storage backend available');
        return;
      }

      if (hasBrowser) {
        // Firefox
        await storage.set(config);
        console.log('Config saved:', config);
      } else if (hasChrome) {
        // Chrome
        return new Promise((resolve) => {
          storage.set(config, () => {
            if (api.runtime && api.runtime.lastError) {
              console.error('Error saving config:', api.runtime.lastError);
              resolve();
              return;
            }
            console.log('Config saved:', config);
            resolve();
          });
        });
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  // A unique ID for the button container to prevent re-injection.
  const BUTTON_CONTAINER_ID = 'grasple-tools-button-container'; // <-- NEW

  /**
   * Check if we should run in this context.
   * The extension should only run on app.grasple.com pages, either when:
   * - Visiting app.grasple.com directly, OR
   * - Inside an iframe embedded on another domain (e.g., Brightspace)
   * @returns {boolean} True if we should initialize the extension in this context
   */
  function shouldRunInThisContext() {
    const hostname = window.location.hostname;
    // Match app.grasple.com or any subdomain of grasple.com
    return hostname === 'app.grasple.com' || hostname.endsWith('.grasple.com');
  }

  if (!shouldRunInThisContext()) {
    console.log("Grasple Tools: Not running in this context (hostname:", window.location.hostname, ")");
    return;
  }

  const isInIframe = window.self !== window.top;
  console.log("Grasple Tools: Initializing in context:", isInIframe ? "iframe (embedded)" : "main page");


  function createCopyButton() {
    const button = document.createElement('button');
    button.textContent = 'Copy question';
    button.className = 'btn btn-outline-primary btn-sm';
    button.style.marginRight = '8px';
    button.setAttribute('data-testid', 'copy-latex-button');
    
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        console.log("trying to copy!")
        const stripDecorative = await configGet('stripDecorative');
        console.log("stripDecorative:", stripDecorative);
        const result = await extractAndCopy(stripDecorative);
        if (result.status === 'copied') {
          // Visual feedback
          const originalText = button.textContent;
          button.textContent = '✓ Copied';
          button.style.backgroundColor = '#28a745';
          button.style.color = 'white';
          button.style.borderColor = '#28a745';
          setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
            button.style.color = '';
            button.style.borderColor = '';
          }, 2000);
        } else {
          button.textContent = 'Failed ✗';
          setTimeout(() => {
            button.textContent = 'Copy question';
          }, 2000);
        }
      } catch (err) {
        console.error('Copy failed:', err);
        button.textContent = 'Error ✗';
        setTimeout(() => {
          button.textContent = 'Copy question';
        }, 2000);
      }
    });
    
    return button;
  }

  /**
   * Generic factory for creating "Ask AI" buttons.
   * @param {string} name - The name of the AI service (e.g., 'ChatGPT').
   * @param {string} testId - The data-testid attribute for the button.
   * @param {string} urlTemplate - The URL to open, with '{prompt}' as a placeholder for the question.
   * @returns {HTMLButtonElement}
   */
  function createAIHelperButton(name, testId, urlTemplate) {
    const button = document.createElement('button');
    const buttonText = `Ask ${name}`;
    button.textContent = buttonText;
    button.className = 'btn btn-outline-primary btn-sm';
    button.style.marginRight = '8px';
    button.setAttribute('data-testid', testId);
    
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const result = await extractQuestionText();
        if (result.status === 'success' && result.text) {
          // Get the custom AI prompt from settings
          const aiPrompt = await configGet('aiPrompt');
          
          // Combine custom prompt with question text
          let fullPrompt = result.text;
          if (aiPrompt && aiPrompt.trim()) {
            fullPrompt = aiPrompt.trim() + '\n\n' + result.text;
          }
          
          // URL encode the full prompt
          const encodedQuestion = encodeURIComponent(fullPrompt);
          // Construct the final URL from the template
          const finalUrl = urlTemplate.replace('{prompt}', encodedQuestion);
          
          // Open the AI tool with the question
          window.open(finalUrl, '_blank');
          
          // Visual feedback
          const originalText = button.textContent;
          button.textContent = '✓ Opened';
          button.style.backgroundColor = '#28a745';
          button.style.color = 'white';
          button.style.borderColor = '#28a745';
          setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
            button.style.color = '';
            button.style.borderColor = '';
          }, 2000);
        } else {
          button.textContent = 'Failed ✗';
          setTimeout(() => {
            button.textContent = buttonText;
          }, 2000);
        }
      } catch (err) {
        console.error(`Failed to open ${name}:`, err);
        button.textContent = 'Error ✗';
        setTimeout(() => {
          button.textContent = buttonText;
        }, 2000);
      }
    });
    
    return button;
  }

  function createAskChatGPTButton() {
    const urlTemplate = 'https://chatgpt.com/?q={prompt}';
    return createAIHelperButton('ChatGPT', 'ask-chatgpt-button', urlTemplate);
  }

  function createAskGeminiButton() {
    const urlTemplate = 'https://aistudio.google.com/prompts/new_chat?model=gemini-3-flash-preview&prompt={prompt}';
    return createAIHelperButton('Gemini', 'ask-gemini-button', urlTemplate);
  }

  async function extractQuestionText() {
    try {
      // Get the setting and extract question text
      const stripDecorative = await configGet('stripDecorative');
      const result = await extractAndCopy(stripDecorative, false); // Pass false to not copy to clipboard
      if (result.status === 'extracted' && result.text) {
        return { status: 'success', text: result.text };
      }
      return { status: 'failed', message: 'Could not extract question' };
    } catch (err) {
      return { status: 'error', message: String(err) };
    }
  }

  async function extractAndCopy(stripDecorative, doCopy = true) {
    const NL = '\r\n';
    
    try {
      function isElementVisible(el) {
        if (!(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (!style) return true;
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
        if (el.offsetParent === null && style.position !== 'fixed' && style.position !== 'sticky') return false;
        return true;
      }

      function isIgnoredElement(el) {
        if (!(el instanceof Element)) return false;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'grapp-question-answer-input-template') return true;
        try {
          if (el.matches && el.matches('div.exercise-header-wrapper.d-flex.justify-content-between')) return true;
          if (el.matches && el.matches('p.fs-7.fst-italic')) return true;
          if (el.matches && el.matches('grapp-question-answer-field')) return true;
          if (el.matches && el.matches('button[data-testid="next-button"]')) return true;
        } catch (e) {}
        return false;
      }

      function extractKatexTex(el) {
        if (!(el instanceof Element)) return '';
        const ann = el.querySelector('annotation[encoding="application/x-tex"]');
        let txt = ann && ann.textContent ? ann.textContent : (el.textContent || '');
        txt = txt.replace(/\\displaystyle\s*/g, '');
        if (stripDecorative) {
          txt = txt.replace(/\\ /g, ' ').replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\:/g, ' ').replace(/\\!/g, ' ').replace(/\\,/g, ' ');
          txt = txt.replace(/\\(?:quad|qquad|thinspace|enspace|,)\b/g, ' ');
          txt = txt.replace(/\\left\b/g, '').replace(/\\right\b/g, '');
          txt = txt.replace(/\\mkern[^{]*\{?[^}]*\}?/g, ' ');
        }
        const cleanedTxt = txt.replace(/\s+/g, ' ').trim();
        return cleanedTxt ? `$${cleanedTxt}$` : '';
      }

      const pieces = [];

      function pushRaw(s) {
        if (s === null || s === undefined) return;
        pieces.push(String(s));
      }

      function pushPiece(s) {
        if (s === null || s === undefined) return;
        const compact = String(s).replace(/\s+/g, ' ').trim();
        if (compact) pieces.push(compact);
      }
      
      function pushRawBlockWithLF(s) {
        if (s === null || s === undefined) return;
        const lines = String(s).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());
        const joined = lines.join('\n').trim();
        if (joined) pieces.push(joined);
      }

      const MINOR_BREAK_TAGS = new Set([
          'p', 'li', 'div', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote'
      ]);

      function traverse(node) {
        if (!node) return;

        if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          if (!parent || !isElementVisible(parent) || isIgnoredElement(parent)) return;
          const tag = parent.tagName ? parent.tagName.toUpperCase() : '';
          if (tag === 'SCRIPT' || tag === 'STYLE') return;
          pushPiece(node.nodeValue);
          return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node;
          if (!isElementVisible(el) || isIgnoredElement(el)) return;

          const tagName = el.tagName ? el.tagName.toLowerCase() : '';

          // Handle major breaks for new sub-questions
          if (tagName === 'grapp-question-header') {
            pushRaw('\n\n'); // Use double newline as a separator
            return; // Don't process header's content
          }

          // Handle minor breaks (paragraphs, lists) with a single newline
          if (MINOR_BREAK_TAGS.has(tagName)) {
            pushRaw('\n');
          }

          if (tagName === 'br') {
              pushRaw('\n');
              return;
          }

          if (tagName === 'grapp-multiple-choice-single-answer') {
            const optionTexts = [];
            const radios = el.querySelectorAll('input[type="radio"], input[type="checkbox"], [data-testid="answer-radio-input"]');
            if (radios.length > 0) {
              radios.forEach(radio => {
                const label = radio.closest('label') || radio.closest('[data-testid="mc-answer"]') || radio.parentElement;
                if (!label) return;
                const candidate = label.querySelector('.user-provided-html') || label.querySelector('.question-mc-answer-input') || label;
                const txt = (() => {
                  const partsLocal = [];
                  (function walkLocal(n) {
                    if (!n) return;
                    if (n.nodeType === Node.TEXT_NODE) {
                      const p = n.parentElement; if (p && isElementVisible(p) && !isIgnoredElement(p)) partsLocal.push(n.nodeValue);
                    } else if (n.nodeType === Node.ELEMENT_NODE) {
                      const ee = n; if (!isElementVisible(ee) || isIgnoredElement(ee)) return;
                      if (ee.classList.contains('katex')) { partsLocal.push(extractKatexTex(ee)); return; }
                      for (let c = ee.firstChild; c; c = c.nextSibling) walkLocal(c);
                    }
                  })(candidate);
                  return partsLocal.join('').replace(/\s+/g, ' ').trim();
                })();
                if (txt) optionTexts.push(txt);
              });
            }
            const deduped = [...new Set(optionTexts.filter(Boolean))];
            if (deduped.length > 0) {
              pushRaw('\n');
              const header = 'This is a multiple choice question. Choose one of the answers below:';
              const lines = deduped.map(it => '- ' + it);
              pushRawBlockWithLF(header + '\n' + lines.join('\n'));
            }
            pushRaw('\n');
            return;
          }

          if (el.classList.contains('katex')) {
            pushPiece(extractKatexTex(el));
            return;
          }

          for (let child = el.firstChild; child; child = child.nextSibling) traverse(child);
        }
      }

      const root = document.querySelector('div.position-relative.exercise-wrapper');
      if (!root) return { status: 'no-target', message: 'No .exercise-wrapper found' };

      traverse(root);

      // Assemble the final text from pieces
      let finalText = '';
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        if (!piece) continue;

        if (finalText === '') {
            finalText = piece;
            continue;
        }

        const lastChar = finalText.slice(-1);
        const nextChar = piece[0];

        if (lastChar === '\n' || nextChar === '\n') {
          finalText += piece;
        } else {
          finalText += ' ' + piece;
        }
      }

      // Final cleanup
      finalText = finalText.replace(/\n /g, '\n'); // Clean spaces after newlines
      finalText = finalText.replace(/(\n){3,}/g, '\n\n'); // Collapse excess blank lines
      finalText = finalText.replace(/\r?\n/g, NL); // Normalize to CRLF
      finalText = finalText.trim();

      if (!doCopy) {
        return { status: 'extracted', text: finalText };
      }

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(finalText);
        return { status: 'copied', text: finalText };
      }
      
      const ta = document.createElement('textarea');
      ta.value = finalText;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.documentElement.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.documentElement.removeChild(ta);
      if (ok) return { status: 'copied', text: finalText };
      return { status: 'failed', message: 'execCommand copy failed' };

    } catch (err) {
      console.error("Extraction error:", err);
      return { status: 'error', message: String(err) };
    }
  }
  
  // =========================================================================
  // NEW INJECTION TRIGGER LOGIC using MutationObserver
  // =========================================================================

  /**
   * Checks if buttons should be injected and performs the injection.
   */
  function runInjectionCheck() {
    // Check if our buttons are already injected. If so, do nothing. // <-- CHANGED
    if (document.getElementById(BUTTON_CONTAINER_ID)) {
      return;
    }

    // Find the target element to inject the buttons into.
    const headerWrapper = document.querySelector('div.exercise-header-wrapper.d-flex.justify-content-between');
    if (!headerWrapper) {
      return; // Target not on page yet, wait for next DOM change.
    }
    
    const leftDiv = headerWrapper.querySelector('div.d-flex.align-items-center');
    if (!leftDiv) {
      return; // Target's child not ready yet.
    }
    
    // Create a container for our buttons with the unique ID. // <-- NEW
    const buttonContainer = document.createElement('span');
    buttonContainer.id = BUTTON_CONTAINER_ID;

    // Add buttons to the container. // <-- NEW
    buttonContainer.appendChild(createCopyButton());
    buttonContainer.appendChild(createAskChatGPTButton());
    buttonContainer.appendChild(createAskGeminiButton());
    
    // Add the container to the page. // <-- NEW
    leftDiv.appendChild(buttonContainer);
    
    console.log('Grasple Tools: Buttons injected.');
  }

  // Set up the MutationObserver to watch for page changes.
  // This is more reliable than listening for URL changes in a Single Page App.
  const observer = new MutationObserver((mutations) => {
    // For any change, run our injection check. The check itself is smart
    // enough to not re-inject if the button is already there.
    runInjectionCheck();
  });

  // Start observing the entire body for changes in the element tree.
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Run the check once on script load.
  runInjectionCheck();

})();
