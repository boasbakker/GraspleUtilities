// popup2.js - Settings page for Grasple Utilities
// Handles persistent storage of user preferences

(function() {
  'use strict';

  // Cross-browser compatibility
  const hasBrowser = (typeof browser !== 'undefined');
  const hasChrome = (typeof chrome !== 'undefined');
  const api = hasBrowser ? browser : (hasChrome ? chrome : null);

  // Default configuration values
  const DEFAULT_CONFIG = {
    stripDecorative: false
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

  const stripDecorativeCheckbox = document.getElementById('stripDecorative');

  // Load saved settings on popup open
  async function loadSettings() {
    console.log('Loading settings...');
    const config = await configGet({ stripDecorative: false });
    console.log('Loaded config:', config);
    if (stripDecorativeCheckbox) {
      stripDecorativeCheckbox.checked = config.stripDecorative;
      console.log('Checkbox set to:', config.stripDecorative);
    } else {
      console.error('Checkbox element not found!');
    }
  }

  // Save settings when checkbox changes
  async function saveSettings() {
    const value = stripDecorativeCheckbox.checked;
    console.log('Saving stripDecorative:', value);
    await configSet({
      stripDecorative: value
    });
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
    // Load settings when popup opens
    loadSettings();

    // Save settings when checkbox changes
    if (stripDecorativeCheckbox) {
      stripDecorativeCheckbox.addEventListener('change', saveSettings);
      console.log('Event listener attached');
    } else {
      console.error('Could not attach event listener - checkbox not found');
    }
  }

})();
