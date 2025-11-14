// background.js - Background script for handling webRequest API

'use strict';

// Cross-browser compatibility
const hasBrowser = (typeof browser !== 'undefined');
const hasChrome = (typeof chrome !== 'undefined');
const api = hasBrowser ? browser : (hasChrome ? chrome : null);


if (!api || !api.webRequest) {
  // console.error('webRequest API not available');
  throw new Error('webRequest API not available');
  // return;
}

// Configuration
const VERBOSE_LOG_QUESTION_REQUESTS = false;
const LOG_ANSWER_GETTING_DETAILS = true;

// URL pattern to match - using regex in filter
const urlPattern = 'https://app.grasple.com/backend/api/public/api/v0.1/courses/*/content-items/*/levels/*/challenges/*/*';

console.log('Background script loaded, setting up webRequest listeners for:', urlPattern);

// Listen for requests being sent (to see request details)
api.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.tabId === -1) {
      // this was a request created by this background.js
      return
    }
    if (VERBOSE_LOG_QUESTION_REQUESTS) {
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
    }
  },
  { urls: [urlPattern] },
  ['requestBody']
);

// Listen for request headers being sent
api.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    if (details.tabId === -1) {
      // this was a request created by this background.js
      return
    }
    if (VERBOSE_LOG_QUESTION_REQUESTS) {
      console.log('=== Grasple API Request Headers ===');
      console.log('URL:', details.url);
      console.log('Request ID:', details.requestId);
      
      // Log request headers
      if (details.requestHeaders) {
        console.log('Request Headers:', details.requestHeaders);
      }
      console.log('====================================');
    }
    if (details.requestHeaders) {
      answerTracker.setHeaders(details.requestId, details.requestHeaders, details.tabId)
    }
  },
  { urls: [urlPattern] },
  ['requestHeaders']
);

// Listen for completed requests (to see response details)
api.webRequest.onCompleted.addListener(
  function(details) {
    if (details.tabId === -1) {
      // this was a request created by this background.js
      return
    }
    if (VERBOSE_LOG_QUESTION_REQUESTS) {
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
    }

    // Send message to content script
    if (details.tabId && details.tabId !== -1) {
      const message = {
        type: 'GRASPLE_API_REQUEST_COMPLETED',
        data: {
          url: details.url,
          method: details.method,
          statusCode: details.statusCode,
          requestId: details.requestId,
          timestamp: new Date(details.timeStamp).toISOString(),
          // responseHeaders: details.responseHeaders
        }
      };

      answerTracker.loadAnswer(details.url, details.requestId);
      
      api.tabs.sendMessage(details.tabId, message).catch(err => {
        console.log('Could not send message to content script:', err);
      });
    }
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

// Message listener for content script requests
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_ANSWER') {
    // Handle answer request from content script
    const questionId = message.questionId;
    const timestamp = message.timestamp || Date.now();
    
    answerTracker.getAnswer(questionId, timestamp)
      .then(answer => {
        sendResponse({ status: 'success', answer: answer });
      })
      .catch(err => {
        console.error('Error getting answer:', err);
        sendResponse({ status: 'error', message: String(err) });
      });
    
    // Return true to indicate we will send response asynchronously
    return true;
  }
});


class AnswerTracker {
  // static IGNORED_HEADERS = ["priority"]// matched as lowercase
  // this header seems to somehow be 
  static HEADER_OVERRIDE = {
    "Accept": "application/json, text/plain, */*",
  }

  constructor() {
    this.requestQueue = []; // {promise, timestamp: number}
    this.answerLookup = {}; // question id -> answer data
    this.requestHeadersById = {}
  }

  async setHeaders(requestId, headers, tabId) {
    
    let obj = {}
    headers.forEach(v => {
      if (!v[0]) return
      if (AnswerTracker.HEADER_SET.has(v[0].toLowerCase())) {
        return
      }
      obj[v[0]] = v[1]
    })
    
    // Load authorization from the tab's localStorage
    if (tabId && tabId !== -1) {
      try {
        const results = await api.scripting.executeScript({
          target: { tabId: tabId },
          func: () => {
            const sessionStorage = localStorage.getItem('session_storage');
            return sessionStorage;
          }
        });
        
        if (results && results[0] && results[0].result) {
          const sessionData = JSON.parse(results[0].result);
          if (sessionData.token && sessionData.id) {
            // Format: Authorization: John%20Malkovich {token} {id}
            obj['Authorization'] = `John%20Malkovich ${sessionData.token} ${sessionData.id}`;
            if (LOG_ANSWER_GETTING_DETAILS) {
              console.log('Authorization header added from tab localStorage');
            }
          }
        }
      } catch (err) {
        console.error('Failed to retrieve authorization from tab:', err);
      }
    }
    
    this.requestHeadersById[requestId] = obj
    if (LOG_ANSWER_GETTING_DETAILS) {
      console.log('Headers for request', requestId, obj)
    }
  }

  loadAnswer(url, requestId) {
    const req = fetch(url, {headers: {...this.requestHeadersById[requestId], ...AnswerTracker.HEADER_OVERRIDE}, referrer: "https://app.grasple.com"}).then(res => res.json())
      .then(data => {
        let processed = this._processQuestion(data.challenge);
        if (LOG_ANSWER_GETTING_DETAILS) {
          console.log("processed questions:", processed)
        }
        processed.forEach(q => {
          this.answerLookup[q.id] = q;
        });
        if (LOG_ANSWER_GETTING_DETAILS) {
          console.log("was able to load answer data", processed)
        }
        return
      });
    delete this.requestHeadersById[requestId]
    this.requestQueue.push({promise: req, timestamp: Date.now()});
  }

  async getAnswer(questionId, timestamp) {
    // wait for all requests before timestamp to complete
    let toWait = this.requestQueue.filter(r => r.timestamp <= timestamp);
    await Promise.all(toWait.map(r => r.promise));
    
    return this.answerLookup[questionId];
  }

  _processQuestion(questionData) {
    // we have the following format for questions:
    // {
    //   id: number,
    //   style: "open",
    //   feedback: string, (answer)
    //   feedbackWrong: string, (hint)
    //   sub_challenges: questionData[]
    // ...
    //}
    // and for multiple choice:
    // {
    //   id: number,
    //   style: "mc",
    //   answers: {id, answer: choice text, response: explanation, right_answer: (0 or 1)}[]
    //   ...
    //   sub_challenges: questionData[]
    // }
    let id = questionData.id;
    let other = []
    if (questionData.sub_challenges && questionData.sub_challenges.length > 0) {
      other = questionData.sub_challenges.map(subQ => this._processQuestion(subQ))
    }
      
    if (questionData.style === "open") {
      let data = {
        id, type: "open", hint: questionData.feedbackWrong, answer: questionData.feedback
      }

      return [data, ...other];
    } else if (questionData.style === "mc") {
      let data = {
        id, type: "mc", choices: questionData.answers.map(ans => ({
          id: ans.id,
          answer: ans.answer,
          explanation: ans.response,
          isCorrect: ans.right_answer === 1
        }))
      }
      return [data, ...other];
    }
    throw new Error("Unknown question style: " + questionData.style);
  }
}
AnswerTracker.HEADER_SET = new Set(Object.keys(AnswerTracker.HEADER_OVERRIDE).map(key => key.toLowerCase()))

let answerTracker = new AnswerTracker();
