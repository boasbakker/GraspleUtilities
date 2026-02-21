// src/buttons/aiButtons.js - AI helper button factories

// Dependencies: config.js, extraction.js

/**
 * Generic factory for creating "Ask AI" buttons.
 * @param {string} name - The name of the AI service (e.g., 'ChatGPT').
 * @param {string} testId - The data-testid attribute for the button.
 * @param {string} urlTemplate - The URL to open, with '{prompt}' as a placeholder for the question.
 * @returns {HTMLButtonElement}
 */
function createAIHelperButton(name, testId, urlTemplate) {
    const button = document.createElement('button');
    const buttonText = `Ask ${name}`;
    button.textContent = buttonText;
    button.className = 'btn btn-outline-primary btn-sm';
    button.style.marginRight = '8px';
    button.setAttribute('data-testid', testId);

    button.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            const result = await extractQuestionText();
            if (result.status === 'success' && result.text) {
                // Get the custom AI prompt from settings
                const aiPrompt = await configGet('aiPrompt');

                // Combine custom prompt with question text
                let fullPrompt = result.text;
                if (aiPrompt && aiPrompt.trim()) {
                    fullPrompt = aiPrompt.trim() + '\n\n' + result.text;
                }

                // URL encode the full prompt
                const encodedQuestion = encodeURIComponent(fullPrompt);
                // Construct the final URL from the template
                const finalUrl = urlTemplate.replace('{prompt}', encodedQuestion);

                // Open the AI tool with the question
                window.open(finalUrl, '_blank');

                // Visual feedback
                const originalText = button.textContent;
                button.textContent = '✓ Opened';
                button.style.backgroundColor = '#28a745';
                button.style.color = 'white';
                button.style.borderColor = '#28a745';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.backgroundColor = '';
                    button.style.color = '';
                    button.style.borderColor = '';
                }, 2000);
            } else {
                button.textContent = 'Failed ✗';
                setTimeout(() => {
                    button.textContent = buttonText;
                }, 2000);
            }
        } catch (err) {
            console.error(`Failed to open ${name}:`, err);
            button.textContent = 'Error ✗';
            setTimeout(() => {
                button.textContent = buttonText;
            }, 2000);
        }
    });

    return button;
}

function createAskChatGPTButton() {
    const urlTemplate = 'https://chatgpt.com/?q={prompt}';
    return createAIHelperButton('ChatGPT', 'ask-chatgpt-button', urlTemplate);
}

function createAskGeminiButton() {
    const urlTemplate = 'https://aistudio.google.com/prompts/new_chat?model=gemini-3.1-pro-preview&prompt={prompt}';
    return createAIHelperButton('Gemini', 'ask-gemini-button', urlTemplate);
}
