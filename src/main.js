// src/main.js - Main entry point for Grasple Tools extension

console.log('Grasple Tools: version 2026-01-20-17-07');

// Main Initialization Function
function initializeGraspleTools() {
    // Check if we should run in this context
    if (!shouldRunInThisContext()) {
        console.log("Grasple Tools: Not running in this context (hostname:", window.location.hostname, ")");
        return;
    }

    console.log("Grasple Tools: Initializing in context:", isInIframe ? "iframe (embedded)" : "main page");

    // Initialize all components
    initializeState();
    injectInterceptor();
    setupMessageListeners();
    setupSettingsListener();

    // Run initial injection check
    runInjectionCheck();

    // Setup observer for DOM changes
    setupObserver();

    // Inject custom styles
    injectStyles();
}

// Start encryption
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGraspleTools);
} else {
    initializeGraspleTools();
}
