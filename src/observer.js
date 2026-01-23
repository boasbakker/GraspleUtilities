// src/observer.js - MutationObserver setup for DOM changes

// Dependencies: injection.js (runInjectionCheck), answerCheck/index.js (runAnswerCheckInjection)

/**
 * Setup MutationObserver to watch for page changes
 */
function setupObserver() {
    // Set up the MutationObserver to watch for page changes.
    const observer = new MutationObserver((mutations) => {
        // For any change, run our injection check.
        if (typeof runInjectionCheck === 'function') runInjectionCheck();
        if (typeof runAnswerCheckInjection === 'function') runAnswerCheckInjection();

        // Check if native feedback appeared - hide our injected explanations
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === 1) { // Element node
                    // Skip if this is our own injected element
                    if (node.classList?.contains('grasple-tools-injected-feedback') ||
                        node.classList?.contains('grasple-tools-injected-hint') ||
                        node.classList?.contains('grasple-tools-info-box') ||
                        node.closest?.('.grasple-tools-info-box')) {
                        continue;
                    }

                    // Check if native feedback was added (grapp-question-feedback or section with question-feedback class)
                    // Skip if this is our own injected element
                    if (node.classList?.contains('grasple-tools-injected-feedback') ||
                        node.classList?.contains('grasple-tools-injected-hint') ||
                        node.classList?.contains('grasple-tools-info-box') ||
                        node.closest?.('.grasple-tools-info-box')) {
                        continue;
                    }

                    // Check if native feedback was added (grapp-question-feedback or section with question-feedback class)
                    let nativeFeedback = node.matches && node.matches('grapp-question-feedback, [data-testid="question-feedback"], .question-feedback')
                        ? node
                        : node.querySelector && node.querySelector('grapp-question-feedback, [data-testid="question-feedback"], .question-feedback');

                    // Make sure it's not inside our injected element
                    if (nativeFeedback && (
                        nativeFeedback.closest('.grasple-tools-injected-feedback') ||
                        nativeFeedback.closest('.grasple-tools-injected-hint') ||
                        nativeFeedback.closest('.grasple-tools-info-box')
                    )) {
                        nativeFeedback = null;
                    }

                    if (nativeFeedback) {
                        // Find the parent question wrapper
                        const questionWrapper = nativeFeedback.closest('grapp-question.question-wrapper') ||
                            nativeFeedback.closest('grapp-question');
                        const answerContainer = nativeFeedback.closest('grapp-multiple-choice-single-answer') ||
                            nativeFeedback.closest('grapp-multiple-choice-multiple-answers') ||
                            nativeFeedback.closest('grapp-multiple-choice') ||
                            nativeFeedback.closest('grapp-question-answer-field');

                        const container = questionWrapper || answerContainer;

                        if (container) {
                            // Hide injected explanation and hint on ANY native feedback
                            const injectedFeedback = container.querySelector('.grasple-tools-injected-feedback');
                            if (injectedFeedback) injectedFeedback.style.display = 'none';

                            const injectedHint = container.querySelector('.grasple-tools-injected-hint');
                            if (injectedHint) injectedHint.style.display = 'none';

                            const hintBtn = container.querySelector('.grasple-show-hint-btn');
                            if (hintBtn) hintBtn.classList.add('grasple-hidden-by-feedback');

                            // Hide "View Correct Answer" button if feedback is CORRECT
                            // User specified: <section class="question-feedback question-feedback--correct"> inside the feedback
                            const isCorrect = nativeFeedback.matches('.question-feedback--correct') ||
                                nativeFeedback.querySelector('.question-feedback--correct');

                            if (isCorrect) {
                                // Hide ALL injected buttons
                                const buttons = container.querySelectorAll('.grasple-show-hint-btn, .grasple-explanation-btn, .grasple-correct-answer-btn, .grasple-show-answer-btn, .grasple-safe-check-btn');
                                buttons.forEach(btn => btn.classList.add('grasple-hidden-by-feedback'));

                                // Hide ALL injected content boxes
                                const boxes = container.querySelectorAll('.grasple-tools-injected-hint, .grasple-tools-injected-feedback, .grasple-tools-correct-answer-display');
                                boxes.forEach(box => box.style.display = 'none');

                                console.log('Grasple Tools: Hid all injected tools because answer is correct');
                            } else {
                                if (injectedFeedback || injectedHint || hintBtn) {
                                    console.log('Grasple Tools: Hid hint/explanation because native feedback appeared');
                                }
                            }
                        }
                    }
                }
            } // end addedNodes loop


        }
    });


    // Start observing the entire body for changes in the element tree.
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    return observer;
}
