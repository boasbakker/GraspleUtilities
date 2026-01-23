// src/buttons/copyButton.js - Copy question button creation

// Dependencies: config.js, extraction.js

const COPY_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2Zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6ZM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2Z"/>
</svg>`;

const CHECK_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
</svg>`;

const ERROR_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
</svg>`;

function createCopyButton() {
    const button = document.createElement('button');
    button.innerHTML = COPY_ICON;
    // Use 'btn-link' or similar to make it look like an icon trigger, or keep outline but make it square/small
    button.className = 'btn btn-outline-primary btn-sm';
    button.style.marginRight = '8px';
    button.title = 'Copy question to clipboard';
    button.setAttribute('aria-label', 'Copy question to clipboard');
    button.setAttribute('data-testid', 'copy-latex-button');

    // Adjust padding for icon-only look
    button.style.padding = '4px 8px';
    button.style.display = 'inline-flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';

    button.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            console.log("trying to copy!")
            const stripDecorative = await configGet('stripDecorative');
            console.log("stripDecorative:", stripDecorative);
            const result = await extractAndCopy(stripDecorative);

            if (result.status === 'copied') {
                // Visual feedback checkmark
                button.innerHTML = CHECK_ICON;
                button.classList.remove('btn-outline-primary');
                button.classList.add('btn-success');
                button.style.color = 'white';

                setTimeout(() => {
                    button.innerHTML = COPY_ICON;
                    button.classList.remove('btn-success');
                    button.classList.add('btn-outline-primary');
                    button.style.color = '';
                }, 2000);
            } else {
                // Failed visual feedback
                button.innerHTML = ERROR_ICON;
                button.classList.remove('btn-outline-primary');
                button.classList.add('btn-danger');

                setTimeout(() => {
                    button.innerHTML = COPY_ICON;
                    button.classList.remove('btn-danger');
                    button.classList.add('btn-outline-primary');
                }, 2000);
            }
        } catch (err) {
            console.error('Copy failed:', err);
            button.innerHTML = ERROR_ICON;
            button.classList.remove('btn-outline-primary');
            button.classList.add('btn-danger');
            setTimeout(() => {
                button.innerHTML = COPY_ICON;
                button.classList.remove('btn-danger');
                button.classList.add('btn-outline-primary');
            }, 2000);
        }
    });

    return button;
}
