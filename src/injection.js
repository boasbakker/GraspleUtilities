// src/injection.js - Main button injection trigger logic

// Dependencies: helpers.js (BUTTON_CONTAINER_ID), buttons/copyButton.js, buttons/aiButtons.js

/**
 * Checks if buttons should be injected and performs the injection.
 */
function runInjectionCheck() {
    // Check if our buttons are already injected. If so, do nothing.
    if (document.getElementById(BUTTON_CONTAINER_ID)) {
        return;
    }

    // Find the target element to inject the buttons into.
    const headerWrapper = document.querySelector('div.exercise-header-wrapper.d-flex.justify-content-between');
    if (!headerWrapper) {
        return; // Target not on page yet, wait for next DOM change.
    }

    const leftDiv = headerWrapper.querySelector('div.d-flex.align-items-center');
    if (!leftDiv) {
        return; // Target's child not ready yet.
    }

    // Create a container for our buttons with the unique ID.
    const buttonContainer = document.createElement('span');
    buttonContainer.id = BUTTON_CONTAINER_ID;

    // Add buttons to the container.
    // Assumes creation functions are globally available
    buttonContainer.appendChild(createCopyButton());
    buttonContainer.appendChild(createAskChatGPTButton());
    buttonContainer.appendChild(createAskGeminiButton());

    // Add the container to the page.
    leftDiv.appendChild(buttonContainer);

    console.log('Grasple Tools: Buttons injected.');
}
