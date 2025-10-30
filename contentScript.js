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

  // Flag to ensure we only inject once
  let buttonInjected = false;
  console.log("Hi!")

  // Check if we're on an exercise page (hash-based routing)
  function isExercisePage() {
    const hash = window.location.hash;
    return /\/exercises\/\d+/.test(hash);
  }

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

  function createAskChatGPTButton() {
    const button = document.createElement('button');
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
      // Block tags which should introduce line breaks (preserve original structure)
      const BLOCK_TAGS = new Set([
        'p','div','li','ul','ol','br','fieldset','legend','section','article',
        'header','footer','address','aside','h1','h2','h3','h4','h5','h6',
        'table','tr','td','th','pre','blockquote'
      ]);

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
        if (tag === 'grapp-question-header') return true;
        try {
          if (el.matches && el.matches('div.exercise-header-wrapper.d-flex.justify-content-between')) return true;
          if (el.matches && el.matches('p.fs-7.fst-italic')) return true;
        } catch (e) {}
        return false;
      }

      function extractKatexTex(el) {
        if (!(el instanceof Element)) return '';
        const ann = el.querySelector('annotation[encoding="application/x-tex"]');
        let txt = ann && ann.textContent ? ann.textContent : (el.textContent || '');
        txt = txt.replace(/\\displaystyle\s*/g, '');
        if (stripDecorative) {
          // convert spacing macros to a single normal space
          txt = txt.replace(/\\ /g, ' ');
          txt = txt.replace(/\\,/g, ' ');
          txt = txt.replace(/\\;/g, ' ');
          txt = txt.replace(/\\:/g, ' ');
          txt = txt.replace(/\\!/g, ' ');
          txt = txt.replace(/\\,/g, ' ');
          txt = txt.replace(/\\(?:quad|qquad|thinspace|enspace|,)\b/g, ' ');
          // remove \left and \right entirely
          txt = txt.replace(/\\left\b/g, '').replace(/\\right\b/g, '');
          // conservative removal of mkern-like tokens into space
          txt = txt.replace(/\\mkern[^{]*\{?[^}]*\}?/g, ' ');
        }
        return txt.replace(/\s+/g, ' ').trim();
      }

      // pieces array collects strings; we use '\n' internally and normalize to CRLF at the end.
      const pieces = [];

      function pushRaw(s) {
        if (s === null || s === undefined) return;
        pieces.push(String(s));
      }

      // Add a normalized text piece: if it contains newlines, preserve them; otherwise collapse whitespace.
      function pushPiecePreserveNewlines(s) {
        if (s === null || s === undefined) return;
        let str = String(s);
        if (/\r?\n/.test(str)) {
          // normalize each line's internal whitespace, keep \n separators
          const lines = str.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());
          const joined = lines.join('\n').trim();
          if (joined) pieces.push(joined);
        } else {
          const compact = str.replace(/\s+/g, ' ').trim();
          if (compact) pieces.push(compact);
        }
      }

      // Push a raw block that already contains \n between its lines (used for MCQ block)
      function pushRawBlockWithLF(s) {
        if (s === null || s === undefined) return;
        const str = String(s);
        const lines = str.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());
        const joined = lines.join('\n').trim();
        if (joined) pieces.push(joined);
      }

      // Traverse DOM but insert newline markers for block boundaries to preserve original structure.
      function traverse(node) {
        if (!node) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          if (!parent || !isElementVisible(parent)) return;
          if (isIgnoredElement(parent)) return;
          const tag = parent.tagName ? parent.tagName.toUpperCase() : '';
          if (tag === 'SCRIPT' || tag === 'STYLE') return;
          pushPiecePreserveNewlines(node.nodeValue);
          return;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node;
          if (!isElementVisible(el)) return;
          if (isIgnoredElement(el)) return;

          const tagName = el.tagName ? el.tagName.toLowerCase() : '';

          // If this element is a block tag, insert a newline marker BEFORE content (unless last piece already ends with newline)
          if (BLOCK_TAGS.has(tagName) && tagName !== 'br') {
            // add single LF marker to represent a block boundary
            pushRaw('\n');
          }

          // Special-case MCQ component
          if (tagName === 'grapp-multiple-choice-single-answer') {
            const optionTexts = [];

            // Prefer radios and their labels
            const radios = el.querySelectorAll('input[type="radio"], input[type="checkbox"], [data-testid="answer-radio-input"]');
            if (radios && radios.length > 0) {
              radios.forEach(radio => {
                const label = radio.closest('label') || radio.closest('[data-testid="mc-answer"]') || radio.parentElement;
                if (!label) return;
                const candidate = label.querySelector('.user-provided-html') || label.querySelector('.question-mc-answer-input') || label;
                // extractTextFromElement with collapseWhitespace=true to get compact option text
                const txt = (() => {
                  // local extraction: collect visible text inside candidate
                  const partsLocal = [];
                  (function walkLocal(n) {
                    if (!n) return;
                    if (n.nodeType === Node.TEXT_NODE) {
                      const p = n.parentElement;
                      if (!p || !isElementVisible(p)) return;
                      if (isIgnoredElement(p)) return;
                      const tag = p.tagName ? p.tagName.toUpperCase() : '';
                      if (tag === 'SCRIPT' || tag === 'STYLE') return;
                      partsLocal.push(n.nodeValue);
                      return;
                    }
                    if (n.nodeType === Node.ELEMENT_NODE) {
                      const ee = n;
                      if (!isElementVisible(ee)) return;
                      if (isIgnoredElement(ee)) return;
                      if (ee.classList && ee.classList.contains('katex')) {
                        partsLocal.push(extractKatexTex(ee));
                        return;
                      }
                      for (let c = ee.firstChild; c; c = c.nextSibling) walkLocal(c);
                    }
                  })(candidate);
                  const joined = partsLocal.join('');
                  return joined.replace(/\s+/g, ' ').trim();
                })();
                if (txt) optionTexts.push(txt);
              });
            } else {
              // fallback to mc-answer blocks
              const blocks = el.querySelectorAll('[data-testid="mc-answer"], .question-mc-answer-input, li');
              if (blocks && blocks.length > 0) {
                blocks.forEach(b => {
                  const text = (function extractBlockText(bEl) {
                    const partsLocal = [];
                    (function w(n) {
                      if (!n) return;
                      if (n.nodeType === Node.TEXT_NODE) {
                        const p = n.parentElement;
                        if (!p || !isElementVisible(p)) return;
                        if (isIgnoredElement(p)) return;
                        partsLocal.push(n.nodeValue);
                        return;
                      }
                      if (n.nodeType === Node.ELEMENT_NODE) {
                        const ee = n;
                        if (!isElementVisible(ee)) return;
                        if (isIgnoredElement(ee)) return;
                        if (ee.classList && ee.classList.contains('katex')) {
                          partsLocal.push(extractKatexTex(ee));
                          return;
                        }
                        for (let c = ee.firstChild; c; c = c.nextSibling) w(c);
                      }
                    })(bEl);
                    return partsLocal.join('').replace(/\s+/g, ' ').trim();
                  })(b);
                  if (text) optionTexts.push(text);
                });
              } else {
                // final fallback: flatten visible text under component and try to split heuristically
                const fallbackParts = [];
                (function collectAll(n) {
                  if (!n) return;
                  if (n.nodeType === Node.TEXT_NODE) {
                    const p = n.parentElement;
                    if (!p || !isElementVisible(p)) return;
                    if (isIgnoredElement(p)) return;
                    fallbackParts.push(n.nodeValue);
                    return;
                  }
                  if (n.nodeType === Node.ELEMENT_NODE) {
                    const ee = n;
                    if (!isElementVisible(ee)) return;
                    if (isIgnoredElement(ee)) return;
                    if (ee.classList && ee.classList.contains('katex')) {
                      fallbackParts.push(extractKatexTex(ee));
                      return;
                    }
                    for (let c = ee.firstChild; c; c = c.nextSibling) collectAll(c);
                  }
                })(el);
                const fb = fallbackParts.join('').replace(/\s+/g, ' ').trim();
                if (fb) {
                  const splits = fb.split(/\s{2,}| - |—|•|\n/).map(s => s.trim()).filter(Boolean);
                  if (splits.length > 1) splits.forEach(s => optionTexts.push(s));
                  else optionTexts.push(fb);
                }
              }
            }

            // dedupe contiguous duplicates
            const deduped = [];
            for (let i = 0; i < optionTexts.length; i++) {
              if (i === 0 || optionTexts[i] !== optionTexts[i - 1]) deduped.push(optionTexts[i]);
            }

            if (deduped.length > 0) {
              const header = 'This is a multiple choice question. Choose one of the answers below:';
              const lines = deduped.map(it => '- ' + it);
              const mcqBlockLF = header + '\n' + lines.join('\n');
              pushRawBlockWithLF(mcqBlockLF);
            }

            // insert a block newline after the MCQ component to separate it from following content
            pushRaw('\n');
            return; // do not descend into MCQ children further
          }

          // If element is .katex (outside MCQ), extract its LaTeX text
          if (el.classList && el.classList.contains('katex')) {
            const t = extractKatexTex(el);
            if (t) pushPiecePreserveNewlines(t);
            return;
          }

          // If BR tag, add newline marker
          if (tagName === 'br') {
            pushRaw('\n');
            return;
          }

          // Otherwise descend children normally
          for (let child = el.firstChild; child; child = child.nextSibling) traverse(child);

          // After processing a block element, add a newline marker to preserve paragraph separations
          if (BLOCK_TAGS.has(tagName) && tagName !== 'br') {
            pushRaw('\n');
          }
        }
      } // end traverse

      // start from wrapper
      const root = document.querySelector('div.position-relative.exercise-wrapper');
      if (!root) return { status: 'no-target', message: 'No .exercise-wrapper found' };

      traverse(root);

      // Now normalize collected pieces.
      // Pieces may contain '\n' (LF) tokens; normalize each piece per-line, then convert to CRLF and join
      const normalizedPieces = pieces.map(p => {
        if (!p) return '';
        const s = String(p);
        if (/\r?\n/.test(s)) {
          return s.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).join('\n').trim();
        }
        return s.replace(/\s+/g, ' ').trim();
      }).filter(Boolean);

      // Combine: if either piece contains newline, separate with two CRLFs; else single space.
      let finalText = '';
      for (let i = 0; i < normalizedPieces.length; i++) {
        const piece = normalizedPieces[i];
        if (!piece) continue;
        if (finalText === '') {
          finalText = piece;
        } else {
          if (/\r?\n/.test(finalText) || /\r?\n/.test(piece)) {
            finalText = finalText + NL2 + piece;
          } else {
            finalText = finalText + ' ' + piece;
          }
        }
      }

      // Convert any remaining LF to CRLF
      finalText = finalText.replace(/\r?\n/g, NL);

      // Collapse 3+ CRLFs into exactly two CRLFs (i.e., at most one empty line between blocks)
      finalText = finalText.replace(/(\r\n){3,}/g, NL2);

      // Trim leading/trailing whitespace/newlines but keep a single trailing newline structure unchanged if present
      finalText = finalText.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '').trim();

      // Final normalization: ensure internal multiple spaces are single (but not across preserved newlines)
      // Already normalized per-line above, so we can trust spacing.

      // Copy to clipboard (navigator.clipboard attempted synchronously during user gesture)
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(finalText).catch(() => {});
          return { status: 'copied', text: finalText };
        }
      } catch (e) {}

      // Fallback execCommand
      try {
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
        return { status: 'error', message: String(err) };
      }

    } catch (err) {
      return { status: 'error', message: String(err) };
    }
  } // end injected function

  function injectButton() {
    // Check if we're on an exercise page
    if (!isExercisePage()) {
      buttonInjected = false;
      return;
    }

    if (buttonInjected) return;

    // Find the target container (the first div in exercise-header-wrapper)
    const headerWrapper = document.querySelector('div.exercise-header-wrapper.d-flex.justify-content-between');
    if (!headerWrapper) return;

    // Find the first child div (left side with the h1)
    const leftDiv = headerWrapper.querySelector('div.d-flex.align-items-center');
    if (!leftDiv) return;

    // Check if buttons already exist (in case of manual navigation)
    if (leftDiv.querySelector('[data-testid="copy-latex-button"]')) {
      buttonInjected = true;
      return;
    }

    // Create and inject the buttons
    const copyButton = createCopyButton();
    const chatGPTButton = createAskChatGPTButton();
    leftDiv.appendChild(copyButton);
    leftDiv.appendChild(chatGPTButton);
    
    buttonInjected = true;
    console.log('Copy question and Ask ChatGPT buttons injected');
  }

  // Handle hash changes (navigation in SPA)
  function handleHashChange() {
    if (isExercisePage()) {
      buttonInjected = false;
      injectButton();
    } else {
      buttonInjected = false;
    }
  }

  // Listen for hash changes
  window.addEventListener('hashchange', handleHashChange);

  // Try to inject immediately
  injectButton();

  // Also observe DOM changes in case the page loads dynamically
  const observer = new MutationObserver((mutations) => {
    if (isExercisePage() && !buttonInjected) {
      injectButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Don't disconnect the observer since we need it for SPA navigation

})();
