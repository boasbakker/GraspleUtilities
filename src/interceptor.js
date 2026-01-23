// src/interceptor.js - Network interceptor and KaTeX injection

// Dependencies: api.js

/**
 * Inject network interceptor to capture answers
 */
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
