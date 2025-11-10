// background.js - Background script for handling webRequest API

(function() {
  'use strict';

  // Cross-browser compatibility
  const hasBrowser = (typeof browser !== 'undefined');
  const hasChrome = (typeof chrome !== 'undefined');
  const api = hasBrowser ? browser : (hasChrome ? chrome : null);

  if (!api || !api.webRequest) {
    console.error('webRequest API not available');
    return;
  }

  // URL pattern to match - using regex in filter
  const urlPattern = 'https://app.grasple.com/backend/api/public/api/v0.1/courses/*/content-items/*/levels/*/challenges/*/*';

  console.log('Background script loaded, setting up webRequest listeners for:', urlPattern);

  // Listen for requests being sent (to see request details)
  api.webRequest.onBeforeRequest.addListener(
    function(details) {
      console.log('=== Grasple API Request (Before) ===');
      console.log('URL:', details.url);
      console.log('Method:', details.method);
      console.log('Request ID:', details.requestId);
      console.log('Tab ID:', details.tabId);
      console.log('Type:', details.type);
      console.log('Timestamp:', new Date(details.timeStamp).toISOString());
      
      // Log request body if available (only for POST/PUT requests)
      if (details.requestBody) {
        console.log('Request Body:', details.requestBody);
      }
      console.log('====================================');
    },
    { urls: [urlPattern] },
    ['requestBody']
  );

  // Listen for request headers being sent
  api.webRequest.onBeforeSendHeaders.addListener(
    function(details) {
      console.log('=== Grasple API Request Headers ===');
      console.log('URL:', details.url);
      console.log('Request ID:', details.requestId);
      
      // Log request headers
      if (details.requestHeaders) {
        console.log('Request Headers:', details.requestHeaders);
      }
      console.log('====================================');
    },
    { urls: [urlPattern] },
    ['requestHeaders']
  );

  // Listen for completed requests (to see response details)
  api.webRequest.onCompleted.addListener(
    function(details) {
      console.log('=== Grasple API Response (Completed) ===');
      console.log('URL:', details.url);
      console.log('Method:', details.method);
      console.log('Status Code:', details.statusCode);
      console.log('Request ID:', details.requestId);
      console.log('Tab ID:', details.tabId);
      console.log('Type:', details.type);
      console.log('Timestamp:', new Date(details.timeStamp).toISOString());
      
      // Log response headers
      if (details.responseHeaders) {
        console.log('Response Headers:', details.responseHeaders);
      }
      console.log('Note: Response body not available via webRequest API in MV3');
      console.log('=========================================');
    },
    { urls: [urlPattern] },
    ['responseHeaders']
  );

  // Listen for errors
  api.webRequest.onErrorOccurred.addListener(
    function(details) {
      console.error('=== Grasple API Request Error ===');
      console.error('URL:', details.url);
      console.error('Error:', details.error);
      console.error('Request ID:', details.requestId);
      console.error('=================================');
    },
    { urls: [urlPattern] }
  );

  console.log('WebRequest listeners registered successfully');

})();
