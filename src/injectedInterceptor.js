// interceptor.js - Injected into page context for XHR interception
// This file must be external (not inline) for Chrome MV3 CSP compliance

(function () {
    console.log('Grasple Tools: Interceptor Loaded');
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;

    XHR.open = function (method, url) {
        this._url = url;
        return open.apply(this, arguments);
    };

    // Monitor URL changes to clear stale answer data
    let lastUrl = window.location.href;
    // Monkey patch pushState and replaceState
    const pushState = history.pushState;
    history.pushState = function () {
        const ret = pushState.apply(this, arguments);
        onUrlChange();
        return ret;
    };
    const replaceState = history.replaceState;
    history.replaceState = function () {
        const ret = replaceState.apply(this, arguments);
        onUrlChange();
        return ret;
    };
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);

    function onUrlChange() {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            console.log('Grasple Tools: URL changed to', currentUrl, '- notifying content script');
            lastUrl = currentUrl;
            window.postMessage({ type: 'GRASPLE_URL_CHANGED', url: currentUrl }, '*');
        }
    }

    // Store captured headers for replay
    // Store captured headers for replay
    window.graspleHeaders = {};
    const UNSAFE_HEADERS = new Set(['content-length', 'host', 'connection', 'origin', 'referer', 'cookie', 'user-agent', 'accept-encoding']);

    const setRequestHeader = XHR.setRequestHeader;
    XHR.setRequestHeader = function (header, value) {
        // Capture ALL valid headers
        if (header && value) {
            const key = header.toLowerCase();
            if (!UNSAFE_HEADERS.has(key)) {
                window.graspleHeaders[header] = value;
            }
        }

        // Legacy support for specific token message if needed elsewhere
        if (header.toLowerCase() === 'authorization') {
            window.postMessage({ type: 'GRASPLE_AUTH_TOKEN', token: value }, '*');
        }
        return setRequestHeader.apply(this, arguments);
    };

    XHR.send = function (postData) {
        this.addEventListener('load', function () {

            // Match challenge API URL (Broader regex)
            const match = this._url && this._url.match(/\/challenges\/(\d+)/);
            if (match) {
                console.log('Grasple Tools: XHR matched Challenge', this._url);
                try {
                    const data = JSON.parse(this.responseText);

                    // Extract c_hash from URL
                    let cHash = null;
                    try {
                        const urlObj = new URL(this._url, window.location.origin);
                        cHash = urlObj.searchParams.get('c_hash');
                    } catch (e) { }

                    const payload = { url: this._url, data: data, c_hash_from_url: cHash };
                    window.postMessage({ type: 'GRASPLE_CHALLENGE_INFO', payload: payload }, '*');
                } catch (e) { console.error('Grasple Tools: bad JSON', e); }
            }
            // Capture session data
            if (this._url && this._url.match(/\/challenge-session/)) {
                try {
                    const data = JSON.parse(this.responseText);
                    const sessionData = data.data || data;
                    window.postMessage({ type: 'GRASPLE_SESSION_DATA', payload: sessionData }, '*');
                } catch (e) { }
            }

            // Capture check-answer responses to get correct answers
            if (this._url && this._url.match(/\/check-answer/)) {
                try {
                    const data = JSON.parse(this.responseText);
                    console.log('Grasple Tools: Captured check-answer response', data);
                    // Include URL so we can extract challenge ID
                    window.postMessage({ type: 'GRASPLE_CHECK_ANSWER_RESPONSE', payload: data, url: this._url }, '*');
                } catch (e) { console.error('Grasple Tools: check-answer parse error', e); }
            }
        });
        return send.apply(this, arguments);
    };

    // Listen for Math Render requests from Content Script
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'GRASPLE_RENDER_MATH') {
            const targetId = e.data.id;
            const el = document.getElementById(targetId);
            if (el) {
                // Fix KaTeX background - ensure transparency so it inherits container color (yellow for explanation, blue for hint)
                if (!document.getElementById('grasple-katex-fix')) {
                    const style = document.createElement('style');
                    style.id = 'grasple-katex-fix';
                    style.textContent =
                        '.grasple-tools-injected-feedback .katex, ' +
                        '.grasple-tools-injected-feedback .katex *, ' +
                        '.grasple-tools-injected-feedback .user-provided-html span, ' +
                        '.grasple-tools-injected-hint .katex, ' +
                        '.grasple-tools-injected-hint .katex * { ' +
                        '  background: none !important; ' +
                        '  background-color: transparent !important; ' +
                        '} ' +
                        '.grasple-tools-injected-feedback .katex-display { ' +
                        '   margin: 0.5em 0 !important; ' +
                        '}';
                    document.head.appendChild(style);
                }

                // Use Grasple's default render settings (no custom options)
                if (window.renderMathInElement) {
                    try { window.renderMathInElement(el); } catch (e) { console.error('Grasple Tools: renderMathInElement failed', e); }
                } else if (window.katex && window.katex.renderMathInElement) {
                    try { window.katex.renderMathInElement(el); } catch (e) { console.error('Grasple Tools: katex.render failed', e); }
                } else if (window.MathJax) {
                    if (window.MathJax.typeset) {
                        try { window.MathJax.typeset([el]); } catch (e) { console.error('Grasple Tools: MathJax.typeset failed', e); }
                    } else if (window.MathJax.Hub) {
                        try { window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub, el]); } catch (e) { console.error('Grasple Tools: MathJax.Hub failed', e); }
                    }
                } else {
                    console.warn('Grasple Tools: No math renderer found. Searching global scope...');
                    const possibleKeys = Object.keys(window).filter(k => k.toLowerCase().includes('math') || k.toLowerCase().includes('katex'));
                    console.log('Grasple Tools: Possible math objects:', possibleKeys);
                }
            }
        }
    });

    // Listen for Fetch Answer requests (Check Answer)
    window.addEventListener('message', function (e) {
        if (e.data && e.data.type === 'GRASPLE_FETCH_ANSWER') {
            const { url, payload } = e.data;
            console.log('Grasple Tools: Fetching answer from', url);

            try {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', url, true);
                xhr.withCredentials = true; // IMPORTANT for cookies

                // Content-Type default
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');

                // Replay captured headers
                if (window.graspleHeaders) {
                    for (const [key, val] of Object.entries(window.graspleHeaders)) {
                        // Skip Content-Type if we set it above, or let it overwrite?
                        // Usually JSON payload needs specific content type.
                        if (key.toLowerCase() === 'content-type') continue;
                        try {
                            xhr.setRequestHeader(key, val);
                        } catch (err) {
                            console.warn('Grasple Tools: Could not set header', key, err);
                        }
                    }
                }

                // Explicitly ensure Authorization is set if we have it separately (redundant but safe)
                if (window.graspleAuthToken && (!window.graspleHeaders || !window.graspleHeaders['Authorization'])) {
                    xhr.setRequestHeader('Authorization', window.graspleAuthToken);
                }

                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            console.log('Grasple Tools: Fetched answer successfully', data);
                            // We don't need to manually post back GRASPLE_CHECK_ANSWER_RESPONSE 
                            // because the interceptor's send() hook will catch THIS request's response too!
                            // ...Wait, standard XHR interception wraps prototype.send.
                            // If we use new XMLHttpRequest(), it uses the WRAPPED send.
                            // So the existing logic in XHR.send wrapper (lines 23-64) will auto-capture this response.
                            // NICE.
                        } catch (err) {
                            console.error('Grasple Tools: Error parsing fetched answer', err);
                        }
                    } else {
                        console.error('Grasple Tools: Fetch answer failed', xhr.status, xhr.statusText);
                    }
                };

                xhr.onerror = function () {
                    console.error('Grasple Tools: Fetch answer network error');
                };

                xhr.send(JSON.stringify(payload));

            } catch (err) {
                console.error('Grasple Tools: Error sending fetch answer request', err);
            }
        }
    });

})();
