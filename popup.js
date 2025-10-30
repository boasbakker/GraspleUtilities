// popup.js
// Preserves original block newlines (up to one empty line), preserves MCQ option separation,
// collapses runs of 3+ newlines into exactly two CRLFs, supports "Remove decorative LaTeX".
// Works with both Chrome (chrome.*) and Firefox (browser.*)

const hasBrowser = (typeof browser !== 'undefined');
const hasChrome = (typeof chrome !== 'undefined');
const api = hasBrowser ? browser : (hasChrome ? chrome : null);

const statusEl = document.getElementById('status');
const copyBtn = document.getElementById('copyBtn');
const stripDecorativeCheckbox = document.getElementById('stripDecorative');

function setStatus(msg, timeout = 3000) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  if (timeout > 0) setTimeout(() => { statusEl.textContent = ''; }, timeout);
}

async function getActiveTab() {
  if (!api) throw new Error('Extension API not available');

  if (hasBrowser && api.tabs && typeof api.tabs.query === 'function') {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) throw new Error('No active tab found');
    return tabs[0];
  }

  if (hasChrome && api.tabs && typeof api.tabs.query === 'function') {
    return new Promise((resolve, reject) => {
      try {
        api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (api.runtime && api.runtime.lastError) return reject(api.runtime.lastError);
          if (!tabs || tabs.length === 0) return reject(new Error('No active tab found'));
          resolve(tabs[0]);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  throw new Error('tabs.query not supported in this runtime');
}

async function runFunctionInTab(tabId, func, args = []) {
  // Prefer scripting.executeScript
  try {
    if (hasBrowser && api.scripting && typeof api.scripting.executeScript === 'function') {
      const results = await api.scripting.executeScript({ target: { tabId }, func, args });
      return results && results[0] ? results[0].result : results;
    }
  } catch (e) {}
  try {
    if (hasChrome && api.scripting && typeof api.scripting.executeScript === 'function') {
      const results = await api.scripting.executeScript({ target: { tabId }, func, args });
      return results && results[0] ? results[0].result : results;
    }
  } catch (e) {}

  // Fallback: stringify and execute with args
  const code = `(${func.toString()}).apply(null, ${JSON.stringify(args || [])})`;

  if (hasBrowser && api.tabs && typeof api.tabs.executeScript === 'function') {
    const results = await api.tabs.executeScript(tabId, { code });
    return (Array.isArray(results) ? results[0] : results);
  }

  if (hasChrome && api.tabs && typeof api.tabs.executeScript === 'function') {
    return new Promise((resolve, reject) => {
      try {
        api.tabs.executeScript(tabId, { code }, (results) => {
          if (api.runtime && api.runtime.lastError) return reject(api.runtime.lastError);
          resolve(results && results[0] ? results[0] : results);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  throw new Error('No suitable executeScript API available');
}


// injected function: runs in page context. arg: stripDecorative (boolean)
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


// popup click handler
copyBtn.addEventListener('click', async () => {
  setStatus('Working...');
  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error('Unable to get active tab');

    const stripDecorative = !!(stripDecorativeCheckbox && stripDecorativeCheckbox.checked);

    const result = await runFunctionInTab(tab.id, extractAndCopy, [stripDecorative]);
    const r = Array.isArray(result) ? result[0] : result;

    if (r && r.status === 'copied') {
      setStatus('Copied to clipboard ✓', 3500);
    } else if (r && r.status === 'no-target') {
      setStatus('No exercise wrapper found', 4500);
    } else {
      const msg = (r && (r.message || r.status)) ? (r.message || r.status) : 'Unknown error';
      setStatus('Not copied: ' + msg, 5000);
      console.debug('extract result:', r);
    }
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + (err && err.message ? err.message : String(err)), 6000);
  }
});
