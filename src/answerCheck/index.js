// src/answerCheck/index.js - Main answer check injection orchestrator

// Dependencies: config.js, buttons.js

// =========================================================================
// ANSWER CHECKING FEATURE
// =========================================================================

async function runAnswerCheckInjection() {
    // Check settings
    const config = await configGet({ showExplanationButtons: true, showAnswerButtons: true, showHintButtons: true });
    const showExplanation = config.showExplanationButtons !== false;
    const showAnswer = config.showAnswerButtons !== false;
    const showHint = config.showHintButtons !== false;

    // Initialize body class for MCQ answer toggling
    if (showAnswer) {
        document.body.classList.add('grasple-tools-show-answers');
    } else {
        document.body.classList.remove('grasple-tools-show-answers');
    }

    // 1. Find existing "Check" buttons
    {
        let checkBtns = Array.from(document.querySelectorAll('button[data-testid="check-answer-button"]'));

        // Fallback: check for text if testid not found
        if (checkBtns.length === 0) {
            const allButtons = Array.from(document.querySelectorAll('button, div[role="button"], a.btn'));
            checkBtns = allButtons.filter(b => {
                const txt = b.textContent.trim().toLowerCase();
                return (txt.includes('check') || txt.includes('controleer'));
            });
        }

        checkBtns.forEach(originalCheckBtn => {
            // Check if processed, BUT also check if our injected buttons are actually still there
            // Sometimes the parent container content is wiped (removing our buttons) but the check button remains
            const parent = originalCheckBtn.parentNode;
            const buttonsMissing = !parent.querySelector('.grasple-show-hint-btn') && !parent.querySelector('.grasple-explanation-btn');

            // FAILSAFE: detection for "stuck" hidden state
            // If feedback is GONE (or hidden), but buttons are marked hidden, unhide them.
            // 1. Find the broader container (question wrapper) to ensure we see feedback even if it's a sibling of answer-field
            const container = parent.closest('grapp-question') || parent.closest('.question-wrapper') || parent.closest('grapp-question-answer-field') || document.body;

            // 2. Check for visible feedback
            const feedbackEls = Array.from(container.querySelectorAll('grapp-question-feedback, [data-testid="question-feedback"], .question-feedback'));
            const isFeedbackVisible = feedbackEls.some(el => {
                // Check if element is visible
                return el.offsetParent !== null && window.getComputedStyle(el).display !== 'none';
            });

            if (!isFeedbackVisible) {
                const hiddenButtons = parent.querySelectorAll('.grasple-hidden-by-feedback');
                if (hiddenButtons.length > 0) {
                    console.log('Grasple Tools: Found stuck hidden buttons without visible feedback. Unhiding...');
                    hiddenButtons.forEach(btn => btn.classList.remove('grasple-hidden-by-feedback'));
                }
                // Also check for inline style hiding (legacy)
                if (parent.querySelector('.grasple-show-hint-btn[style*="display: none"]')) {
                    parent.querySelectorAll('.grasple-show-hint-btn, .grasple-explanation-btn').forEach(btn => {
                        if (btn.style.display === 'none') {
                            // Reset inline display style
                            btn.style.display = '';
                        }
                    });
                }
            }

            if (originalCheckBtn.hasAttribute('data-grasple-tools-processed')) {
                if (buttonsMissing) {
                    // Processed but buttons are gone - reset!
                    console.log('Grasple Tools: Check button processed but buttons missing. Re-injecting...');
                    originalCheckBtn.removeAttribute('data-grasple-tools-processed');
                } else {
                    return; // Truly processed and present
                }
            }

            console.log('Grasple Tools: Found Check button. Injecting buttons...');

            originalCheckBtn.setAttribute('data-grasple-tools-processed', 'true');



            // Insert hint button
            const hintBtn = createShowHintButton(originalCheckBtn.className);
            if (!showHint) hintBtn.style.display = 'none';
            parent.insertBefore(hintBtn, originalCheckBtn);

            // Insert explanation button
            const explainBtn = createExplanationButton(originalCheckBtn.className);
            if (!showExplanation) explainBtn.style.display = 'none';
            parent.insertBefore(explainBtn, originalCheckBtn);

            // Check if we have a stored correct answer for THIS specific challenge
            // Find challenge ID by traversing up from the button to find the containing question
            let challengeId = null;

            // Walk up the DOM tree to find the nearest container with a question header
            let currentEl = originalCheckBtn;
            let header = null;
            while (currentEl && currentEl !== document.body) {
                currentEl = currentEl.parentElement;
                if (currentEl) {
                    header = currentEl.querySelector('[id^="question-header-"]');
                    if (header) {
                        console.log('Grasple Tools DEBUG: Found header in ancestor:', currentEl.tagName, '→', header.id);
                        break;
                    }
                }
            }

            if (header) {
                const match = header.id.match(/question-header-(\d+)/);
                if (match) challengeId = match[1];
            }

            // Strategy 2: Look for parent with id (fallback)
            if (!challengeId) {
                const challengeEl = originalCheckBtn.closest('[id^="challenge-"]');
                console.log('Grasple Tools DEBUG: Fallback challenge element:', challengeEl?.id);
                if (challengeEl) {
                    const match = challengeEl.getAttribute('id').match(/challenge-(\d+)/);
                    if (match) challengeId = match[1];
                }
            }

            console.log('Grasple Tools DEBUG: Extracted challengeId:', challengeId);
            console.log('Grasple Tools DEBUG: Stored answers:', JSON.stringify(Object.keys(window.graspleCorrectAnswers || {})));

            // Fallback: use 'latest' if single question mode and no ID found

            let storedAnswer = null;
            if (challengeId && window.graspleCorrectAnswers && window.graspleCorrectAnswers[challengeId]) {
                storedAnswer = window.graspleCorrectAnswers[challengeId];
                console.log('Grasple Tools DEBUG: Found answer by ID');
            } else if (!challengeId && window.graspleCorrectAnswers && Object.keys(window.graspleCorrectAnswers).length >= 1 && window.graspleCorrectAnswers['latest']) {
                // If we couldn't find an ID but there's a latest answer stored, use it as fallback
                storedAnswer = window.graspleCorrectAnswers['latest'];
                console.log('Grasple Tools DEBUG: Using latest answer as fallback');
            } else {
                console.log('Grasple Tools DEBUG: No matching answer found');
            }

            if (storedAnswer) {
                const correctBtn = createCorrectAnswerButton(originalCheckBtn.className, storedAnswer);
                if (!showAnswer) correctBtn.style.display = 'none';
                // Verify not already injected
                if (!parent.querySelector('.grasple-correct-answer-btn')) {
                    parent.insertBefore(correctBtn, originalCheckBtn);
                    console.log('Grasple Tools: Injected View Correct Answer button for ID:', challengeId || 'latest');
                } else {
                    console.log('Grasple Tools DEBUG: Button already exists, skipping');
                }
            }
        });
    }

    // 1b. SEPARATE PASS for correct answer buttons on ALL check buttons
    // This runs independently because the answer might be stored AFTER the button was processed
    if (Object.keys(window.graspleCorrectAnswers || {}).length > 0) {
        let allCheckBtns = Array.from(document.querySelectorAll('button[data-testid="check-answer-button"]'));
        // Also try broader search
        if (allCheckBtns.length === 0) {
            allCheckBtns = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => {
                const txt = b.textContent.trim().toLowerCase();
                return (txt.includes('check') || txt.includes('controleer'));
            });
        }

        allCheckBtns.forEach(checkBtn => {
            const parent = checkBtn.parentNode;
            // Skip if button already exists
            if (parent.querySelector('.grasple-correct-answer-btn')) return;

            // Find challenge ID for this button
            let challengeId = null;
            let currentEl = checkBtn;
            let header = null;
            while (currentEl && currentEl !== document.body) {
                currentEl = currentEl.parentElement;
                if (currentEl) {
                    header = currentEl.querySelector('[id^="question-header-"]');
                    if (header) break;
                }
            }
            if (header) {
                const match = header.id.match(/question-header-(\d+)/);
                if (match) challengeId = match[1];
            }

            // Check for stored answer
            let storedAnswer = null;
            if (challengeId && window.graspleCorrectAnswers[challengeId]) {
                storedAnswer = window.graspleCorrectAnswers[challengeId];
            } else if (!challengeId && window.graspleCorrectAnswers['latest']) {
                storedAnswer = window.graspleCorrectAnswers['latest'];
            }

            if (storedAnswer) {
                const correctBtn = createCorrectAnswerButton(checkBtn.className, storedAnswer);
                if (!showAnswer) correctBtn.style.display = 'none';
                parent.insertBefore(correctBtn, checkBtn);
                console.log('Grasple Tools: Injected View Correct Answer button (late pass) for ID:', challengeId || 'latest');
            }
        });
    }

    // 2. Handle multiple choice questions (no Check button)
    // Look for grapp-multiple-choice elements that don't have our button yet
    const mcContainers = document.querySelectorAll('grapp-multiple-choice-single-answer, grapp-multiple-choice-multiple-answers, grapp-multiple-choice, grapp-challenge[data-challenge-type="multiple_choice"]');

    mcContainers.forEach(mcContainer => {
        // Check if already processed
        if (mcContainer.hasAttribute('data-grasple-mc-processed')) return;

        // Check if there's already a check button inside (then it's handled above)
        if (mcContainer.querySelector('button[data-testid="check-answer-button"]')) return;
        if (mcContainer.querySelector('.grasple-safe-check-btn') || mcContainer.querySelector('.grasple-show-answer-btn')) return;

        console.log('Grasple Tools: Found multiple choice container. Injecting buttons...');

        mcContainer.setAttribute('data-grasple-mc-processed', 'true');

        // Find a good place to insert - after the instruction text or at the end
        const instructionEl = mcContainer.querySelector('grapp-multiple-choice-answer-instruction');
        const fieldset = mcContainer.querySelector('fieldset');

        // Create a wrapper div
        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '10px';
        wrapper.style.padding = '10px 0';
        wrapper.classList.add('grasple-tools-button-wrapper');

        // Add explanation button
        const explainBtn = createExplanationButton('btn btn-warning');
        if (!showExplanation) explainBtn.style.display = 'none';
        wrapper.appendChild(explainBtn);

        // Add "Show Hint" button
        const hintBtn = createShowHintButton('btn btn-info');
        if (!showHint) hintBtn.style.display = 'none';
        wrapper.appendChild(hintBtn);

        // Add "Show Answer" button
        const answerBtn = createShowAnswerButton('btn btn-success');
        if (!showAnswer) answerBtn.style.display = 'none';
        wrapper.appendChild(answerBtn);

        // Insert after instruction element, or after fieldset, or at end of container
        if (instructionEl) {
            instructionEl.parentNode.insertBefore(wrapper, instructionEl.nextSibling);
        } else if (fieldset) {
            fieldset.parentNode.insertBefore(wrapper, fieldset.nextSibling);
        } else {
            mcContainer.appendChild(wrapper);
        }
    });
}
