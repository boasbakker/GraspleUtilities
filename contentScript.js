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
    stripDecorative: false
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

  console.log("Hi!")

  // Check if we're on an exercise page (hash-based routing)
  function isExercisePage() {
    const hash = window.location.hash;
    return /\/exercises\/\d+/.test(hash);
  }

  function createCopyButton() {
    const button = document.createElement('button');
    button.id = 'grasple-copy-button';
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

  function createAskChatGPTButton() {
    const button = document.createElement('button');
    button.id = 'grasple-ask-chatgpt-button';
    button.textContent = 'Ask ChatGPT';
    button.className = 'btn btn-outline-primary btn-sm';
    button.style.marginRight = '8px';
    button.setAttribute('data-testid', 'ask-chatgpt-button');
    
    button.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const result = await extractQuestionText();
        if (result.status === 'success' && result.text) {
          // URL encode the question text
          const encodedQuestion = encodeURIComponent(result.text);
          // Open ChatGPT with the question
          window.open(`https://chatgpt.com/?q=${encodedQuestion}`, '_blank');
          
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
            button.textContent = 'Ask ChatGPT';
          }, 2000);
        }
      } catch (err) {
        console.error('Failed to open ChatGPT:', err);
        button.textContent = 'Error ✗';
        setTimeout(() => {
          button.textContent = 'Ask ChatGPT';
        }, 2000);
      }
    });
    
    return button;
  }

  function extractQuestionText() {
    try {
      // Get the setting and extract question text
      return configGet('stripDecorative').then(stripDecorative => {
        const result = extractAndCopy(stripDecorative);
        if (result.status === 'copied' && result.text) {
          return { status: 'success', text: result.text };
        }
        return { status: 'failed', message: 'Could not extract question' };
      });
    } catch (err) {
      return Promise.resolve({ status: 'error', message: String(err) });
    }
  }

  function extractAndCopy(stripDecorative) {
    const NL = '\r\n';
    const NL2 = NL + NL;

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
        // EDIT: Added grapp-question-answer-input-template to ignored elements
        if (tag === 'grapp-question-answer-input-template') return true;
        try {
          if (el.matches && el.matches('div.exercise-header-wrapper.d-flex.justify-content-between')) return true;
          if (el.matches && el.matches('p.fs-7.fst-italic')) return true;
          if (el.matches && el.matches('grapp-question-answer-field')) return true;
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

      // EDIT: Reworked traversal logic for more precise newline control
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

      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(finalText);
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

  function injectButton() {
    if (!isExercisePage()) {
      return false;
    }
    // Check if buttons are already injected using document.getElementById
    if (document.getElementById('grasple-copy-button') && document.getElementById('grasple-ask-chatgpt-button')) {
      return true;
    }
    const headerWrapper = document.querySelector('div.exercise-header-wrapper.d-flex.justify-content-between');
    if (!headerWrapper) return false;
    const leftDiv = headerWrapper.querySelector('div.d-flex.align-items-center');
    if (!leftDiv) return false;
    if (leftDiv.querySelector('[data-testid="copy-latex-button"]')) {
      return true;
    }
    const copyButton = createCopyButton();
    const chatGPTButton = createAskChatGPTButton();
    leftDiv.appendChild(copyButton);
    leftDiv.appendChild(chatGPTButton);
    console.log('Copy question and Ask ChatGPT buttons injected');
    return true;
  }

  function pollingInjectButton() {
    if (injectButton()) {
      return;
    }
    let attempts = 0;
    const maxAttempts = 100;
    const intervalId = setInterval(() => {
      attempts++;
      if (injectButton() || attempts >= maxAttempts) {
        clearInterval(intervalId);
      }
    }, 100);
  }

  function handleHashChange() {
    if (isExercisePage()) {
      // Check if buttons are already injected using document.getElementById
      const copyButtonExists = document.getElementById('grasple-copy-button');
      const chatGPTButtonExists = document.getElementById('grasple-ask-chatgpt-button');
      if (!copyButtonExists || !chatGPTButtonExists) {
        pollingInjectButton();
      }
    }
  }

  function injectHistoryOverride() {
    const script = document.createElement('script');
    script.textContent = `(function() { const o=history.pushState;history.pushState=function(...a){const r=o.apply(this,a);return window.dispatchEvent(new CustomEvent('pushstate',{detail:a})),r}})();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener("pushstate", handleHashChange);
  window.addEventListener("popstate", handleHashChange);
  injectHistoryOverride();
  pollingInjectButton();

})();