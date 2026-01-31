// src/answerCheck/handlers.js - Button click handlers and display logic

// Dependencies: infoBox.js (createInfoBox, closeOtherBoxes)

// Show the correct answer from check-answer response
function showCorrectAnswerFromResponse(btn, container) {
    let correctAnswerObj;
    try {
        correctAnswerObj = JSON.parse(btn.dataset.correctAnswer);
    } catch (e) {
        alert('Could not parse correct answer data.');
        return;
    }

    // Extract the answer field
    let answerValue = correctAnswerObj.answer;

    if (!answerValue) {
        alert('No answer found in correct_answer object.');
        return;
    }

    // Format the correct answer for display
    let answerHtml = '';

    // Check if the answer is a JSON string (multiple fields case)
    if (typeof answerValue === 'string' && answerValue.startsWith('{')) {
        try {
            const multiAnswers = JSON.parse(answerValue);
            // Multiple fields - display each
            answerHtml = '<div style="font-size: 1.1em;">';
            let fieldNum = 1;
            for (const [key, value] of Object.entries(multiAnswers)) {
                // Clean up key name (student.answer2 -> Field 1)
                const fieldLabel = 'Field ' + fieldNum;
                answerHtml += '<p style="margin: 0.5em 0;"><strong>' + fieldLabel + ':</strong> <code style="font-size: 1.2em; background: #fff; padding: 2px 6px; border-radius: 3px;">' + value + '</code></p>';
                fieldNum++;
            }
            answerHtml += '</div>';
        } catch (e) {
            // Not valid JSON, treat as simple string
            answerHtml = '<p style="font-size: 1.2em;"><strong>Answer:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">' + answerValue + '</code></p>';
        }
    } else {
        // Simple single answer
        answerHtml = '<p style="font-size: 1.2em;"><strong>Answer:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">' + answerValue + '</code></p>';
    }

    // Toggle logic: if already visible, hide it
    const existing = container.querySelector('.grasple-tools-correct-answer-display');
    if (existing) {
        existing.remove();
        return;
    }

    // Toggle logic: Close other boxes (Exclusive Mode)
    closeOtherBoxes(container);

    // Use createInfoBox to display
    createInfoBox({
        container: container,
        className: 'grasple-tools-correct-answer-display',
        title: 'Correct Answer',
        backgroundColor: '#d4edda', // lighter green
        borderColor: '#c3e6cb',
        titleColor: '#155724',
        content: answerHtml
    });

    console.log('Grasple Tools: Displayed correct answer from check-answer response');
}

