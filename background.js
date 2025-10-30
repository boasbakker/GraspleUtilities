// background.js
// Cross-browser helper: globalThis.browser (Firefox) or globalThis.chrome (Chromium)
const api = globalThis.browser || globalThis.chrome || globalThis.chrome;

function makeContentFunction() {
  // This function will be stringified and executed inside the page context.
  // Keep it self-contained.
  return async function () {
    try {
      const root = document.querySelector('div.position-relative.exercise-wrapper');
      if (!root) {
        return { status: 'no-target' };
      }

      // Checks whether an element is effectively visible
      function isElementVisible(el) {
        if (!(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (!style) return true;
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        // offsetParent null indicates display:none in many cases, but not always (fixed position).
        if (el.offsetParent === null && style.position !== 'fixed' && style.position !== 'sticky') {
          // As a conservative check, consider it not visible
          return false;
        }
        return true;
      }

      const tokens = [];

      function pushTextPiece(s) {
        if (!s) return;
        // normalize internal whitespace in each piece
        const n = s.replace(/\s+/g, ' ').trim();
        if (n) tokens.push(n);
      }

      function traverse(node) {
        if (!node) return;

        // Text node
        if (node.nodeType === Node.TEXT_NODE) {
          const parent = node.parentElement;
          if (!parent || !isElementVisible(parent)) return;
          // Avoid adding text from script/style or from within .katex (we'll handle .katex explicitly)
          const tag = parent.tagName ? parent.tagName.toUpperCase() : '';
          if (tag === 'SCRIPT' || tag === 'STYLE') return;
          pushTextPiece(node.nodeValue);
          return;
        }

        // Element node
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = /** @type {Element} */ (node);
          if (!isElementVisible(el)) return;
          const tagName = el.tagName.toUpperCase();
          if (tagName === 'SCRIPT' || tagName === 'STYLE') return;

          // If this element is .katex, extract from its <annotation encoding="application/x-tex"> child
          if (el.classList && el.classList.contains('katex')) {
            const ann = el.querySelector('annotation[encoding="application/x-tex"]');
            if (ann && ann.textContent) {
              // strip \displaystyle if present
              const tex = ann.textContent.replace(/\\displaystyle\s*/g, '').replace(/\s+/g, ' ').trim();
              pushTextPiece(tex);
            } else {
              // Fallback: extract visible text inside .katex (rare), normalized
              pushTextPiece(el.textContent || '');
            }
            return; // do not descend into children of .katex (we already consumed it)
          }

          // Otherwise traverse children in order
          for (let child = el.firstChild; child; child = child.nextSibling) {
            traverse(child);
          }
          return;
        }

        // Ignore other node types
      }

      traverse(root);

      // Join tokens with single spaces and trim
      let finalText = tokens.join(' ').replace(/\s+/g, ' ').trim();

      // Copy to clipboard. Try navigator.clipboard first; fallback to legacy execCommand.
      async function copyToClipboard(text) {
        if (!text) return false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
          }
        } catch (e) {
          // ignore and try fallback
        }

        // Fallback method (older): create a textarea, select and execCommand('copy')
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          // Off-screen and readonly to avoid focus issues
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          ta.setAttribute('readonly', '');
          document.documentElement.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          document.documentElement.removeChild(ta);
          return ok;
        } catch (e) {
          return false;
        }
      }

      const copied = await copyToClipboard(finalText);

      return {
        status: copied ? 'copied' : 'failed-to-copy',
        text: finalText,
        length: finalText.length
      };
    } catch (err) {
      return { status: 'error', message: err && err.message ? err.message : String(err) };
    }
  };
}

// Helper to programmatically execute the content function in the page
async function runInTab(tabId) {
  const func = makeContentFunction();

  // Prefer the modern scripting.executeScript if available
  if (api.scripting && typeof api.scripting.executeScript === 'function') {
    try {
      const results = await api.scripting.executeScript({
        target: { tabId },
        func
      });
      // results is an array; return the first result if present
      return results && results[0] && results[0].result ? results[0].result : results;
    } catch (e) {
      // Try fallback to tabs.executeScript below
      console.warn('scripting.executeScript failed, falling back to tabs.executeScript:', e);
    }
  }

  // Fallback (older RB): stringify function and use tabs.executeScript
  const code = `(${func.toString()})()`;
  return new Promise((resolve, reject) => {
    try {
      // on Firefox the API may be browser.tabs.executeScript which returns a promise
      if (api.tabs && typeof api.tabs.executeScript === 'function') {
        const maybePromise = api.tabs.executeScript(tabId, { code });
        // handle both promise (browser) and callback (chrome)
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then((r) => {
            // r is an array of results for each frame - usually one
            resolve(r && r[0] ? r[0] : r);
          }).catch(reject);
        } else {
          // chrome callback style: executeScript(tabId, details, callback)
          // But since we didn't pass callback, we need to use callback form:
          api.tabs.executeScript(tabId, { code }, (result) => {
            resolve(result && result[0] ? result[0] : result);
          });
        }
      } else {
        reject(new Error('No scripting or tabs.executeScript available'));
      }
    } catch (ex) {
      reject(ex);
    }
  });
}

// Listen for the extension action being clicked by the user
if (api.action && typeof api.action.onClicked !== 'undefined') {
  // Chrome/Edge etc
  api.action.onClicked.addListener(async (tab) => {
    if (!tab || !tab.id) return;
    try {
      const res = await runInTab(tab.id);
      // We intentionally do not show a UI; however you could later show notifications or badges.
      // For debugging you can uncomment:
      // console.log('extract result', res);
    } catch (e) {
      console.error('Injection failed:', e);
    }
  });
} else if (api.browserAction && typeof api.browserAction.onClicked !== 'undefined') {
  // older API name
  api.browserAction.onClicked.addListener(async (tab) => {
    if (!tab || !tab.id) return;
    try {
      await runInTab(tab.id);
    } catch (e) {
      console.error('Injection failed:', e);
    }
  });
} else {
  console.warn('No action.onClicked or browserAction.onClicked available — action clicking may not be supported in this browser runtime.');
}
