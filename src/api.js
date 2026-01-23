// src/api.js - Browser API detection and cross-browser compatibility

// Cross-browser compatibility
const hasBrowser = (typeof browser !== 'undefined');
const hasChrome = (typeof chrome !== 'undefined');
const api = hasBrowser ? browser : (hasChrome ? chrome : null);
