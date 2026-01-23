// src/answerCheck/infoBox.js - Info box creation utility

/**
 * Helper to close other injected boxes in the same container (Exclusive Mode)
 */
function closeOtherBoxes(container) {
    if (!container) return;
    const selectors = [
        '.grasple-tools-injected-hint',
        '.grasple-tools-injected-feedback',
        '.grasple-tools-correct-answer-display'
    ];
    selectors.forEach(sel => {
        container.querySelectorAll(sel).forEach(el => el.remove());
    });
}

/**
 * Common function to create info boxes (for explanation and hint)
 * Ensures consistent styling and KaTeX rendering
 */
function createInfoBox(options) {
    const {
        container,
        className,
        title,
        backgroundColor = '#f8f9fa',
        borderColor = '#dee2e6',
        titleColor = '#212529',
        content = null,
        multiContent = null  // Array of { label, content } for dropdown
    } = options;

    // Remove existing box of same type
    let existing = container.querySelector('.' + className);
    if (existing) {
        existing.remove();
    }

    const wrapper = document.createElement('div');
    wrapper.className = className + ' mt-3 grasple-tools-info-box';
    wrapper.id = 'grasple-box-' + Math.random().toString(36).substr(2, 9);

    let html = `
      <grapp-question-feedback>
        <div data-testid="container">
          <section data-testid="question-feedback" class="question-feedback question-feedback--visible">
            <div class="question-feedback-wrapper position-relative" style="background-color: ${backgroundColor}; border: 1px solid ${borderColor}; border-radius: 0.25rem; padding: 1rem;">
              <h2 class="h5" style="color: ${titleColor};">${title}</h2>
              
              <div class="info-box-contents">
    `;

    // Log content for debugging
    if (content) console.log('Grasple Tools Check:', content.includes('\\\\') ? 'Double Backslashes Detected' : 'Clean');

    if (content) {
        // Single content
        html += '<div class="user-provided-html">' + content + '</div>';
    } else if (multiContent && multiContent.length > 0) {
        // Multiple content with dropdown
        html += '<div style="margin-bottom: 10px;"><span style="margin-right: 8px;">Feedback for answer:</span>';
        html += '<select class="hint-selector" style="padding: 5px; border-radius: 3px;">';
        multiContent.forEach((item, i) => {
            html += '<option value="' + i + '">' + item.label + '</option>';
        });
        html += '</select></div>';
        multiContent.forEach((item, i) => {
            html += '<div class="info-content-item" data-index="' + i + '" style="' + (i > 0 ? 'display:none;' : '') + '">';
            html += '<div class="user-provided-html">' + item.content + '</div>';
            html += '</div>';
        });
    }

    html += `
              </div>
            </div>
          </section>
        </div>
      </grapp-question-feedback>
    `;

    wrapper.innerHTML = html;

    // Add dropdown event listener if multiple content
    if (multiContent && multiContent.length > 1) {
        setTimeout(() => {
            const selector = wrapper.querySelector('.hint-selector');
            if (selector) {
                selector.addEventListener('change', (e) => {
                    const selectedIndex = e.target.value;
                    wrapper.querySelectorAll('.info-content-item').forEach(el => {
                        el.style.display = el.dataset.index === selectedIndex ? '' : 'none';
                    });
                    // Re-render math for newly visible content
                    window.postMessage({ type: 'GRASPLE_RENDER_MATH', id: wrapper.id }, '*');
                });
            }
        }, 0);
    }

    container.appendChild(wrapper);

    // Trigger math rendering
    setTimeout(() => {
        window.postMessage({ type: 'GRASPLE_RENDER_MATH', id: wrapper.id }, '*');
    }, 50);

    console.log('Grasple Tools: Created info box:', title);

    return wrapper;
}
