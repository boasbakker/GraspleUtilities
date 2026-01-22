// contentScript.js - Injected into app.grasple.com
// Adds a "Copy question" button to the exercise header

(function () {
  'use strict';

  console.log('Grasple Tools: version 2026-01-20-17-07');

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

    // Inject interceptor script as external file (required for Chrome MV3 CSP)
    const script = document.createElement('script');
    script.src = api.runtime.getURL('interceptor.js');
    script.onload = function () {
      console.log('Grasple Tools: Interceptor script loaded');
      script.remove(); // Clean up after loading
    };
    script.onerror = function (e) {
      console.error('Grasple Tools: Failed to load interceptor script', e);
    };
    (document.head || document.documentElement).appendChild(script);
  }
  injectInterceptor();

  // Store data globally
  window.graspleChallenges = {}; // Map by ID
  window.graspleChallengesList = []; // Ordered list
  window.graspleSessionData = null;
  window.graspleAuthToken = null;
  window.graspleCorrectAnswers = {}; // Store correct answers by challenge ID for button injection

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
    if (event.data.type === 'GRASPLE_CHECK_ANSWER_RESPONSE') {
      const payload = event.data.payload;
      const url = event.data.url;
      console.log('Grasple Tools: Storing check-answer response', payload, 'URL:', url);

      // Extract challenge ID from the URL: /challenges/XXXXX/check-answer
      let challengeId = 'latest';
      if (url) {
        // Updated regex to handle optional version segment (e.g. /61582/31/check-answer)
        const match = url.match(/\/challenges\/(\d+)(?:\/[^\/]+)?\/check-answer/);
        if (match) {
          challengeId = match[1];
        }
      }
      console.log('Grasple Tools: Extracted challenge ID from URL:', challengeId);

      // Store the correct answer for later button injection
      if (payload.correct_answer) {
        window.graspleCorrectAnswers[challengeId] = payload.correct_answer;
        // Also store as 'latest' for fallback matching
        window.graspleCorrectAnswers['latest'] = payload.correct_answer;
        console.log('Grasple Tools: Stored correct answer for challenge', challengeId);
      }
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

        // Show/hide hint buttons
        const hintBtns = document.querySelectorAll('.grasple-show-hint-btn');
        hintBtns.forEach(btn => {
          btn.style.display = message.showHintButtons ? '' : 'none';
        });

        // Show/hide injected content fields
        // 1. Explanations
        const explanationFields = document.querySelectorAll('.grasple-tools-injected-feedback');
        explanationFields.forEach(el => {
          el.style.display = message.showExplanationButtons ? '' : 'none';
        });

        // 2. Answers
        const answerFields = document.querySelectorAll('.grasple-tools-correct-answer-display');
        answerFields.forEach(el => {
          el.style.display = message.showAnswerButtons ? '' : 'none';
        });

        // 3. Hints
        const hintFields = document.querySelectorAll('.grasple-tools-injected-hint');
        hintFields.forEach(el => {
          el.style.display = message.showHintButtons ? '' : 'none';
        });

        // 4. MCQ Answers Highlighting
        if (message.showAnswerButtons) {
          document.body.classList.add('grasple-tools-show-answers');
        } else {
          document.body.classList.remove('grasple-tools-show-answers');
        }
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
    // Check settings
    const config = await configGet({ showExplanationButtons: true, showAnswerButtons: true, showHintButtons: true });
    const showExplanation = config.showExplanationButtons !== false;
    const showAnswer = config.showAnswerButtons !== false;
    const showHint = config.showHintButtons !== false;

    // Initialize body class for MCQ answer toggling
    if (showAnswer) {
      document.body.classList.add('grasple-tools-show-answers');
    } else {
      document.body.classList.remove('grasple-tools-show-answers');
    }

    // 1. Find existing "Check" buttons
    {
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

        console.log('Grasple Tools: Found Check button. Injecting buttons...');

        originalCheckBtn.setAttribute('data-grasple-tools-processed', 'true');

        const parent = originalCheckBtn.parentNode;

        // Insert hint button
        const hintBtn = createShowHintButton(originalCheckBtn.className);
        if (!showHint) hintBtn.style.display = 'none';
        parent.insertBefore(hintBtn, originalCheckBtn);

        // Insert explanation button
        const explainBtn = createExplanationButton(originalCheckBtn.className);
        if (!showExplanation) explainBtn.style.display = 'none';
        parent.insertBefore(explainBtn, originalCheckBtn);

        // Check if we have a stored correct answer for THIS specific challenge
        // Find challenge ID by traversing up from the button to find the containing question
        let challengeId = null;

        // Walk up the DOM tree to find the nearest container with a question header
        let currentEl = originalCheckBtn;
        let header = null;
        while (currentEl && currentEl !== document.body) {
          currentEl = currentEl.parentElement;
          if (currentEl) {
            header = currentEl.querySelector('[id^="question-header-"]');
            if (header) {
              console.log('Grasple Tools DEBUG: Found header in ancestor:', currentEl.tagName, '→', header.id);
              break;
            }
          }
        }

        if (header) {
          const match = header.id.match(/question-header-(\d+)/);
          if (match) challengeId = match[1];
        }

        // Strategy 2: Look for parent with id (fallback)
        if (!challengeId) {
          const challengeEl = originalCheckBtn.closest('[id^="challenge-"]');
          console.log('Grasple Tools DEBUG: Fallback challenge element:', challengeEl?.id);
          if (challengeEl) {
            const match = challengeEl.getAttribute('id').match(/challenge-(\d+)/);
            if (match) challengeId = match[1];
          }
        }

        console.log('Grasple Tools DEBUG: Extracted challengeId:', challengeId);
        console.log('Grasple Tools DEBUG: Stored answers:', JSON.stringify(Object.keys(window.graspleCorrectAnswers || {})));

        // Fallback: use 'latest' if single question mode and no ID found

        let storedAnswer = null;
        if (challengeId && window.graspleCorrectAnswers && window.graspleCorrectAnswers[challengeId]) {
          storedAnswer = window.graspleCorrectAnswers[challengeId];
          console.log('Grasple Tools DEBUG: Found answer by ID');
        } else if (!challengeId && window.graspleCorrectAnswers && Object.keys(window.graspleCorrectAnswers).length >= 1 && window.graspleCorrectAnswers['latest']) {
          // If we couldn't find an ID but there's a latest answer stored, use it as fallback
          storedAnswer = window.graspleCorrectAnswers['latest'];
          console.log('Grasple Tools DEBUG: Using latest answer as fallback');
        } else {
          console.log('Grasple Tools DEBUG: No matching answer found');
        }

        if (storedAnswer) {
          const correctBtn = createCorrectAnswerButton(originalCheckBtn.className, storedAnswer);
          // Verify not already injected
          if (!parent.querySelector('.grasple-correct-answer-btn')) {
            parent.insertBefore(correctBtn, originalCheckBtn);
            console.log('Grasple Tools: Injected View Correct Answer button for ID:', challengeId || 'latest');
          } else {
            console.log('Grasple Tools DEBUG: Button already exists, skipping');
          }
        }
      });
    }

    // 1b. SEPARATE PASS for correct answer buttons on ALL check buttons
    // This runs independently because the answer might be stored AFTER the button was processed
    if (Object.keys(window.graspleCorrectAnswers || {}).length > 0) {
      let allCheckBtns = Array.from(document.querySelectorAll('button[data-testid="check-answer-button"]'));
      // Also try broader search
      if (allCheckBtns.length === 0) {
        allCheckBtns = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => {
          const txt = b.textContent.trim().toLowerCase();
          return (txt.includes('check') || txt.includes('controleer'));
        });
      }

      allCheckBtns.forEach(checkBtn => {
        const parent = checkBtn.parentNode;
        // Skip if button already exists
        if (parent.querySelector('.grasple-correct-answer-btn')) return;

        // Find challenge ID for this button
        let challengeId = null;
        let currentEl = checkBtn;
        let header = null;
        while (currentEl && currentEl !== document.body) {
          currentEl = currentEl.parentElement;
          if (currentEl) {
            header = currentEl.querySelector('[id^="question-header-"]');
            if (header) break;
          }
        }
        if (header) {
          const match = header.id.match(/question-header-(\d+)/);
          if (match) challengeId = match[1];
        }

        // Check for stored answer
        let storedAnswer = null;
        if (challengeId && window.graspleCorrectAnswers[challengeId]) {
          storedAnswer = window.graspleCorrectAnswers[challengeId];
        } else if (!challengeId && window.graspleCorrectAnswers['latest']) {
          storedAnswer = window.graspleCorrectAnswers['latest'];
        }

        if (storedAnswer) {
          const correctBtn = createCorrectAnswerButton(checkBtn.className, storedAnswer);
          parent.insertBefore(correctBtn, checkBtn);
          console.log('Grasple Tools: Injected View Correct Answer button (late pass) for ID:', challengeId || 'latest');
        }
      });
    }

    // 2. Handle multiple choice questions (no Check button)
    // Look for grapp-multiple-choice elements that don't have our button yet
    const mcContainers = document.querySelectorAll('grapp-multiple-choice-single-answer, grapp-multiple-choice-multiple-answers, grapp-multiple-choice, grapp-challenge[data-challenge-type="multiple_choice"]');

    mcContainers.forEach(mcContainer => {
      // Check if already processed
      if (mcContainer.hasAttribute('data-grasple-mc-processed')) return;

      // Check if there's already a check button inside (then it's handled above)
      if (mcContainer.querySelector('button[data-testid="check-answer-button"]')) return;
      if (mcContainer.querySelector('.grasple-safe-check-btn') || mcContainer.querySelector('.grasple-show-answer-btn')) return;

      console.log('Grasple Tools: Found multiple choice container. Injecting buttons...');

      mcContainer.setAttribute('data-grasple-mc-processed', 'true');

      // Find a good place to insert - after the instruction text or at the end
      const instructionEl = mcContainer.querySelector('grapp-multiple-choice-answer-instruction');
      const fieldset = mcContainer.querySelector('fieldset');

      // Create a wrapper div
      const wrapper = document.createElement('div');
      wrapper.style.marginTop = '10px';
      wrapper.style.padding = '10px 0';
      wrapper.classList.add('grasple-tools-button-wrapper');

      // Add explanation button
      const explainBtn = createExplanationButton('btn btn-warning');
      if (!showExplanation) explainBtn.style.display = 'none';
      wrapper.appendChild(explainBtn);

      // Add "Show Hint" button
      const hintBtn = createShowHintButton('btn btn-info');
      if (!showHint) hintBtn.style.display = 'none';
      wrapper.appendChild(hintBtn);

      // Add "Show Answer" button
      const answerBtn = createShowAnswerButton('btn btn-success');
      if (!showAnswer) answerBtn.style.display = 'none';
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
    // Fix visual disabled state
    answerBtn.style.cursor = 'pointer';
    answerBtn.style.opacity = '1';
    answerBtn.style.pointerEvents = 'auto';

    answerBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await showCorrectAnswer(answerBtn);
    });

    return answerBtn;
  }

  // Helper to create the View Correct Answer button
  function createCorrectAnswerButton(baseClassName, correctAnswerData) {
    const correctBtn = document.createElement('button');
    correctBtn.innerHTML = '<span>View Correct Answer</span>';
    correctBtn.className = baseClassName;
    correctBtn.classList.add('grasple-correct-answer-btn');

    correctBtn.style.color = '#fff';
    correctBtn.style.backgroundColor = '#28a745'; // green (same as Show Answer)
    correctBtn.style.borderColor = '#28a745';
    correctBtn.style.marginRight = '10px';
    // Fix visual disabled state
    correctBtn.style.cursor = 'pointer';
    correctBtn.style.opacity = '1';
    correctBtn.style.pointerEvents = 'auto';

    // Store the correct answer data on the button
    correctBtn.dataset.correctAnswer = JSON.stringify(correctAnswerData);

    correctBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Container is closest feedback parent or fieldset
      const container = correctBtn.closest('grapp-question-answer-field') || correctBtn.parentNode;
      showCorrectAnswerFromResponse(correctBtn, container);
    });

    return correctBtn;
  }

  // Show the correct answer from check-answer response
  function showCorrectAnswerFromResponse(btn, container) {
    let correctAnswerObj;
    try {
      correctAnswerObj = JSON.parse(btn.dataset.correctAnswer);
    } catch (e) {
      alert('Could not parse correct answer data.');
      return;
    }

    // Extract the answer field
    let answerValue = correctAnswerObj.answer;

    if (!answerValue) {
      alert('No answer found in correct_answer object.');
      return;
    }

    // Format the correct answer for display
    let answerHtml = '';

    // Check if the answer is a JSON string (multiple fields case)
    if (typeof answerValue === 'string' && answerValue.startsWith('{')) {
      try {
        const multiAnswers = JSON.parse(answerValue);
        // Multiple fields - display each
        answerHtml = '<div style="font-size: 1.1em;">';
        let fieldNum = 1;
        for (const [key, value] of Object.entries(multiAnswers)) {
          // Clean up key name (student.answer2 -> Field 1)
          const fieldLabel = 'Field ' + fieldNum;
          answerHtml += '<p style="margin: 0.5em 0;"><strong>' + fieldLabel + ':</strong> <code style="font-size: 1.2em; background: #fff; padding: 2px 6px; border-radius: 3px;">' + value + '</code></p>';
          fieldNum++;
        }
        answerHtml += '</div>';
      } catch (e) {
        // Not valid JSON, treat as simple string
        answerHtml = '<p style="font-size: 1.2em;"><strong>Answer:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">' + answerValue + '</code></p>';
      }
    } else {
      // Simple single answer
      answerHtml = '<p style="font-size: 1.2em;"><strong>Answer:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">' + answerValue + '</code></p>';
    }

    // Toggle logic: if already visible, hide it
    const existing = container.querySelector('.grasple-tools-correct-answer-display');
    if (existing) {
      existing.remove();
      return;
    }

    // Use createInfoBox to display
    createInfoBox({
      container: container,
      className: 'grasple-tools-correct-answer-display',
      title: 'Correct Answer',
      backgroundColor: '#d4edda', // lighter green
      borderColor: '#c3e6cb',
      titleColor: '#155724',
      content: answerHtml
    });

    console.log('Grasple Tools: Displayed correct answer from check-answer response');
  }

  // Helper function to create the Show Hint button
  function createShowHintButton(baseClassName) {
    const hintBtn = document.createElement('button');
    hintBtn.innerHTML = '<span>Show Hint</span>';
    hintBtn.className = baseClassName;
    hintBtn.classList.add('grasple-show-hint-btn');

    hintBtn.style.color = '#fff';
    hintBtn.style.backgroundColor = '#17a2b8'; // info blue
    hintBtn.style.borderColor = '#17a2b8';
    hintBtn.style.marginRight = '10px';
    // Fix visual disabled state
    hintBtn.style.cursor = 'pointer';
    hintBtn.style.opacity = '1';
    hintBtn.style.pointerEvents = 'auto';

    hintBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await showHint(hintBtn);
    });

    return hintBtn;
  }

  // Show hint for questions
  async function showHint(btn) {
    const challengesMap = window.graspleChallenges || {};
    const challengesList = window.graspleChallengesList || [];

    // Find the question wrapper
    const questionWrapper = btn.closest('grapp-question.question-wrapper') ||
      btn.closest('grapp-question');
    const answerContainer = btn.closest('grapp-multiple-choice-single-answer') ||
      btn.closest('grapp-multiple-choice-multiple-answers') ||
      btn.closest('grapp-multiple-choice') ||
      btn.closest('grapp-question-answer-field');

    const container = questionWrapper || answerContainer ||
      btn.closest('grapp-challenge') ||
      document.body;

    const searchRoot = questionWrapper || answerContainer || container;

    // Find challenge using similar matching logic as showExplanation
    let challengeInfo = null;

    // Strategy 0: Fieldset ID Match
    const fieldset = searchRoot.querySelector('fieldset[id^="question-answer-input-"]');
    if (fieldset && fieldset.id) {
      const match = fieldset.id.match(/question-answer-input-(\d+)/);
      if (match) {
        const fieldsetId = parseInt(match[1], 10);
        if (challengesMap[fieldsetId]) {
          challengeInfo = challengesMap[fieldsetId];
        }
      }
    }

    // Strategy 1: Visual ID Match
    if (!challengeInfo) {
      const text = searchRoot.innerText || searchRoot.textContent || '';
      const idMatch = text.match(/(?:Question|Vraag)\s*#\s*(\d+)/i) || text.match(/#(\d{4,})/);
      if (idMatch && challengesMap[idMatch[1]]) {
        challengeInfo = challengesMap[idMatch[1]];
      }
    }

    // Strategy 2: Index-based
    if (!challengeInfo) {
      const allHintBtns = Array.from(document.querySelectorAll('.grasple-show-hint-btn'));
      const btnIndex = allHintBtns.indexOf(btn);
      if (btnIndex >= 0 && btnIndex < challengesList.length) {
        challengeInfo = challengesList[btnIndex];
      }
    }

    if (!challengeInfo) {
      alert('Could not find challenge data for hint. Try refreshing.');
      return;
    }

    const challengeObj = challengeInfo.data.challenge || challengeInfo.data;
    console.log('Grasple Tools: Showing hint for', challengeObj);

    // Determine hint content
    let hints = [];

    // For input questions: use feedback_wrong
    if (challengeObj.feedback_wrong) {
      hints.push({ label: 'Hint', content: challengeObj.feedback_wrong });
    }

    // For MCQs: use response from incorrect answers
    if (challengeObj.answers && challengeObj.answers.length > 0) {
      const incorrectAnswers = challengeObj.answers.filter(a => a.right_answer === 0 && a.response);

      // Get unique responses
      const uniqueResponses = [];
      const seenResponses = new Set();
      for (const ans of incorrectAnswers) {
        const normalized = ans.response.replace(/<[^>]*>/g, '').trim();
        if (!seenResponses.has(normalized)) {
          seenResponses.add(normalized);
          uniqueResponses.push({ label: ans.answer.replace(/<[^>]*>/g, '').trim(), content: ans.response });
        }
      }

      if (uniqueResponses.length > 0) {
        hints = uniqueResponses;
      }
    }

    if (hints.length === 0) {
      alert('No hint available for this question.');
      return;
    }

    // Display the hint
    displayHint(btn, answerContainer || container, hints);
  }

  // Display hint with optional dropdown for multiple hints
  function displayHint(btn, container, hints) {
    // Toggle logic
    const existing = container.querySelector('.grasple-tools-injected-hint');
    if (existing) {
      existing.remove();
      return;
    }
    // Use common info box function
    createInfoBox({
      container: container,
      className: 'grasple-tools-injected-hint',
      title: 'Hint',
      backgroundColor: '#d1ecf1',
      borderColor: '#bee5eb',
      titleColor: '#0c5460',
      content: hints.length === 1 ? hints[0].content : null,
      multiContent: hints.length > 1 ? hints : null
    });
  }

  /**
   * Common function to create info boxes (for explanation and hint)
   * Ensures consistent styling and KaTeX rendering
   */
  function createInfoBox(options) {
    const {
      container,
      className,
      title,
      backgroundColor = '#f8f9fa',
      borderColor = '#dee2e6',
      titleColor = '#212529',
      content = null,
      multiContent = null  // Array of { label, content } for dropdown
    } = options;

    // Remove existing box of same type
    let existing = container.querySelector('.' + className);
    if (existing) {
      existing.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.className = className + ' mt-3 grasple-tools-info-box';
    wrapper.id = 'grasple-box-' + Math.random().toString(36).substr(2, 9);

    let html = `
      <grapp-question-feedback>
        <div data-testid="container">
          <section data-testid="question-feedback" class="question-feedback question-feedback--visible">
            <div class="question-feedback-wrapper position-relative" style="background-color: ${backgroundColor}; border: 1px solid ${borderColor}; border-radius: 0.25rem; padding: 1rem;">
              <h2 class="h5" style="color: ${titleColor};">${title}</h2>
              
              <div class="info-box-contents">
    `;

    // Log content for debugging
    if (content) console.log('Grasple Tools Check:', content.includes('\\\\') ? 'Double Backslashes Detected' : 'Clean');

    if (content) {
      // Single content
      html += '<div class="user-provided-html">' + content + '</div>';
    } else if (multiContent && multiContent.length > 0) {
      // Multiple content with dropdown
      html += '<div style="margin-bottom: 10px;"><span style="margin-right: 8px;">Feedback for answer:</span>';
      html += '<select class="hint-selector" style="padding: 5px; border-radius: 3px;">';
      multiContent.forEach((item, i) => {
        html += '<option value="' + i + '">' + item.label + '</option>';
      });
      html += '</select></div>';
      multiContent.forEach((item, i) => {
        html += '<div class="info-content-item" data-index="' + i + '" style="' + (i > 0 ? 'display:none;' : '') + '">';
        html += '<div class="user-provided-html">' + item.content + '</div>';
        html += '</div>';
      });
    }

    html += `
              </div>
            </div>
          </section>
        </div>
      </grapp-question-feedback>
    `;

    wrapper.innerHTML = html;

    // Add dropdown event listener if multiple content
    if (multiContent && multiContent.length > 1) {
      setTimeout(() => {
        const selector = wrapper.querySelector('.hint-selector');
        if (selector) {
          selector.addEventListener('change', (e) => {
            const selectedIndex = e.target.value;
            wrapper.querySelectorAll('.info-content-item').forEach(el => {
              el.style.display = el.dataset.index === selectedIndex ? '' : 'none';
            });
            // Re-render math for newly visible content
            window.postMessage({ type: 'GRASPLE_RENDER_MATH', id: wrapper.id }, '*');
          });
        }
      }, 0);
    }

    container.appendChild(wrapper);

    // Trigger math rendering
    setTimeout(() => {
      window.postMessage({ type: 'GRASPLE_RENDER_MATH', id: wrapper.id }, '*');
    }, 50);

    console.log('Grasple Tools: Created info box:', title);

    return wrapper;
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

    // Toggle logic: Check if we are already showing answers
    // If ANY correct answer is highlighted, we assume we want to toggle OFF.
    const alreadyShowing = Array.from(container.querySelectorAll('.grasple-mc-correct')).length > 0;

    if (alreadyShowing) {
      container.querySelectorAll('.grasple-mc-correct').forEach(el => el.classList.remove('grasple-mc-correct'));
      return;
    }

    // Highlight the correct answer(s) in the UI
    correctAnswers.forEach(correct => {
      const radioInput = container.querySelector(`input[value="${correct.id}"]`);
      if (radioInput) {
        const label = radioInput.closest('label') || radioInput.parentElement;
        if (label) {
          label.classList.add('grasple-mc-correct');
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
    // Fix visual disabled state
    explainBtn.style.cursor = 'pointer';
    explainBtn.style.opacity = '1';
    explainBtn.style.pointerEvents = 'auto';

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

    // Find the question wrapper - this is the unique container per question
    // Structure: grapp-question.question-wrapper contains grapp-multiple-choice-* or grapp-question-answer-field
    const questionWrapper = btn.closest('grapp-question.question-wrapper') ||
      btn.closest('grapp-question');

    // The answer field or MCQ container (for insertion at end)
    const answerContainer = btn.closest('grapp-multiple-choice-single-answer') ||
      btn.closest('grapp-multiple-choice-multiple-answers') ||
      btn.closest('grapp-multiple-choice') ||
      btn.closest('grapp-question-answer-field');

    // Fallback container
    const container = questionWrapper || answerContainer ||
      btn.closest('grapp-challenge') ||
      document.body;

    let challengeInfo = null;

    // Use questionWrapper for ID lookup (it contains the question ID text)
    const searchRoot = questionWrapper || answerContainer || container;

    // Strategy 0: Fieldset ID Match (most reliable for sub-questions/MCQs)
    const fieldset = searchRoot.querySelector('fieldset[id^="question-answer-input-"]');
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

    // Strategy 0.5: Input/Form element ID Match for regular questions
    if (!challengeInfo) {
      // Look for math-field, input elements with challenge ID patterns
      const inputEl = searchRoot.querySelector('[id*="challenge-"][id*="-input"]') ||
        searchRoot.querySelector('math-field[id]') ||
        searchRoot.querySelector('input[name*="answer"]');
      if (inputEl && inputEl.id) {
        // Try to extract challenge ID from input ID pattern
        const idMatch = inputEl.id.match(/challenge[_-]?(\d+)/i) ||
          inputEl.id.match(/question[_-]?(\d+)/i) ||
          inputEl.id.match(/(\d{4,})/); // Match 4+ digit IDs
        if (idMatch) {
          const inputChallengeId = parseInt(idMatch[1], 10);
          if (challengesMap[inputChallengeId]) {
            console.log('Grasple Tools: Matched via Input ID:', inputChallengeId);
            challengeInfo = challengesMap[inputChallengeId];
          }
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
      const visualId = findIdInElement(searchRoot); // Use searchRoot instead of container
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
      // MCQ: look for correct answer(s) response field
      const correctAnswers = challengeObj.answers.filter(a => a.right_answer === 1 && a.response);

      if (correctAnswers.length > 1) {
        // Multiple correct answers - use dropdown
        const uniqueExplanations = [];
        const seenExplanations = new Set();
        for (const ans of correctAnswers) {
          const normalized = ans.response.replace(/<[^>]*>/g, '').trim();
          if (!seenExplanations.has(normalized)) {
            seenExplanations.add(normalized);
            uniqueExplanations.push({
              label: ans.answer.replace(/<[^>]*>/g, '').trim(),
              content: ans.response
            });
          }
        }

        if (uniqueExplanations.length > 1) {
          // Multiple unique explanations - use dropdown
          createInfoBox({
            container: answerContainer || container,
            className: 'grasple-tools-injected-feedback',
            title: 'Explanation',
            backgroundColor: '#f8f9fa',
            borderColor: '#dee2e6',
            titleColor: '#212529',
            multiContent: uniqueExplanations
          });
          console.log('Grasple Tools: Injected explanation with dropdown for multiple correct answers.');
          return;
        } else if (uniqueExplanations.length === 1) {
          explanation = uniqueExplanations[0].content;
        }
      } else if (correctAnswers.length === 1) {
        explanation = correctAnswers[0].response;
      }
    }

    // Toggle logic
    const existing = (answerContainer || container).querySelector('.grasple-tools-injected-feedback');
    if (existing) {
      existing.remove();
      return;
    }

    // --- Use common info box function ---
    createInfoBox({
      container: answerContainer || container,
      className: 'grasple-tools-injected-feedback',
      title: 'Explanation',
      backgroundColor: '#f8f9fa',
      borderColor: '#dee2e6',
      titleColor: '#212529',
      content: explanation
    });

    console.log('Grasple Tools: Injected explanation via createInfoBox.');
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
          // Skip if this is our own injected element
          if (node.classList?.contains('grasple-tools-injected-feedback') ||
            node.closest?.('.grasple-tools-injected-feedback')) {
            continue;
          }

          // Check if native feedback was added (grapp-question-feedback or section with question-feedback class)
          let nativeFeedback = node.matches && node.matches('grapp-question-feedback, [data-testid="question-feedback"], .question-feedback')
            ? node
            : node.querySelector && node.querySelector('grapp-question-feedback, [data-testid="question-feedback"], .question-feedback');

          // Make sure it's not inside our injected element
          if (nativeFeedback && nativeFeedback.closest('.grasple-tools-injected-feedback')) {
            nativeFeedback = null;
          }

          if (nativeFeedback) {
            // Find the parent question wrapper
            const questionWrapper = nativeFeedback.closest('grapp-question.question-wrapper') ||
              nativeFeedback.closest('grapp-question');
            const answerContainer = nativeFeedback.closest('grapp-multiple-choice-single-answer') ||
              nativeFeedback.closest('grapp-multiple-choice-multiple-answers') ||
              nativeFeedback.closest('grapp-multiple-choice') ||
              nativeFeedback.closest('grapp-question-answer-field');

            const container = questionWrapper || answerContainer;

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

  // Inject Custom Styles for Toggling
  const style = document.createElement('style');
  style.textContent = `
    body.grasple-tools-show-answers .grasple-mc-correct {
        border: 3px solid #28a745 !important;
        background-color: #d4edda !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);

})();
