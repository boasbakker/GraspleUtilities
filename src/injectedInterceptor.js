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

    const setRequestHeader = XHR.setRequestHeader;
    XHR.setRequestHeader = function (header, value) {
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

})();
