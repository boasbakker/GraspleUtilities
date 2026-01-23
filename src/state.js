// src/state.js - Global state initialization

/**
 * Initialize global state on the window object.
 * This stores captured challenge data from the interceptor.
 */
function initializeState() {
    // Store data globally
    window.graspleChallenges = {}; // Map by ID
    window.graspleChallengesList = []; // Ordered list
    window.graspleSessionData = null;
    window.graspleAuthToken = null;
    window.graspleCorrectAnswers = {}; // Store correct answers by challenge ID for button injection
}
