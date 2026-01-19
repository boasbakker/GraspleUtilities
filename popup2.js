// popup2.js - Settings page for Grasple Utilities
// Handles persistent storage of user preferences

(function () {
  'use strict';

  // Cross-browser compatibility
  const hasBrowser = (typeof browser !== 'undefined');
  const hasChrome = (typeof chrome !== 'undefined');
  const api = hasBrowser ? browser : (hasChrome ? chrome : null);

  // Default configuration values
  const DEFAULT_CONFIG = {
    stripDecorative: false,
    aiPrompt: '',
    showExplanationButtons: true,
    showAnswerButtons: true
  };

  /**
   * Get configuration value(s) from storage
   */
  async function configGet(keys) {
    try {
      if (!api || !api.storage) {
        console.warn('Storage API not available');
        return typeof keys === 'string' ? DEFAULT_CONFIG[keys] : keys;
      }

      const storage = api.storage.sync || api.storage.local;
      if (!storage) {
        console.warn('No storage backend available');
        return typeof keys === 'string' ? DEFAULT_CONFIG[keys] : keys;
      }

      const keysObj = typeof keys === 'string'
        ? { [keys]: DEFAULT_CONFIG[keys] }
        : { ...DEFAULT_CONFIG, ...keys };

      if (hasBrowser) {
        const result = await storage.get(keysObj);
        return typeof keys === 'string' ? result[keys] : result;
      } else if (hasChrome) {
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
   */
  async function configSet(config) {
    try {
      if (!api || !api.storage) {
        console.warn('Storage API not available');
        return;
      }

      const storage = api.storage.sync || api.storage.local;
      if (!storage) {
        console.warn('No storage backend available');
        return;
      }

      if (hasBrowser) {
        await storage.set(config);
        console.log('Config saved:', config);
      } else if (hasChrome) {
        return new Promise((resolve) => {
          storage.set(config, () => {
            if (api.runtime && api.runtime.lastError) {
              console.error('Error saving config:', api.runtime.lastError);
              resolve();
              return;
            }
            console.log('Config saved:', config);
            resolve();
          });
        });
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  /**
   * Send message to content script to update buttons
   */
  async function notifyContentScript() {
    try {
      const tabs = await (hasBrowser ? browser.tabs.query({ active: true, currentWindow: true }) :
        new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve)));

      if (tabs && tabs[0]) {
        const message = {
          type: 'GRASPLE_SETTINGS_CHANGED',
          showExplanationButtons: showExplanationButtonsCheckbox?.checked ?? true,
          showAnswerButtons: showAnswerButtonsCheckbox?.checked ?? true
        };

        if (hasBrowser) {
          browser.tabs.sendMessage(tabs[0].id, message);
        } else {
          chrome.tabs.sendMessage(tabs[0].id, message);
        }
        console.log('Notified content script of settings change');
      }
    } catch (err) {
      console.log('Could not notify content script:', err);
    }
  }

  const stripDecorativeCheckbox = document.getElementById('stripDecorative');
  const aiPromptTextarea = document.getElementById('aiPrompt');
  const showExplanationButtonsCheckbox = document.getElementById('showExplanationButtons');
  const showAnswerButtonsCheckbox = document.getElementById('showAnswerButtons');

  // Load saved settings on popup open
  async function loadSettings() {
    console.log('Loading settings...');
    const config = await configGet(DEFAULT_CONFIG);
    console.log('Loaded config:', config);

    if (stripDecorativeCheckbox) {
      stripDecorativeCheckbox.checked = config.stripDecorative;
    }
    if (showExplanationButtonsCheckbox) {
      showExplanationButtonsCheckbox.checked = config.showExplanationButtons !== false;
    }
    if (showAnswerButtonsCheckbox) {
      showAnswerButtonsCheckbox.checked = config.showAnswerButtons !== false;
    }
    if (aiPromptTextarea) {
      aiPromptTextarea.value = config.aiPrompt || '';
    }
  }

  // Save settings when checkbox changes
  async function saveSettings() {
    const config = {
      stripDecorative: stripDecorativeCheckbox?.checked ?? false,
      aiPrompt: aiPromptTextarea?.value ?? '',
      showExplanationButtons: showExplanationButtonsCheckbox?.checked ?? true,
      showAnswerButtons: showAnswerButtonsCheckbox?.checked ?? true
    };

    await configSet(config);

    // Notify content script to update buttons immediately
    await notifyContentScript();

    console.log('Settings saved successfully');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    console.log('Initializing popup...');
    loadSettings();

    // Attach event listeners
    if (stripDecorativeCheckbox) {
      stripDecorativeCheckbox.addEventListener('change', saveSettings);
    }
    if (showExplanationButtonsCheckbox) {
      showExplanationButtonsCheckbox.addEventListener('change', saveSettings);
    }
    if (showAnswerButtonsCheckbox) {
      showAnswerButtonsCheckbox.addEventListener('change', saveSettings);
    }
    if (aiPromptTextarea) {
      let timeoutId;
      aiPromptTextarea.addEventListener('input', () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(saveSettings, 500);
      });
    }
  }

})();
