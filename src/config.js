// src/config.js - Configuration storage functions

// Dependencies: api.js

// Default configuration values
const DEFAULT_CONFIG = {
    stripDecorative: false,
    aiPrompt: '',
    autoFetchDelay: 50
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
                    // ...
                });
            });
        }
    } catch (err) {
        console.error('Failed to save config:', err);
    }
}