// Fetch correct answer for input questions
async function fetchCorrectAnswer(btnOrElement, silent = false, explicitChallengeId = null) {
    const btn = btnOrElement;
    const challengesMap = window.graspleChallenges || {};

    // Find challenge ID using existing logic (similar to showExplanation)
    const questionWrapper = btn.closest('grapp-question.question-wrapper') || btn.closest('grapp-question');
    const container = questionWrapper || btn.closest('grapp-challenge') || document.body;

    let challengeId = explicitChallengeId;

    // Strategy 0: Header ID
    if (!challengeId && questionWrapper) {
        const header = questionWrapper.querySelector('[id^="question-header-"]');
        if (header) {
            const match = header.id.match(/question-header-(\d+)/);
            if (match) challengeId = match[1];
        }
    }

    // Strategy 1: Fieldset ID Match
    if (!challengeId) {
        const fieldset = container.querySelector('fieldset[id^="question-answer-input-"]');
        if (fieldset && fieldset.id) {
            const match = fieldset.id.match(/question-answer-input-(\d+)/);
            if (match) challengeId = match[1];
        }
    }

    if (!challengeId) {
        // Try falling back to challenge object in map if we have only one
        const keys = Object.keys(challengesMap);
        if (keys.length === 1) challengeId = keys[0];
    }

    if (!challengeId || !challengesMap[challengeId]) {
        if (!silent) alert('Could not identify challenge. Try refreshing.');
        return;
    }

    const challengeInfo = challengesMap[challengeId];
    const challengeObj = challengeInfo.data.challenge || challengeInfo.data;

    // Extract answer field references from challenge's answer_input_template
    // The template contains elements like: <answer-field ref="student.answer1" .../>
    // We need to extract all ref values and build a JSON object
    const answerFields = extractAnswerFieldRefs(challengeObj);
    console.log('Grasple Tools: Extracted answer fields:', answerFields);

    // Build the properly formatted answer payload
    // Grasple expects: {"student.answer1":"\\", "student.answer1.1":"\\", ...}
    const answerObject = {};
    const dummyAnswer = "\\\\"; // Escaped backslash that triggers parse error but returns correct answer

    if (answerFields.length > 0) {
        answerFields.forEach(fieldRef => {
            answerObject[fieldRef] = dummyAnswer;
        });
    } else {
        // Fallback: use default field name
        answerObject["student.answer1"] = dummyAnswer;
    }

    // The answer must be stringified JSON
    const answerString = JSON.stringify(answerObject);
    console.log('Grasple Tools: Constructed answer payload:', answerString);

    // Get the base API URL from captured challenge info
    let baseApiUrl = challengeInfo.url;
    if (!baseApiUrl) {
        if (!silent) alert('Original request URL missing. Cannot fetch.');
        return;
    }

    // Remove query params
    baseApiUrl = baseApiUrl.split('?')[0];

    // Use the `c_hash` from captured info
    const cHash = challengeInfo.c_hash_from_url || "4";

    let sessionId = 0;
    if (window.graspleSessionData && window.graspleSessionData.id) {
        sessionId = window.graspleSessionData.id;
    }

    // Append /check-answer to URL if needed
    let fetchUrl = baseApiUrl;
    if (!fetchUrl.endsWith('/check-answer')) {
        fetchUrl = fetchUrl.replace(/\/$/, '') + '/check-answer';
    }

    const payload = {
        "answer": answerString,
        "c_hash": cHash,
        "challenge_session_id": sessionId
    };

    // Change button state
    if (!silent && btn && btn.tagName === 'BUTTON') {
        btn.innerHTML = '<span>Fetching...</span>';
        btn.disabled = true;
    }

    // Send message to interceptor to perform fetch
    window.postMessage({
        type: 'GRASPLE_FETCH_ANSWER',
        url: fetchUrl,
        payload: payload
    }, '*');

    // The interceptor will send the request. 
    // The response will be captured by the SAME interceptor logic that catches normal check-answers.
    // That logic emits GRASPLE_CHECK_ANSWER_RESPONSE.
    // messageHandlers.js listens to that and updates state.
    // validation/injection loop updates the UI.
}

// Helper function to extract answer field references from challenge template
// Note: Only extracts from the specific challenge's template, not sub_challenges
// (sub_challenges are registered separately and fetched with their own requests)
function extractAnswerFieldRefs(challengeObj) {
    const fields = [];

    // Only check the specific challenge's answer_input_template
    // (Do NOT include sub_challenges - they have their own entries in graspleChallenges)
    if (challengeObj.answer_input_template) {
        const mainFields = parseAnswerFieldRefs(challengeObj.answer_input_template);
        fields.push(...mainFields);
    }

    return fields;
}

// Parse answer-field refs from template HTML
function parseAnswerFieldRefs(template) {
    const fields = [];
    // Match <answer-field ref="student.answer1" .../> patterns
    const regex = /<answer-field[^>]+ref=["']([^"']+)["'][^>]*\/?>/gi;
    let match;
    while ((match = regex.exec(template)) !== null) {
        if (match[1] && !fields.includes(match[1])) {
            fields.push(match[1]);
        }
    }
    return fields;
}

