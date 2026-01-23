# Developer Documentation

This document explains the technical architecture of the Grasple Utilities extension.

## Architecture Overview

The extension uses a "split content script" architecture to ensure compatibility with both Chrome and Firefox (MV3). Instead of using a bundler (webpack/vite) or ES6 modules (which have limited support in Firefox content scripts), the code is split into multiple independent JS files.

These files are loaded sequentially by the browser as specified in `manifest.json`. Order matters because later scripts depend on functions/variables defined in earlier ones.

## File Structure & Responsibilities

The source code is located in the `src/` directory.

### 1. Core Infrastructure (Load First)

- **`src/api.js`**: Handles cross-browser API compatibility. Detects if running in Chrome (`chrome.*`) or Firefox (`browser.*`) and exports a unified `api` object.
- **`src/state.js`**: Initializes the global state objects (`window.graspleChallenges`, `window.graspleCorrectAnswers`, etc.) used to share data between modules.
- **`src/config.js`**: Manages persistent user settings (e.g., stripping decorative LaTeX, custom AI prompts) using the `storage` API.
- **`src/helpers.js`**: Contains shared utility functions, such as `getMathFieldValuesInElement` (for extracting user input) and context checks (`shouldRunInThisContext`).

### 2. Feature: Data Capture & Interception

This features allows the extension to "see" the hidden data (answers, explanations) sent by the server.

- **`src/interceptor.js`**: Injects the external `interceptor.js` script into the page context. This external script hooks into `XMLHttpRequest` / `fetch` to capture traffic.
- **`src/messageHandlers.js`**: Listens for `window.postMessage` events sent by the interceptor. Parses challenge data and stores it in the global state (initialized in `state.js`).

### 3. Feature: Text Extraction

- **`src/extraction.js`**: Logic for DOM traversal to extract question text and LaTeX math. Handles cleaning up LaTeX code and formatting specific Grasple elements.

### 4. Feature: Buttons & UI Injection

- **`src/injection.js`**: The main entry point for injecting the "Header" buttons (Copy, Ask AI). Checks if buttons exist and injects them if missing.
- **`src/buttons/copyButton.js`**: Factory function for the "Copy Question" button.
- **`src/buttons/aiButtons.js`**: Factory functions for "Ask ChatGPT" and "Ask Gemini" buttons.

### 5. Feature: Answer Checking & Hints

This feature adds buttons to view hints, explanations, and answers without submitting.

- **`src/answerCheck/index.js`**: The main orchestrator. Scans the DOM for "Check" buttons or MCQ containers and injects the "Show Hint/Explanation" buttons next to them.
- **`src/answerCheck/buttons.js`**: Factory functions for creating the specific UI buttons (Hint, Explain, Show Answer).
- **`src/answerCheck/handlers.js`**: variable-heavy logic that handles clicks. It finds the correct challenge data for the clicked button (matching via ID, index, or content) and prepares the content to display.
- **`src/answerCheck/infoBox.js`**: Utility to create the standardized "Info Box" UI component (the colored boxes with feedback). Handles Markdown/LaTeX rendering within these boxes.
- **`src/answerCheck/feedback.js`**: Legacy functions for displaying static feedback text.

### 6. Logic & Orchestration (Load Last)

- **`src/styles.js`**: Injects custom CSS rules into the page document (e.g., for highlighting correct MCQ answers).
- **`src/observer.js`**: Sets up a `MutationObserver`. This watches for DOM changes (navigation, dynamic content loading) and triggers re-injection of buttons (`runInjectionCheck`, `runAnswerCheckInjection`) as needed. It also manages hiding injected content when native feedback appears.
- **`src/main.js`**: The entry point script. It calls the initialization functions of all the above modules in the correct order.

## Dependency Graph

The `manifest.json` load order reflects this dependency chain:

1. `api.js` (No deps)
2. `state.js` (No deps)
3. `config.js` (Depends on `api`)
4. `helpers.js` (No deps)
5. `interceptor.js` (Depends on `api`)
6. `messageHandlers.js` (Depends on `state`)
7. `extraction.js` (Depends on `config`, `helpers`)
8. `buttons/*.js` (Depends on `config`, `extraction`)
9. `injection.js` (Depends on `helpers`, `buttons/*`)
10. `answerCheck/*` (Depends on `config`, `state`, `buttons`, `handlers`)
11. `styles.js` (No deps)
12. `observer.js` (Depends on `injection`, `answerCheck`)
13. `main.js` (Depends on ALL above)
