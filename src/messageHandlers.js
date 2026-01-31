// src/messageHandlers.js - Event listeners for interceptor messages and settings changes

// Dependencies: api.js, state.js

/**
 * Setup message listeners for interceptor data
 */
function setupMessageListeners() {
    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data) return;

        if (event.data.type === 'GRASPLE_CHALLENGE_INFO') {
            const { payload } = event.data;
            const challengeObj = payload.data.challenge || payload.data;
            if (challengeObj && challengeObj.id) {
                // Add to map
                window.graspleChallenges[challengeObj.id] = payload;

                // Also store sub_challenges (MCQs) by their ID
                if (challengeObj.sub_challenges && challengeObj.sub_challenges.length > 0) {
                    challengeObj.sub_challenges.forEach(subChallenge => {
                        if (subChallenge.id) {
                            // Wrap in same structure as main challenges
                            window.graspleChallenges[subChallenge.id] = {
                                data: { challenge: subChallenge },
                                url: payload.url,
                                c_hash_from_url: payload.c_hash_from_url,
                                parent_id: challengeObj.id
                            };
                            console.log('Grasple Tools: Captured sub_challenge (MCQ)', subChallenge.id);
                        }
                    });
                }

                // Add to ordered list if not already present (dedupe by ID)
                const exists = window.graspleChallengesList.find(c => {
                    const cObj = c.data.challenge || c.data;
                    return cObj.id === challengeObj.id;
                });
                if (!exists) {
                    window.graspleChallengesList.push(payload);
                    console.log('Grasple Tools: Captured VALID challenge (Ordered)', challengeObj.id);
                }
            }
        }
        if (event.data.type === 'GRASPLE_SESSION_DATA') {
            window.graspleSessionData = event.data.payload;
        }
        if (event.data.type === 'GRASPLE_AUTH_TOKEN') {
            window.graspleAuthToken = event.data.token;
        }
        if (event.data.type === 'GRASPLE_CHECK_ANSWER_RESPONSE') {
            const payload = event.data.payload;
            const url = event.data.url;
            console.log('Grasple Tools: Storing check-answer response', payload, 'URL:', url);

            // Extract challenge ID from the URL: /challenges/XXXXX/check-answer
            let challengeId = 'latest';
            if (url) {
                // Updated regex to handle optional version segment (e.g. /61582/31/check-answer)
                const match = url.match(/\/challenges\/(\d+)(?:\/[^\/]+)?\/check-answer/);
                if (match) {
                    challengeId = match[1];
                }
            }
            console.log('Grasple Tools: Extracted challenge ID from URL:', challengeId);

            // Store the correct answer for later button injection
            if (payload.correct_answer) {
                window.graspleCorrectAnswers[challengeId] = payload.correct_answer;
                // Also store as 'latest' for fallback matching
                console.log('Grasple Tools: Stored correct answer for challenge', challengeId);

                // Trigger re-injection to show the button immediately
                if (typeof runAnswerCheckInjection === 'function') {
                    runAnswerCheckInjection();
                }
            }
        }
        if (event.data.type === 'GRASPLE_URL_CHANGED') {
            console.log('Grasple Tools: URL changed - Clearing stored correct answers');
            // Clear all stored answers to prevent leakage across questions
            window.graspleCorrectAnswers = {};
            // DO NOT clear challenge map, as we might return to same challenge? 
            // Actually, keep challenge map but clear answers.
            // also clear 'latest'
            // window.graspleCorrectAnswers['latest'] = null; // Handled by reassignment above
        }
    });
}

/**
 * Setup listener for settings changes from popup to show/hide buttons immediately
 */
function setupSettingsListener() {
    if (typeof api !== 'undefined' && api.runtime && api.runtime.onMessage) {
        api.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'GRASPLE_SETTINGS_CHANGED') {
                console.log('Grasple Tools: Settings changed', message);

                // Show/hide explanation buttons
                const explanationBtns = document.querySelectorAll('.grasple-safe-check-btn');
                explanationBtns.forEach(btn => {
                    btn.style.display = message.showExplanationButtons ? '' : 'none';
                });

                // Show/hide answer buttons (MCQ + Input)
                const answerBtns = document.querySelectorAll('.grasple-show-answer-btn, .grasple-correct-answer-btn');
                answerBtns.forEach(btn => {
                    btn.style.display = message.showAnswerButtons ? '' : 'none';
                });

                // Show/hide hint buttons
                const hintBtns = document.querySelectorAll('.grasple-show-hint-btn');
                hintBtns.forEach(btn => {
                    btn.style.display = message.showHintButtons ? '' : 'none';
                });

                // Show/hide injected content fields
                // 1. Explanations
                const explanationFields = document.querySelectorAll('.grasple-tools-injected-feedback');
                explanationFields.forEach(el => {
                    el.style.display = message.showExplanationButtons ? '' : 'none';
                });

                // 2. Answers
                const answerFields = document.querySelectorAll('.grasple-tools-correct-answer-display');
                answerFields.forEach(el => {
                    el.style.display = message.showAnswerButtons ? '' : 'none';
                });

                // 3. Hints
                const hintFields = document.querySelectorAll('.grasple-tools-injected-hint');
                hintFields.forEach(el => {
                    el.style.display = message.showHintButtons ? '' : 'none';
                });

                // 4. MCQ Answers Highlighting
                if (message.showAnswerButtons) {
                    document.body.classList.add('grasple-tools-show-answers');
                } else {
                    document.body.classList.remove('grasple-tools-show-answers');
                }
            }
        });
    }
}
