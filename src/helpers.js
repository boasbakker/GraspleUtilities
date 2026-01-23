// src/helpers.js - Shared utility functions

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
const BUTTON_CONTAINER_ID = 'grasple-tools-button-container';

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

const isInIframe = window.self !== window.top;