// Show hint for questions
async function showHint(btn) {
    const challengesMap = window.graspleChallenges || {};
    const challengesList = window.graspleChallengesList || [];

    // Find the question wrapper
    const questionWrapper = btn.closest('grapp-question.question-wrapper') ||
        btn.closest('grapp-question');
    const answerContainer = btn.closest('grapp-multiple-choice-single-answer') ||
        btn.closest('grapp-multiple-choice-multiple-answers') ||
        btn.closest('grapp-multiple-choice') ||
        btn.closest('grapp-question-answer-field');

    const container = questionWrapper || answerContainer ||
        btn.closest('grapp-challenge') ||
        document.body;

    const searchRoot = questionWrapper || answerContainer || container;

    // Find challenge using similar matching logic as showExplanation
    let challengeInfo = null;

    // Strategy 0: Fieldset ID Match
    const fieldset = searchRoot.querySelector('fieldset[id^="question-answer-input-"]');
    if (fieldset && fieldset.id) {
        const match = fieldset.id.match(/question-answer-input-(\d+)/);
        if (match) {
            const fieldsetId = parseInt(match[1], 10);
            if (challengesMap[fieldsetId]) {
                challengeInfo = challengesMap[fieldsetId];
            }
        }
    }

    // Strategy 1: Visual ID Match
    if (!challengeInfo) {
        const text = searchRoot.innerText || searchRoot.textContent || '';
        const idMatch = text.match(/(?:Question|Vraag)\s*#\s*(\d+)/i) || text.match(/#(\d{4,})/);
        if (idMatch && challengesMap[idMatch[1]]) {
            challengeInfo = challengesMap[idMatch[1]];
        }
    }

    // Strategy 2: Index-based
    if (!challengeInfo) {
        const allHintBtns = Array.from(document.querySelectorAll('.grasple-show-hint-btn'));
        const btnIndex = allHintBtns.indexOf(btn);
        if (btnIndex >= 0 && btnIndex < challengesList.length) {
            challengeInfo = challengesList[btnIndex];
        }
    }

    if (!challengeInfo) {
        alert('Could not find challenge data for hint. Try refreshing.');
        return;
    }

    const challengeObj = challengeInfo.data.challenge || challengeInfo.data;
    console.log('Grasple Tools: Showing hint for', challengeObj);

    // Determine hint content
    let hints = [];

    // For input questions: use feedback_wrong
    if (challengeObj.feedback_wrong) {
        hints.push({ label: 'Hint', content: challengeObj.feedback_wrong });
    }

    // For MCQs: use response from incorrect answers
    if (challengeObj.answers && challengeObj.answers.length > 0) {
        const incorrectAnswers = challengeObj.answers.filter(a => a.right_answer === 0 && a.response);

        // Get unique responses
        const uniqueResponses = [];
        const seenResponses = new Set();
        for (const ans of incorrectAnswers) {
            const normalized = ans.response.replace(/<[^>]*>/g, '').trim();
            if (!seenResponses.has(normalized)) {
                seenResponses.add(normalized);
                uniqueResponses.push({ label: ans.answer.replace(/<[^>]*>/g, '').trim(), content: ans.response });
            }
        }

        if (uniqueResponses.length > 0) {
            hints = uniqueResponses;
        }
    }

    if (hints.length === 0) {
        alert('No hint available for this question.');
        return;
    }

    // Display the hint
    displayHint(btn, answerContainer || container, hints);
}

// Display hint with optional dropdown for multiple hints
function displayHint(btn, container, hints) {
    // Toggle logic
    const existing = container.querySelector('.grasple-tools-injected-hint');
    if (existing) {
        existing.remove();
        return;
    }

    // Toggle logic: Close other boxes (Exclusive Mode)
    closeOtherBoxes(container);

    // Use common info box function
    createInfoBox({
        container: container,
        className: 'grasple-tools-injected-hint',
        title: 'Hint',
        backgroundColor: '#d1ecf1',
        borderColor: '#bee5eb',
        titleColor: '#0c5460',
        content: hints.length === 1 ? hints[0].content : null,
        multiContent: hints.length > 1 ? hints : null
    });
}

// Show correct answer for MCQs
async function showCorrectAnswer(btn) {
    const challengesMap = window.graspleChallenges || {};

    // Find the MCQ container
    const container = btn.closest('grapp-multiple-choice-single-answer') ||
        btn.closest('grapp-multiple-choice-multiple-answers') ||
        btn.closest('grapp-multiple-choice') ||
        btn.closest('grapp-challenge');

    if (!container) {
        alert('Could not find MCQ container.');
        return;
    }

    // Try to find the challenge ID from the fieldset or other elements
    const fieldset = container.querySelector('fieldset');
    let challengeId = null;

    if (fieldset && fieldset.id) {
        // ID format: question-answer-input-61583
        const match = fieldset.id.match(/question-answer-input-(\d+)/);
        if (match) {
            challengeId = parseInt(match[1], 10);
        }
    }

    console.log('Grasple Tools: Looking for MCQ challenge ID:', challengeId);

    if (!challengeId || !challengesMap[challengeId]) {
        alert('Could not find challenge data for this MCQ. Try refreshing.');
        return;
    }

    const challengeInfo = challengesMap[challengeId];
    const challengeObj = challengeInfo.data.challenge || challengeInfo.data;

    console.log('Grasple Tools: MCQ challenge data:', challengeObj);

    // Find the correct answer(s)
    if (!challengeObj.answers || challengeObj.answers.length === 0) {
        alert('No answer data found for this question.');
        return;
    }

    const correctAnswers = challengeObj.answers.filter(a => a.right_answer === 1);

    if (correctAnswers.length === 0) {
        alert('Could not determine the correct answer.');
        return;
    }

    // Toggle logic: Check if we are already showing answers
    // If ANY correct answer is highlighted, we assume we want to toggle OFF.
    const alreadyShowing = Array.from(container.querySelectorAll('.grasple-mc-correct')).length > 0;

    if (alreadyShowing) {
        container.querySelectorAll('.grasple-mc-correct').forEach(el => el.classList.remove('grasple-mc-correct'));
        return;
    }

    // Highlight the correct answer(s) in the UI
    correctAnswers.forEach(correct => {
        const radioInput = container.querySelector(`input[value="${correct.id}"]`);
        if (radioInput) {
            const label = radioInput.closest('label') || radioInput.parentElement;
            if (label) {
                label.classList.add('grasple-mc-correct');
            }
        }
    });

    console.log('Grasple Tools: Highlighted correct answer(s):', correctAnswers.map(a => a.id));
}

// REPLACED performSafeCheck with showExplanation logic
async function showExplanation(btn) {
    const challengesMap = window.graspleChallenges || {};
    const challengesList = window.graspleChallengesList || [];

    if (challengesList.length === 0) {
        alert('No challenge data captured. Try refreshing.');
        return;
    }

    // Identify index
    const allSafeBtns = Array.from(document.querySelectorAll('.grasple-safe-check-btn'));
    const btnIndex = allSafeBtns.indexOf(btn);

    // Find the question wrapper - this is the unique container per question
    // Structure: grapp-question.question-wrapper contains grapp-multiple-choice-* or grapp-question-answer-field
    const questionWrapper = btn.closest('grapp-question.question-wrapper') ||
        btn.closest('grapp-question');

    // The answer field or MCQ container (for insertion at end)
    const answerContainer = btn.closest('grapp-multiple-choice-single-answer') ||
        btn.closest('grapp-multiple-choice-multiple-answers') ||
        btn.closest('grapp-multiple-choice') ||
        btn.closest('grapp-question-answer-field');

    // Fallback container
    const container = questionWrapper || answerContainer ||
        btn.closest('grapp-challenge') ||
        document.body;

    let challengeInfo = null;

    // Use questionWrapper for ID lookup (it contains the question ID text)
    const searchRoot = questionWrapper || answerContainer || container;

    // Strategy 0: Fieldset ID Match (most reliable for sub-questions/MCQs)
    const fieldset = searchRoot.querySelector('fieldset[id^="question-answer-input-"]');
    if (fieldset && fieldset.id) {
        const match = fieldset.id.match(/question-answer-input-(\d+)/);
        if (match) {
            const fieldsetId = parseInt(match[1], 10);
            if (challengesMap[fieldsetId]) {
                console.log('Grasple Tools: Matched via Fieldset ID:', fieldsetId);
                challengeInfo = challengesMap[fieldsetId];
            }
        }
    }

    // Strategy 0.5: Input/Form element ID Match for regular questions
    if (!challengeInfo) {
        // Look for math-field, input elements with challenge ID patterns
        const inputEl = searchRoot.querySelector('[id*="challenge-"][id*="-input"]') ||
            searchRoot.querySelector('math-field[id]') ||
            searchRoot.querySelector('input[name*="answer"]');
        if (inputEl && inputEl.id) {
            // Try to extract challenge ID from input ID pattern
            const idMatch = inputEl.id.match(/challenge[_-]?(\d+)/i) ||
                inputEl.id.match(/question[_-]?(\d+)/i) ||
                inputEl.id.match(/(\d{4,})/); // Match 4+ digit IDs
            if (idMatch) {
                const inputChallengeId = parseInt(idMatch[1], 10);
                if (challengesMap[inputChallengeId]) {
                    console.log('Grasple Tools: Matched via Input ID:', inputChallengeId);
                    challengeInfo = challengesMap[inputChallengeId];
                }
            }
        }
    }

    // Strategy 1: Visual ID Match
    function findIdInElement(el) {
        if (!el) return null;
        const text = el.innerText || el.textContent || '';
        const match = text.match(/(?:Question|Vraag)\s*#\s*(\d+)/i) ||
            text.match(/#\s*(\d+)/);
        return match ? match[1] : null;
    }

    if (!challengeInfo) {
        const visualId = findIdInElement(searchRoot); // Use searchRoot instead of container
        if (visualId && challengesMap[visualId]) {
            console.log('Grasple Tools: Matched via Visual ID:', visualId);
            challengeInfo = challengesMap[visualId];
        }
    }

    // Strategy 2: Determine Index
    if (!challengeInfo) {
        if (btnIndex >= 0 && btnIndex < challengesList.length) {
            challengeInfo = challengesList[btnIndex];
            console.log('Grasple Tools: Matched via Index:', btnIndex);
        }
    }

    // Strategy 3: Content Match
    if (!challengeInfo) {
        const containerText = container.textContent || '';
        for (const info of challengesList) {
            const c = info.data.challenge || info.data;
            if (c.question) {
                const plainQ = c.question.replace(/<[^>]*>/g, '').trim().substring(0, 40);
                if (plainQ && containerText.includes(plainQ)) {
                    challengeInfo = info;
                    break;
                }
            }
        }
    }

    if (!challengeInfo) {
        challengeInfo = challengesList[challengesList.length - 1];
    }

    const { data } = challengeInfo;
    const challengeObj = data.challenge || data;

    // debug
    console.log('Grasple Tools: Showing explanation for', challengeObj);

    let explanation = 'No explanation found in data.';
    if (challengeObj.explanation) {
        explanation = challengeObj.explanation;
    } else if (challengeObj.correct_answer && challengeObj.correct_answer.explanation) {
        explanation = challengeObj.correct_answer.explanation;
    } else if (challengeObj.feedback) {
        explanation = challengeObj.feedback;
    } else if (challengeObj.feedback_wrong) {
        explanation = challengeObj.feedback_wrong;
    } else if (challengeObj.answers && challengeObj.answers.length > 0) {
        // MCQ: look for correct answer(s) response field
        const correctAnswers = challengeObj.answers.filter(a => a.right_answer === 1 && a.response);

        if (correctAnswers.length > 1) {
            // Multiple correct answers - use dropdown
            const uniqueExplanations = [];
            const seenExplanations = new Set();
            for (const ans of correctAnswers) {
                const normalized = ans.response.replace(/<[^>]*>/g, '').trim();
                if (!seenExplanations.has(normalized)) {
                    seenExplanations.add(normalized);
                    uniqueExplanations.push({
                        label: ans.answer.replace(/<[^>]*>/g, '').trim(),
                        content: ans.response
                    });
                }
            }

            if (uniqueExplanations.length > 1) {
                // Multiple unique explanations - use dropdown
                createInfoBox({
                    container: answerContainer || container,
                    className: 'grasple-tools-injected-feedback',
                    title: 'Explanation',
                    backgroundColor: '#f8f9fa',
                    borderColor: '#dee2e6',
                    titleColor: '#212529',
                    multiContent: uniqueExplanations
                });
                console.log('Grasple Tools: Injected explanation with dropdown for multiple correct answers.');
                return;
            } else if (uniqueExplanations.length === 1) {
                explanation = uniqueExplanations[0].content;
            }
        } else if (correctAnswers.length === 1) {
            explanation = correctAnswers[0].response;
        }
    }

    // Toggle logic
    const existing = (answerContainer || container).querySelector('.grasple-tools-injected-feedback');
    if (existing) {
        existing.remove();
        return;
    }

    // Toggle logic: Close other boxes (Exclusive Mode)
    closeOtherBoxes(answerContainer || container);

    // --- Use common info box function ---
    createInfoBox({
        container: answerContainer || container,
        className: 'grasple-tools-injected-feedback',
        title: 'Explanation',
        backgroundColor: '#f8f9fa',
        borderColor: '#dee2e6',
        titleColor: '#212529',
        content: explanation
    });

    console.log('Grasple Tools: Injected explanation via createInfoBox.');
}
