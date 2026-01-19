// contentScript.js - Injected into app.grasple.com
// Adds a "Copy question" button to the exercise header

(function () {
  'use strict';

  // Cross-browser compatibility
  const hasBrowser = (typeof browser !== 'undefined');
  const hasChrome = (typeof chrome !== 'undefined');
  const api = hasBrowser ? browser : (hasChrome ? chrome : null);

  // Inject network interceptor to capture answers
  function injectInterceptor() {
    console.log('Grasple Tools: Injecting network interceptor & KaTeX bundles...');

    // Inject KaTeX CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = api.runtime.getURL('node_modules/katex/dist/katex.min.css');
    (document.head || document.documentElement).appendChild(link);

    // Inject KaTeX JS
    const scriptKatex = document.createElement('script');
    scriptKatex.src = api.runtime.getURL('node_modules/katex/dist/katex.min.js');
    scriptKatex.onload = function () {
      console.log('Grasple Tools: KaTeX Main Loaded');
      // Inject Auto-render
      const scriptAuto = document.createElement('script');
      scriptAuto.src = api.runtime.getURL('node_modules/katex/dist/contrib/auto-render.min.js');
      scriptAuto.onload = function () { console.log('Grasple Tools: KaTeX Auto-Render Loaded'); };
      (document.head || document.documentElement).appendChild(scriptAuto);
    };
    (document.head || document.documentElement).appendChild(scriptKatex);

    const script = document.createElement('script');
    script.textContent = `
      (function() {
        console.log('Grasple Tools: Interceptor Loaded');
        const XHR = XMLHttpRequest.prototype;
        const open = XHR.open;
        const send = XHR.send;
        
        XHR.open = function(method, url) {
          this._url = url;
          return open.apply(this, arguments);
        };
        
        const setRequestHeader = XHR.setRequestHeader;
        XHR.setRequestHeader = function(header, value) {
            if (header.toLowerCase() === 'authorization') {
                window.postMessage({ type: 'GRASPLE_AUTH_TOKEN', token: value }, '*');
            }
            return setRequestHeader.apply(this, arguments);
        };
        
        XHR.send = function(postData) {
          this.addEventListener('load', function() {
            
            // Match challenge API URL (Broader regex)
            const match = this._url && this._url.match(/\\/challenges\\/(\\d+)/);
            if (match) {
              console.log('Grasple Tools: XHR matched Challenge', this._url);
              try {
                const data = JSON.parse(this.responseText);
                
                // Extract c_hash from URL
                let cHash = null;
                try {
                    const urlObj = new URL(this._url, window.location.origin);
                    cHash = urlObj.searchParams.get('c_hash');
                } catch(e) {}

                const payload = { url: this._url, data: data, c_hash_from_url: cHash };
                window.postMessage({ type: 'GRASPLE_CHALLENGE_INFO', payload: payload }, '*');
              } catch(e) { console.error('Grasple Tools: bad JSON', e); }
            }
            // Capture session data
            if (this._url && this._url.match(/\\/challenge-session/)) {
               try {
                const data = JSON.parse(this.responseText);
                const sessionData = data.data || data;
                window.postMessage({ type: 'GRASPLE_SESSION_DATA', payload: sessionData }, '*');
               } catch(e) {}
            }
          });
          return send.apply(this, arguments);
        };
        // Listen for Math Render requests from Content Script
        window.addEventListener('message', function(e) {
            if (e.data && e.data.type === 'GRASPLE_RENDER_MATH') {
                const targetId = e.data.id;
                const el = document.getElementById(targetId);
                if (el) {
                    const options = {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "$", right: "$", display: false},
                            {left: "\\(", right: "\\)", display: false},
                            {left: "\\[", right: "\\]", display: true},
                            // Add double-escaped delimiters for robust matching
                            {left: "\\\\(", right: "\\\\)", display: false},
                            {left: "\\\\[", right: "\\\\]", display: true}
                        ],
                        throwOnError: false
                    };
                    
                    // Fix KaTeX background
                    if (!document.getElementById('grasple-katex-fix')) {
                        const style = document.createElement('style');
                        style.id = 'grasple-katex-fix';
                        style.textContent = '.grasple-tools-injected-feedback .question-feedback-wrapper { background-color: #f8f9fa !important; } .grasple-tools-injected-feedback .katex, .grasple-tools-injected-feedback .katex *, .grasple-tools-injected-feedback .user-provided-html span { background: none !important; background-color: transparent !important; }';
                        document.head.appendChild(style);
                    }
                    
                    if (window.renderMathInElement) {
                        try { window.renderMathInElement(el, options); } catch(e) { console.error('Grasple Tools: renderMathInElement failed', e); }
                    } else if (window.katex && window.katex.renderMathInElement) {
                        try { window.katex.renderMathInElement(el, options); } catch(e) { console.error('Grasple Tools: katex.render failed', e); }
                    } else if (window.MathJax) {
                        if (window.MathJax.typeset) {
                           try { window.MathJax.typeset([el]); } catch(e) { console.error('Grasple Tools: MathJax.typeset failed', e); }
                        } else if (window.MathJax.Hub) {
                           try { window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, el]); } catch(e) { console.error('Grasple Tools: MathJax.Hub failed', e); }
                        }
                    } else {
                        console.warn('Grasple Tools: No math renderer found. Searching global scope...');
                        const possibleKeys = Object.keys(window).filter(k => k.toLowerCase().includes('math') || k.toLowerCase().includes('katex'));
                        console.log('Grasple Tools: Possible math objects:', possibleKeys);
                    }
                }
            }
        });

      })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
  injectInterceptor();

  // Store data globally
  window.graspleChallenges = {}; // Map by ID
  window.graspleChallengesList = []; // Ordered list
  window.graspleSessionData = null;
  window.graspleAuthToken = null;

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;

    if (event.data.type === 'GRASPLE_CHALLENGE_INFO') {
      const { payload } = event.data;
      const challengeObj = payload.data.challenge || payload.data;
      if (challengeObj && challengeObj.id) {
        // Add to map
        window.graspleChallenges[challengeObj.id] = payload;

        // Also store sub_challenges (MCQs) by their ID
        if (challengeObj.sub_challenges && challengeObj.sub_challenges.length > 0) {
          challengeObj.sub_challenges.forEach(subChallenge => {
            if (subChallenge.id) {
              // Wrap in same structure as main challenges
              window.graspleChallenges[subChallenge.id] = {
                data: { challenge: subChallenge },
                url: payload.url,
                c_hash_from_url: payload.c_hash_from_url,
                parent_id: challengeObj.id
              };
              console.log('Grasple Tools: Captured sub_challenge (MCQ)', subChallenge.id);
            }
          });
        }

        // Add to ordered list if not already present (dedupe by ID)
        const exists = window.graspleChallengesList.find(c => {
          const cObj = c.data.challenge || c.data;
          return cObj.id === challengeObj.id;
        });
        if (!exists) {
          window.graspleChallengesList.push(payload);
          console.log('Grasple Tools: Captured VALID challenge (Ordered)', challengeObj.id);
        }
      }
    }
    if (event.data.type === 'GRASPLE_SESSION_DATA') {
      window.graspleSessionData = event.data.payload;
    }
    if (event.data.type === 'GRASPLE_AUTH_TOKEN') {
      window.graspleAuthToken = event.data.token;
    }
  });

  // Listen for settings changes from popup to show/hide buttons immediately
  if (typeof api !== 'undefined' && api.runtime && api.runtime.onMessage) {
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GRASPLE_SETTINGS_CHANGED') {
        console.log('Grasple Tools: Settings changed', message);

        // Show/hide explanation buttons
        const explanationBtns = document.querySelectorAll('.grasple-safe-check-btn');
        explanationBtns.forEach(btn => {
          btn.style.display = message.showExplanationButtons ? '' : 'none';
        });

        // Show/hide answer buttons
        const answerBtns = document.querySelectorAll('.grasple-show-answer-btn');
        answerBtns.forEach(btn => {
          btn.style.display = message.showAnswerButtons ? '' : 'none';
        });
      }
    });
  }

  // ... (runInjectionCheck...)

  function runAnswerCheckInjection() {
    // 1. Find existing "Check" button
    let originalCheckBtn = document.querySelector('button[data-testid="check-answer-button"]:not([data-grasple-tools-processed])');

    // Fallback search
    if (!originalCheckBtn) {
      const allButtons = Array.from(document.querySelectorAll('button:not([data-grasple-tools-processed]), div[role="button"]:not([data-grasple-tools-processed])'));
      originalCheckBtn = allButtons.find(b => {
        const txt = b.textContent.trim().toLowerCase();
        return (txt.includes('check') || txt.includes('controleer')) && b.offsetParent !== null;
      });
    }

    if (originalCheckBtn) {
      console.log('Grasple Tools: Found Check button. Injecting Safe Check...');

      const span = originalCheckBtn.querySelector('span');
      if (span) {
        span.textContent = 'Submit Answer';
      } else {
        originalCheckBtn.textContent = 'Submit Answer';
      }
      originalCheckBtn.setAttribute('data-grasple-tools-processed', 'true');

      const safeCheckBtn = document.createElement('button');
      safeCheckBtn.innerHTML = '<span>Check (Safe)</span>';
      safeCheckBtn.className = originalCheckBtn.className;

      // Add MARKER CLASS for index finding
      safeCheckBtn.classList.add('grasple-safe-check-btn');

      safeCheckBtn.classList.remove('disabled');
      safeCheckBtn.removeAttribute('disabled');
      safeCheckBtn.removeAttribute('aria-disabled');

      if (safeCheckBtn.classList.contains('btn-outline-primary')) {
        safeCheckBtn.classList.remove('btn-outline-primary');
        safeCheckBtn.classList.add('btn-outline-info');
        if (!document.querySelector('.btn-outline-info')) safeCheckBtn.classList.add('btn-info');
      } else if (safeCheckBtn.classList.contains('btn-primary')) {
        safeCheckBtn.classList.remove('btn-primary');
        safeCheckBtn.classList.add('btn-info');
      } else {
        // ensure styling if no classes
        safeCheckBtn.style.color = '#fff';
        safeCheckBtn.style.backgroundColor = '#17a2b8';
        safeCheckBtn.style.borderColor = '#17a2b8';
      }
      safeCheckBtn.style.marginRight = '10px';

      safeCheckBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await performSafeCheck(safeCheckBtn);
      });

      const parent = originalCheckBtn.parentNode;
      parent.insertBefore(safeCheckBtn, originalCheckBtn);
    }
  }

  async function performSafeCheck(btn) {
    if (!window.graspleSessionData) {
      alert('Missing session data. Please refresh the page.');
      return;
    }

    const challengesList = window.graspleChallengesList || [];

    if (challengesList.length === 0) {
      alert('No challenge data captured. Try refreshing.');
      return;
    }

    // Identify index
    const allSafeBtns = Array.from(document.querySelectorAll('.grasple-safe-check-btn'));
    const btnIndex = allSafeBtns.indexOf(btn);

    console.log('Grasple Tools: Button index:', btnIndex, 'Total challenges matched:', challengesList.length);

    let challengeInfo = null;

    // Strategy 1: Index Match (User Requested)
    if (btnIndex >= 0 && btnIndex < challengesList.length) {
      challengeInfo = challengesList[btnIndex];
      console.log('Grasple Tools: Using Index Match strategy.');
    } else {
      // Fallback or out of sync
      console.warn('Grasple Tools: Button index out of bounds or mismatch. Falling back to map/last.');
    }

    // Strategy 2: ID Match / container (Existing fallback logic)
    // Find container first for scoping!
    const container = btn.closest('grapp-challenge') ||
      btn.closest('.challenge-container') ||
      btn.closest('.card') ||
      btn.closest('.exercise-wrapper') ||
      btn.closest('.col-12') || // Often wrapped in cols
      document.body;

    if (!challengeInfo) {
      // Try to match text
      const containerText = container.textContent || '';
      for (const info of challengesList) {
        const c = info.data.challenge || info.data;
        if (c.question) {
          const plainQ = c.question.replace(/<[^>]*>/g, '').trim().substring(0, 40);
          if (plainQ && containerText.includes(plainQ)) {
            challengeInfo = info;
            break;
          }
        }
      }
    }

    if (!challengeInfo) {
      challengeInfo = challengesList[challengesList.length - 1]; // Absolute fallback
    }

    const { url, data } = challengeInfo;
    const challengeObj = data.challenge || data;
    const { id: sessionID } = window.graspleSessionData;

    const originalText = btn.textContent;
    btn.textContent = 'Checking...';
    btn.disabled = true;

    try {
      let answer = null;

      // Scoping input finding to the closest common parent or 'row' might be safer
      // but assuming `container` is good enough if it's not body.
      // If container IS body, we are in trouble for multiple choice.

      const scope = (container === document.body) ? document : container;

      // 1. Multiple Choice
      // Ensure we only find radios IN THIS SCOPE
      if (scope.querySelector('input[type="radio"]')) {
        const selected = scope.querySelector('input[type="radio"]:checked');
        // If we are scoped to body, we might pick a radio from another Q!
        // Check name attribute?

        if (!selected) {
          // If no radio is checked in this scope.
          // Check if there ARE radios in this scope.
          if (scope.querySelectorAll('input[type="radio"]').length > 0) {
            btn.textContent = originalText;
            btn.disabled = false;
            alert('Please select an option.');
            return;
          }
        } else {
          answer = selected.value;
        }
      }

      if (!answer) {
        // 2. Equation / Text
        const mathFields = Array.from(scope.querySelectorAll('math-field'));
        const userInputs = mathFields.map(mf => (mf.getValue ? mf.getValue('latex') : mf.value) || '').map(s => s.trim());

        if (userInputs.length === 0) {
          const textInputs = Array.from(scope.querySelectorAll('input[type="text"], textarea'));
          const exerciseInputs = textInputs.filter(el => {
            return !el.classList.contains('search-input') &&
              !el.closest('.search-bar') &&
              el.type !== 'submit' && el.type !== 'button';
          });
          exerciseInputs.forEach(el => userInputs.push(el.value.trim()));
        }
        answer = userInputs.join(',');
      }

      if (!answer) {
        // Double check if we missed something or if it's really empty
        btn.textContent = originalText;
        btn.disabled = false;
        alert('Answer is empty or question type not recognized.');
        return;
      }

      const baseUrl = url.split('?')[0];
      const checkUrl = baseUrl + '/check-answer';
      const cHash = challengeObj.c_hash || '6';

      const payload = {
        answer: answer,
        c_hash: cHash,
        challenge_session_id: sessionID
      };

      console.log('Grasple Tools: Sending Payload', payload);

      const resp = await fetch(checkUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthToken(),
          'Accept': 'application/json, text/plain, */*',
          'App-Language': 'en'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        throw new Error('Check error ' + resp.status);
      }

      const respData = await resp.json();

      if (respData.right_answer) {
        btn.textContent = '✓ Correct';
        btn.className = 'btn btn-success';
      } else {
        btn.textContent = '✗ Incorrect';
        btn.className = 'btn btn-danger';

        if (respData.correct_answer && respData.correct_answer.answer) {
          showFeedback(btn, respData.feedback, respData.correct_answer.answer);
        } else if (respData.feedback) {
          showFeedback(btn, respData.feedback, null);
        }
      }

    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
      btn.textContent = 'Error';
    }

    setTimeout(() => {
      if (btn.textContent !== 'Checking...' && btn.textContent !== 'Error') {
        // Keep state?
      }
      btn.disabled = false;
    }, 2000);
  }

  // ... (keeping config code as is, jumping to performSafeCheck area)

  async function performSafeCheck(btn) {
    if (!window.graspleSessionData) {
      alert('Missing session data. Please refresh the page.');
      return;
    }

    const challengesMap = window.graspleChallenges || {};
    const challengeIds = Object.keys(challengesMap);

    if (challengeIds.length === 0) {
      alert('No challenge data captured. Try refreshing.');
      return;
    }

    // 1. Scope to the question container to avoid cross-question pollution
    // Try to find the container that holds this button.
    const container = btn.closest('grapp-challenge') ||
      btn.closest('.challenge-container') ||
      btn.closest('.card') ||
      btn.closest('.exercise-wrapper') ||
      document.body;

    // 2. Identify the challenge for this container
    let challengeInfo = null;

    if (challengeIds.length === 1) {
      // Simple case: only one challenge loaded
      challengeInfo = challengesMap[challengeIds[0]];
    } else {
      // Complex case: multiple challenges. Match visual container to data.

      // Strategy A: Check for data-id or id on container
      const domId = container.getAttribute('data-id') || container.getAttribute('id');
      if (domId) {
        const match = challengeIds.find(id => domId.includes(id));
        if (match) challengeInfo = challengesMap[match];
      }

      // Strategy B: Match text content (Robust fallback)
      if (!challengeInfo) {
        const containerText = container.textContent || '';
        // Iterate all captured challenges to see if their Question HTML text appears in this container
        for (const id of challengeIds) {
          const c = challengesMap[id].data.challenge || challengesMap[id].data;
          if (c.question) {
            // Strip HTML tags roughly to get unique text snippet
            const plainQ = c.question.replace(/<[^>]*>/g, '').trim();
            // Take a recognizable chunk (first 50 chars or so)
            const snippet = plainQ.substring(0, Math.min(plainQ.length, 50));

            if (snippet && containerText.includes(snippet)) {
              challengeInfo = challengesMap[id];
              break;
            }
          }
        }
      }
    }

    if (!challengeInfo) {
      // Fallback: Use the last captured one, but warn user
      console.warn('Grasple Tools: Could not link button to challenge data. Using last captured.');
      challengeInfo = challengesMap[challengeIds[challengeIds.length - 1]];
    }

    const { url, data } = challengeInfo;
    const challengeObj = data.challenge || data;
    const { id: sessionID } = window.graspleSessionData; // Session ID is usually page-wide

    const originalText = btn.textContent;
    btn.textContent = 'Checking...';
    btn.disabled = true;

    try {
      let answer = null;

      // CRITICAL: Scope selectors to `container` only!

      // 1. Multiple Choice
      if (container.querySelector('input[type="radio"]')) {
        const selected = container.querySelector('input[type="radio"]:checked');
        if (!selected) {
          alert('Please select an option.');
          btn.textContent = originalText;
          btn.disabled = false;
          return;
        }
        answer = selected.value;
      } else {
        // 2. Equation / Text
        const mathFields = Array.from(container.querySelectorAll('math-field'));
        const userInputs = mathFields.map(mf => (mf.getValue ? mf.getValue('latex') : mf.value) || '').map(s => s.trim());

        if (userInputs.length === 0) {
          const textInputs = Array.from(container.querySelectorAll('input[type="text"], textarea'));
          // Filter out search bars or irrelevant inputs
          const exerciseInputs = textInputs.filter(el => {
            return !el.classList.contains('search-input') &&
              !el.closest('.search-bar') &&
              el.type !== 'submit' && el.type !== 'button';
          });
          exerciseInputs.forEach(el => userInputs.push(el.value.trim()));
        }
        answer = userInputs.join(',');
      }

      if (!answer) {
        alert('Answer is empty.');
        btn.textContent = originalText;
        btn.disabled = false;
        return;
      }

      // Construct check URL
      const baseUrl = url.split('?')[0];
      const checkUrl = baseUrl + '/check-answer';

      const cHash = challengeObj.c_hash || '6';

      const payload = {
        answer: answer,
        c_hash: cHash,
        challenge_session_id: sessionID
      };

      const resp = await fetch(checkUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthToken(),
          'Accept': 'application/json, text/plain, */*',
          'App-Language': 'en'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        throw new Error('Check error ' + resp.status);
      }

      const respData = await resp.json();

      if (respData.right_answer) {
        btn.textContent = '✓ Correct';
        btn.className = 'btn btn-success';
      } else {
        btn.textContent = '✗ Incorrect';
        btn.className = 'btn btn-danger';

        if (respData.correct_answer && respData.correct_answer.answer) {
          showFeedback(btn, respData.feedback, respData.correct_answer.answer);
        } else if (respData.feedback) {
          showFeedback(btn, respData.feedback, null);
        }
      }

    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
      btn.textContent = 'Error';
    }

    setTimeout(() => {
      if (btn.textContent !== 'Checking...' && btn.textContent !== 'Error') {
        // Keep state?
      }
      btn.disabled = false;
    }, 2000);
  }

  // Replaces the old simple capturedChallengeData listener


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
            // ...
          });
        });
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  // =========================================================================
  // SHARED HELPERS
  // =========================================================================

  let __mathExtractorCounter = 0;

  async function getMathFieldValuesInElement(container) {
    if (!(container instanceof Element)) return [];
    const MSG_SOURCE = '__ext_mathlive_extractor_v1';
    const id = 'math-extractor-' + (++__mathExtractorCounter);
    container.setAttribute('data-math-extractor-id', id);

    return new Promise((resolve) => {
      let resolved = false;
      function onMessage(evt) {
        if (evt.source !== window || !evt.data || evt.data.source !== MSG_SOURCE || evt.data.id !== id) return;
        resolved = true;
        window.removeEventListener('message', onMessage);
        try {
          const values = Array.isArray(evt.data.values) ? evt.data.values : [];
          resolve(values);
        } catch (e) {
          resolve([]);
        } finally {
          try { container.removeAttribute('data-math-extractor-id'); } catch (e) { }
        }
      }
      window.addEventListener('message', onMessage);

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.textContent = `(${function (MSG_SOURCE, id) {
        try {
          const container = document.querySelector('[data-math-extractor-id="' + id + '"]');
          const values = [];
          if (container) {
            const mfs = Array.from(container.querySelectorAll('math-field'));
            mfs.forEach(mf => {
              try {
                if (typeof mf.getValue === 'function') {
                  try { values.push(mf.getValue('latex')); } catch (e) { values.push(mf.getValue()); }
                  return;
                }
                if ('value' in mf && mf.value) { values.push(mf.value); return; }
                const attr = mf.getAttribute && mf.getAttribute('value');
                if (attr) { values.push(attr); return; }
                if (mf.textContent) { values.push(mf.textContent); return; }
              } catch (innerE) { }
            });
          }
          window.postMessage({ source: MSG_SOURCE, id: id, values: values }, '*');
        } catch (err) {
          window.postMessage({ source: MSG_SOURCE, id: id, error: String(err) }, '*');
        }
      }})(` + JSON.stringify(MSG_SOURCE) + ',' + JSON.stringify(id) + `);`;
      (document.head || document.documentElement).appendChild(script);
      script.parentNode && script.parentNode.removeChild(script);

      setTimeout(() => {
        if (resolved) return;
        window.removeEventListener('message', onMessage);
        try { container.removeAttribute('data-math-extractor-id'); } catch (e) { }
        resolve([]);
      }, 500);
    });
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
        // if (tag === 'grapp-question-answer-input-template') return true;
        try {
          if (el.matches && el.matches('div.exercise-header-wrapper.d-flex.justify-content-between')) return true;
          if (el.matches && el.matches('p.fs-7.fst-italic')) return true;
          // if (el.matches && el.matches('grapp-question-answer-field')) return true;
          if (el.matches && el.matches('button[data-testid="next-button"]')) return true;
        } catch (e) { }
        return false;
      }

      // Moving shared helpers to upper scope...
      // (Using global getMathFieldValuesInElement instead of defining it here)

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

      let __mathExtractorCounter = 0; // Keeping this local to traverse for now if needed, but actually we moved the global one out. 
      // Wait, if I move it out, I should remove it here.

      async function traverse(node) {
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

          // Special handling: capture user-entered LaTeX inside math-field elements (answer inputs)
          if (tagName === 'grapp-question-answer-input-template' || tagName === 'grapp-question-answer-field') {
            try {
              const values = await getMathFieldValuesInElement(el);
              const cleaned = (Array.isArray(values) ? values : [])
                .map(v => (v == null ? '' : String(v)))
                .map(v => v.replace(/\s+/g, ' ').trim())
                .filter(Boolean);

              if (cleaned.length > 0) {
                const combined = cleaned.map(v => '$' + v + '$').join(' , ');
                pushRaw('\n');
                pushRaw('My answer: ' + combined);
              } else {
                // no values found inside this input, do nothing
              }
            } catch (e) {
              console.log('Error extracting math-field values:', e);
            }
            return; // don't traverse into these input/template nodes further
          }

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

          for (let child = el.firstChild; child; child = child.nextSibling) {
            await traverse(child);
          }
        }
      }

      const root = document.querySelector('div.position-relative.exercise-wrapper');
      if (!root) return { status: 'no-target', message: 'No .exercise-wrapper found' };

      await traverse(root);

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

    // Add the container to the page. // <-- NEW
    leftDiv.appendChild(buttonContainer);

    console.log('Grasple Tools: Buttons injected.');
  }

  // =========================================================================
  // ANSWER CHECKING FEATURE
  // =========================================================================

  async function runAnswerCheckInjection() {
    // Check if explanation buttons are enabled
    const config = await configGet({ showExplanationButtons: true });
    if (!config.showExplanationButtons) {
      console.log('Grasple Tools: Explanation buttons disabled in settings');
      return;
    }

    // 1. Find existing "Check" buttons
    let checkBtns = Array.from(document.querySelectorAll('button[data-testid="check-answer-button"]'));

    // Fallback: check for text if testid not found
    if (checkBtns.length === 0) {
      const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], a.btn'));
      checkBtns = allButtons.filter(b => {
        const txt = b.textContent.trim().toLowerCase();
        return (txt.includes('check') || txt.includes('controleer'));
      });
    }

    checkBtns.forEach(originalCheckBtn => {
      if (originalCheckBtn.hasAttribute('data-grasple-tools-processed')) return;

      console.log('Grasple Tools: Found Check button. Injecting View Explanation...');

      originalCheckBtn.setAttribute('data-grasple-tools-processed', 'true');

      const explainBtn = createExplanationButton(originalCheckBtn.className);

      // Insert before original
      const parent = originalCheckBtn.parentNode;
      parent.insertBefore(explainBtn, originalCheckBtn);
    });

    // 2. Handle multiple choice questions (no Check button)
    // Look for grapp-multiple-choice elements that don't have our button yet
    const mcContainers = document.querySelectorAll('grapp-multiple-choice-single-answer, grapp-multiple-choice-multiple-answers, grapp-multiple-choice, grapp-challenge[data-challenge-type="multiple_choice"]');

    mcContainers.forEach(mcContainer => {
      // Check if already processed
      if (mcContainer.hasAttribute('data-grasple-mc-processed')) return;

      // Check if there's already a check button inside (then it's handled above)
      if (mcContainer.querySelector('button[data-testid="check-answer-button"]')) return;
      if (mcContainer.querySelector('.grasple-safe-check-btn')) return;

      console.log('Grasple Tools: Found multiple choice container. Injecting View Explanation...');

      mcContainer.setAttribute('data-grasple-mc-processed', 'true');

      const explainBtn = createExplanationButton('btn btn-warning');

      // Find a good place to insert - after the instruction text or at the end
      const instructionEl = mcContainer.querySelector('grapp-multiple-choice-answer-instruction');
      const fieldset = mcContainer.querySelector('fieldset');

      // Create a wrapper div
      const wrapper = document.createElement('div');
      wrapper.style.marginTop = '10px';
      wrapper.style.padding = '10px 0';
      wrapper.appendChild(explainBtn);

      // Also add a "Show Answer" button for MCQs
      const answerBtn = createShowAnswerButton('btn btn-success');
      wrapper.appendChild(answerBtn);

      // Insert after instruction element, or after fieldset, or at end of container
      if (instructionEl) {
        instructionEl.parentNode.insertBefore(wrapper, instructionEl.nextSibling);
      } else if (fieldset) {
        fieldset.parentNode.insertBefore(wrapper, fieldset.nextSibling);
      } else {
        mcContainer.appendChild(wrapper);
      }
    });
  }

  // Helper function to create the Show Answer button for MCQs
  function createShowAnswerButton(baseClassName) {
    const answerBtn = document.createElement('button');
    answerBtn.innerHTML = '<span>Show Answer</span>';
    answerBtn.className = baseClassName;
    answerBtn.classList.add('grasple-show-answer-btn');

    answerBtn.style.color = '#fff';
    answerBtn.style.backgroundColor = '#28a745';
    answerBtn.style.borderColor = '#28a745';
    answerBtn.style.marginRight = '10px';

    answerBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await showCorrectAnswer(answerBtn);
    });

    return answerBtn;
  }

  // Show correct answer for MCQs
  async function showCorrectAnswer(btn) {
    const challengesMap = window.graspleChallenges || {};

    // Find the MCQ container
    const container = btn.closest('grapp-multiple-choice-single-answer') ||
      btn.closest('grapp-multiple-choice-multiple-answers') ||
      btn.closest('grapp-multiple-choice') ||
      btn.closest('grapp-challenge');

    if (!container) {
      alert('Could not find MCQ container.');
      return;
    }

    // Try to find the challenge ID from the fieldset or other elements
    const fieldset = container.querySelector('fieldset');
    let challengeId = null;

    if (fieldset && fieldset.id) {
      // ID format: question-answer-input-61583
      const match = fieldset.id.match(/question-answer-input-(\d+)/);
      if (match) {
        challengeId = parseInt(match[1], 10);
      }
    }

    console.log('Grasple Tools: Looking for MCQ challenge ID:', challengeId);

    if (!challengeId || !challengesMap[challengeId]) {
      alert('Could not find challenge data for this MCQ. Try refreshing.');
      return;
    }

    const challengeInfo = challengesMap[challengeId];
    const challengeObj = challengeInfo.data.challenge || challengeInfo.data;

    console.log('Grasple Tools: MCQ challenge data:', challengeObj);

    // Find the correct answer(s)
    if (!challengeObj.answers || challengeObj.answers.length === 0) {
      alert('No answer data found for this question.');
      return;
    }

    const correctAnswers = challengeObj.answers.filter(a => a.right_answer === 1);

    if (correctAnswers.length === 0) {
      alert('Could not determine the correct answer.');
      return;
    }

    // Highlight the correct answer(s) in the UI
    correctAnswers.forEach(correct => {
      const radioInput = container.querySelector(`input[value="${correct.id}"]`);
      if (radioInput) {
        const label = radioInput.closest('label') || radioInput.parentElement;
        if (label) {
          label.style.border = '3px solid #28a745';
          label.style.backgroundColor = '#d4edda';
        }
      }
    });

    console.log('Grasple Tools: Highlighted correct answer(s):', correctAnswers.map(a => a.id));
  }

  // Helper function to create the View Explanation button
  function createExplanationButton(baseClassName) {
    const explainBtn = document.createElement('button');
    explainBtn.innerHTML = '<span>View Explanation</span>';
    explainBtn.className = baseClassName;

    // Add MARKER CLASS for index finding logic
    explainBtn.classList.add('grasple-safe-check-btn');

    explainBtn.classList.remove('disabled');
    explainBtn.removeAttribute('disabled');
    explainBtn.removeAttribute('aria-disabled');

    // Style it differently (Orange/Warning)
    if (explainBtn.classList.contains('btn-outline-primary')) {
      explainBtn.classList.remove('btn-outline-primary');
      explainBtn.classList.add('btn-outline-warning');
      if (!document.querySelector('.btn-outline-warning')) {
        explainBtn.classList.add('btn-warning');
      }
    } else if (explainBtn.classList.contains('btn-primary')) {
      explainBtn.classList.remove('btn-primary');
      explainBtn.classList.add('btn-warning');
    } else {
      explainBtn.classList.add('btn-warning');
    }

    explainBtn.style.color = '#000';
    explainBtn.style.backgroundColor = '#ffc107';
    explainBtn.style.borderColor = '#ffc107';
    explainBtn.style.marginRight = '10px';

    explainBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await showExplanation(explainBtn);
    });

    return explainBtn;
  }

  // REPLACED performSafeCheck with showExplanation logic
  async function showExplanation(btn) {
    const challengesMap = window.graspleChallenges || {};
    const challengesList = window.graspleChallengesList || [];

    if (challengesList.length === 0) {
      alert('No challenge data captured. Try refreshing.');
      return;
    }

    // Identify index
    const allSafeBtns = Array.from(document.querySelectorAll('.grasple-safe-check-btn'));
    const btnIndex = allSafeBtns.indexOf(btn);

    // Identify Scope/Container
    const container = btn.closest('grapp-challenge') ||
      btn.closest('.challenge-container') ||
      btn.closest('.card') ||
      btn.closest('.exercise-wrapper') ||
      btn.closest('.col-12') ||
      document.body;

    let challengeInfo = null;

    // Strategy 0: Fieldset ID Match (most reliable for sub-questions)
    const fieldset = container.querySelector('fieldset[id^="question-answer-input-"]');
    if (fieldset && fieldset.id) {
      const match = fieldset.id.match(/question-answer-input-(\d+)/);
      if (match) {
        const fieldsetId = parseInt(match[1], 10);
        if (challengesMap[fieldsetId]) {
          console.log('Grasple Tools: Matched via Fieldset ID:', fieldsetId);
          challengeInfo = challengesMap[fieldsetId];
        }
      }
    }

    // Strategy 1: Visual ID Match
    function findIdInElement(el) {
      if (!el) return null;
      const text = el.innerText || el.textContent || '';
      const match = text.match(/(?:Question|Vraag)\s*#\s*(\d+)/i) ||
        text.match(/#\s*(\d+)/);
      return match ? match[1] : null;
    }

    if (!challengeInfo) {
      const visualId = findIdInElement(container);
      if (visualId && challengesMap[visualId]) {
        console.log('Grasple Tools: Matched via Visual ID:', visualId);
        challengeInfo = challengesMap[visualId];
      }
    }

    // Strategy 2: Determine Index
    if (!challengeInfo) {
      if (btnIndex >= 0 && btnIndex < challengesList.length) {
        challengeInfo = challengesList[btnIndex];
        console.log('Grasple Tools: Matched via Index:', btnIndex);
      }
    }

    // Strategy 3: Content Match
    if (!challengeInfo) {
      const containerText = container.textContent || '';
      for (const info of challengesList) {
        const c = info.data.challenge || info.data;
        if (c.question) {
          const plainQ = c.question.replace(/<[^>]*>/g, '').trim().substring(0, 40);
          if (plainQ && containerText.includes(plainQ)) {
            challengeInfo = info;
            break;
          }
        }
      }
    }

    if (!challengeInfo) {
      challengeInfo = challengesList[challengesList.length - 1];
    }

    const { data } = challengeInfo;
    const challengeObj = data.challenge || data;

    // debug
    console.log('Grasple Tools: Showing explanation for', challengeObj);

    let explanation = 'No explanation found in data.';
    if (challengeObj.explanation) {
      explanation = challengeObj.explanation;
    } else if (challengeObj.correct_answer && challengeObj.correct_answer.explanation) {
      explanation = challengeObj.correct_answer.explanation;
    } else if (challengeObj.feedback) {
      explanation = challengeObj.feedback;
    } else if (challengeObj.feedback_wrong) {
      explanation = challengeObj.feedback_wrong;
    } else if (challengeObj.answers && challengeObj.answers.length > 0) {
      // MCQ: look for the correct answer's response field
      const correctAnswer = challengeObj.answers.find(a => a.right_answer === 1);
      if (correctAnswer && correctAnswer.response) {
        explanation = correctAnswer.response;
      }
    }

    // --- Rich Rendering Logic ---

    // Check if we already injected feedback for this specific container
    let feedbackEl = container.querySelector('.grasple-tools-injected-feedback');
    if (feedbackEl) {
      feedbackEl.remove(); // Toggle off if clicked again? Or just refresh it. Let's refresh.
    }

    // Create the structure mimicking <grapp-question-feedback>
    // We'll wrap it in a custom class to identifying it
    const feedbackWrapper = document.createElement('div');
    feedbackWrapper.className = 'grasple-tools-injected-feedback mt-3';
    // Unique ID for the renderer listener
    feedbackWrapper.id = 'grasple-feedback-' + Math.random().toString(36).substr(2, 9);

    // HTML Structure based on user snippet
    feedbackWrapper.innerHTML = `
      <grapp-question-feedback>
        <div data-testid="container">
          <section data-testid="question-feedback" class="question-feedback question-feedback--visible">
            <div class="question-feedback-wrapper position-relative" style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 0.25rem; padding: 1rem;">
              <h2 class="h5">Explanation</h2>
              
              <div id="feedback-contents">
                 <div class="user-provided-html">
                    ${explanation}
                 </div>
              </div>

            </div>
          </section>
        </div>
      </grapp-question-feedback>
    `;

    // Insert into container. Best place is usually at the bottom of the challenge body or after the question text.
    // Try to find the footer or button container
    const footer = container.querySelector('.exercise-footer') ||
      container.querySelector('.card-footer') ||
      container.querySelector('.exercise-question');

    if (footer) {
      footer.appendChild(feedbackWrapper);
    } else {
      container.appendChild(feedbackWrapper);
    }

    // Trigger Math Rendering via Injected Script (Main Context)
    // We send a message that our injected script listens for.
    setTimeout(() => {
      window.postMessage({ type: 'GRASPLE_RENDER_MATH', id: feedbackWrapper.id }, '*');
    }, 50);

    console.log('Grasple Tools: Injected explanation HTML and requested render.');
  }

  /* 
   * COMMENTED OUT SAFE CHECK FUNCTIONALITY
   *
  async function performSafeCheck(btn) {
     ... 
  }
  */

  function getAuthToken() {
    return window.graspleAuthToken || '';
  }

  function showFeedback(btn, html, correctAnswer) {
    let fbDiv = document.getElementById('grasple-tools-feedback');
    if (!fbDiv) {
      fbDiv = document.createElement('div');
      fbDiv.id = 'grasple-tools-feedback';
      fbDiv.style.marginTop = '10px';
      fbDiv.style.border = '1px solid #ccc';
      fbDiv.style.padding = '10px';
      fbDiv.style.borderRadius = '5px';
      fbDiv.style.backgroundColor = '#f9f9f9';
      const footer = document.querySelector('.exercise-footer');
      if (footer) footer.parentNode.insertBefore(fbDiv, footer.nextSibling);
    }

    let content = '<strong>Feedback:</strong><br>' + html;
    if (correctAnswer) {
      content += '<hr><strong>Correct Answer:</strong> ' + correctAnswer;
    }
    fbDiv.innerHTML = content;

    if (window.renderMathInElement) {
      try { window.renderMathInElement(fbDiv); } catch (e) { }
    } else if (window.MathJax && window.MathJax.typeset) {
      try { window.MathJax.typeset([fbDiv]); } catch (e) { }
    }
  }

  // Set up the MutationObserver to watch for page changes.
  const observer = new MutationObserver((mutations) => {
    // For any change, run our injection check.
    runInjectionCheck();
    runAnswerCheckInjection();

    // Check if native feedback appeared - hide our injected explanations
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) { // Element node
          // Check if native feedback was added
          const nativeFeedback = node.matches && node.matches('grapp-question-feedback, [data-testid="question-feedback"]')
            ? node
            : node.querySelector && node.querySelector('grapp-question-feedback, [data-testid="question-feedback"]');

          if (nativeFeedback) {
            // Find the parent challenge container
            const container = nativeFeedback.closest('grapp-challenge') ||
              nativeFeedback.closest('.challenge-container') ||
              nativeFeedback.closest('.card');

            if (container) {
              // Hide our injected explanation in this container
              const injectedFeedback = container.querySelector('.grasple-tools-injected-feedback');
              if (injectedFeedback) {
                injectedFeedback.style.display = 'none';
                console.log('Grasple Tools: Hid injected explanation because native feedback appeared');
              }
            }
          }
        }
      }
    }
  });

  // Start observing the entire body for changes in the element tree.
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Run the check once on script load.
  runInjectionCheck();

})();
