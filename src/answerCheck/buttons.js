// src/answerCheck/buttons.js - Answer check button factories

// Dependencies: handlers.js (showCorrectAnswer, showHint, showExplanation, showCorrectAnswerFromResponse, fetchCorrectAnswer)


// Helper function to create the Show Answer button for MCQs
function createShowAnswerButton(baseClassName) {
    const answerBtn = document.createElement('button');
    answerBtn.innerHTML = '<span>Show Answer</span>';
    answerBtn.className = baseClassName;
    answerBtn.classList.add('grasple-show-answer-btn');

    answerBtn.style.color = '#fff';
    answerBtn.style.backgroundColor = '#28a745';
    answerBtn.style.borderColor = '#28a745';
    answerBtn.style.marginRight = '10px';
    // Fix visual disabled state
    answerBtn.style.cursor = 'pointer';
    answerBtn.style.opacity = '1';
    answerBtn.style.pointerEvents = 'auto';

    answerBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await showCorrectAnswer(answerBtn);
    });

    return answerBtn;
}

// Helper to create the View Correct Answer button
function createCorrectAnswerButton(baseClassName, correctAnswerData) {
    const correctBtn = document.createElement('button');
    correctBtn.innerHTML = '<span>View Correct Answer</span>';
    correctBtn.className = baseClassName;
    correctBtn.classList.add('grasple-correct-answer-btn');

    correctBtn.style.color = '#fff';
    correctBtn.style.backgroundColor = '#28a745'; // green (same as Show Answer)
    correctBtn.style.borderColor = '#28a745';
    correctBtn.style.marginRight = '10px';
    // Fix visual disabled state
    correctBtn.style.cursor = 'pointer';
    correctBtn.style.opacity = '1';
    correctBtn.style.pointerEvents = 'auto';

    // Store the correct answer data on the button
    correctBtn.dataset.correctAnswer = JSON.stringify(correctAnswerData);

    correctBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Container is closest feedback parent or fieldset
        const container = correctBtn.closest('grapp-question-answer-field') || correctBtn.parentNode;
        showCorrectAnswerFromResponse(correctBtn, container);
    });

    return correctBtn;
}

// Helper fetch answer button
function createFetchAnswerButton(baseClassName) {
    const fetchBtn = document.createElement('button');
    fetchBtn.innerHTML = '<span>Get Correct Answer</span>';
    fetchBtn.className = baseClassName;
    fetchBtn.classList.add('grasple-fetch-answer-btn');

    // Distinct color (e.g., Purple or similar to Hint but darker)
    fetchBtn.style.color = '#fff';
    fetchBtn.style.backgroundColor = '#6f42c1'; // Purple
    fetchBtn.style.borderColor = '#6f42c1';
    fetchBtn.style.marginRight = '10px';

    // Fix visual disabled state
    fetchBtn.style.cursor = 'pointer';
    fetchBtn.style.opacity = '1';
    fetchBtn.style.pointerEvents = 'auto';

    fetchBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await fetchCorrectAnswer(fetchBtn);
    });

    return fetchBtn;
}

// Helper function to create the Show Hint button
function createShowHintButton(baseClassName) {
    const hintBtn = document.createElement('button');
    hintBtn.innerHTML = '<span>Show Hint</span>';
    hintBtn.className = baseClassName;
    hintBtn.classList.add('grasple-show-hint-btn');

    hintBtn.style.color = '#fff';
    hintBtn.style.backgroundColor = '#17a2b8'; // info blue
    hintBtn.style.borderColor = '#17a2b8';
    hintBtn.style.marginRight = '10px';
    // Fix visual disabled state
    hintBtn.style.cursor = 'pointer';
    hintBtn.style.opacity = '1';
    hintBtn.style.pointerEvents = 'auto';

    hintBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await showHint(hintBtn);
    });

    return hintBtn;
}

// Helper function to create the View Explanation button
function createExplanationButton(baseClassName) {
    const explainBtn = document.createElement('button');
    explainBtn.innerHTML = '<span>View Explanation</span>';
    explainBtn.className = baseClassName;

    // Add MARKER CLASS for index finding logic
    explainBtn.classList.add('grasple-safe-check-btn');
    explainBtn.classList.add('grasple-explanation-btn'); // Standardize class name

    explainBtn.classList.remove('disabled');
    explainBtn.removeAttribute('disabled');
    explainBtn.removeAttribute('aria-disabled');

    // Style it differently (Orange/Warning)
    if (explainBtn.classList.contains('btn-outline-primary')) {
        explainBtn.classList.remove('btn-outline-primary');
        explainBtn.classList.add('btn-outline-warning');
        if (!document.querySelector('.btn-outline-warning')) {
            explainBtn.classList.add('btn-warning');
        }
    } else if (explainBtn.classList.contains('btn-primary')) {
        explainBtn.classList.remove('btn-primary');
        explainBtn.classList.add('btn-warning');
    } else {
        explainBtn.classList.add('btn-warning');
    }

    explainBtn.style.color = '#000';
    explainBtn.style.backgroundColor = '#ffc107';
    explainBtn.style.borderColor = '#ffc107';
    explainBtn.style.marginRight = '10px';
    // Fix visual disabled state
    explainBtn.style.cursor = 'pointer';
    explainBtn.style.opacity = '1';
    explainBtn.style.pointerEvents = 'auto';

    explainBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await showExplanation(explainBtn);
    });

    return explainBtn;
}
