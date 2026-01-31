// src/extraction.js - Question text extraction logic

// Dependencies: config.js, helpers.js (getMathFieldValuesInElement)

async function extractQuestionText() {
    try {
        // Get the setting and extract question text
        const stripDecorative = await configGet('stripDecorative');
        const result = await extractAndCopy(stripDecorative, false); // Pass false to not copy to clipboard
        if (result.status === 'extracted' && result.text) {
            return { status: 'success', text: result.text };
        }
        return { status: 'failed', message: 'Could not extract question' };
    } catch (err) {
        return { status: 'error', message: String(err) };
    }
}

async function extractAndCopy(stripDecorative, doCopy = true) {
    const NL = '\r\n';

    try {
        function isElementVisible(el) {
            if (!(el instanceof Element)) return false;
            const style = window.getComputedStyle(el);
            if (!style) return true;
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
            if (el.offsetParent === null && style.position !== 'fixed' && style.position !== 'sticky') return false;
            return true;
        }

        function isIgnoredElement(el) {
            if (!(el instanceof Element)) return false;
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            // if (tag === 'grapp-question-answer-input-template') return true;
            try {
                if (el.matches && el.matches('div.exercise-header-wrapper.d-flex.justify-content-between')) return true;
                if (el.matches && el.matches('p.fs-7.fst-italic')) return true;
                // if (el.matches && el.matches('grapp-question-answer-field')) return true;
                if (el.matches && el.matches('button[data-testid="next-button"]')) return true;

                // Exclude attempts feedback
                if (el.matches && el.matches('[data-testid="attempts-and-points-feedback"]')) return true;

                // Exclude retry button and its wrapper
                if (el.matches && el.matches('[data-testid="retry-button"]')) return true;
                if (el.matches && el.matches('div.position-absolute.top-0.end-0')) return true;

            } catch (e) { }
            return false;
        }

        function extractKatexTex(el) {
            if (!(el instanceof Element)) return '';
            const ann = el.querySelector('annotation[encoding="application/x-tex"]');
            let txt = ann && ann.textContent ? ann.textContent : (el.textContent || '');
            txt = txt.replace(/\\displaystyle\s*/g, '');
            if (stripDecorative) {
                txt = txt.replace(/\\ /g, ' ').replace(/\\,/g, ' ').replace(/\\;/g, ' ').replace(/\\:/g, ' ').replace(/\\!/g, ' ').replace(/\\,/g, ' ');
                txt = txt.replace(/\\(?:quad|qquad|thinspace|enspace|,)\b/g, ' ');
                txt = txt.replace(/\\left\b/g, '').replace(/\\right\b/g, '');
                txt = txt.replace(/\\mkern[^{]*\{?[^}]*\}?/g, ' ');
            }
            const cleanedTxt = txt.replace(/\s+/g, ' ').trim();
            return cleanedTxt ? `$${cleanedTxt}$` : '';
        }

        const pieces = [];

        function pushRaw(s) {
            if (s === null || s === undefined) return;
            pieces.push(String(s));
        }

        function pushPiece(s) {
            if (s === null || s === undefined) return;
            const compact = String(s).replace(/\s+/g, ' ').trim();
            if (compact) pieces.push(compact);
        }

        function pushRawBlockWithLF(s) {
            if (s === null || s === undefined) return;
            const lines = String(s).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());
            const joined = lines.join('\n').trim();
            if (joined) pieces.push(joined);
        }

        const MINOR_BREAK_TAGS = new Set([
            'p', 'li', 'div', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote'
        ]);

        async function traverse(node) {
            if (!node) return;

            if (node.nodeType === Node.TEXT_NODE) {
                const parent = node.parentElement;
                if (!parent || !isElementVisible(parent) || isIgnoredElement(parent)) return;
                const tag = parent.tagName ? parent.tagName.toUpperCase() : '';
                if (tag === 'SCRIPT' || tag === 'STYLE') return;
                pushPiece(node.nodeValue);
                return;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                if (!isElementVisible(el) || isIgnoredElement(el)) return;

                const tagName = el.tagName ? el.tagName.toLowerCase() : '';

                // Special handling: capture user-entered LaTeX inside math-field elements (answer inputs)
                if (tagName === 'grapp-question-answer-input-template' || tagName === 'grapp-question-answer-field') {
                    try {
                        const values = await getMathFieldValuesInElement(el);
                        const cleaned = (Array.isArray(values) ? values : [])
                            .map(v => (v == null ? '' : String(v)))
                            .map(v => v.replace(/\s+/g, ' ').trim())
                            .filter(Boolean);

                        if (cleaned.length > 0) {
                            const combined = cleaned.map(v => '$' + v + '$').join(' , ');
                            pushRaw('\n');
                            pushRaw('My answer: ' + combined);
                        } else {
                            // no values found inside this input, do nothing
                        }
                    } catch (e) {
                        console.log('Error extracting math-field values:', e);
                    }
                    return; // don't traverse into these input/template nodes further
                }

                // Handle major breaks for new sub-questions
                if (tagName === 'grapp-question-header') {
                    pushRaw('\n\n'); // Use double newline as a separator
                    return; // Don't process header's content
                }

                // Handle minor breaks (paragraphs, lists) with a single newline
                if (MINOR_BREAK_TAGS.has(tagName)) {
                    pushRaw('\n');
                }

                if (tagName === 'br') {
                    pushRaw('\n');
                    return;
                }

                if (tagName === 'grapp-multiple-choice-single-answer') {
                    const optionTexts = [];
                    const radios = el.querySelectorAll('input[type="radio"], input[type="checkbox"], [data-testid="answer-radio-input"]');
                    if (radios.length > 0) {
                        radios.forEach(radio => {
                            const label = radio.closest('label') || radio.closest('[data-testid="mc-answer"]') || radio.parentElement;
                            if (!label) return;
                            const candidate = label.querySelector('.user-provided-html') || label.querySelector('.question-mc-answer-input') || label;
                            const txt = (() => {
                                const partsLocal = [];
                                (function walkLocal(n) {
                                    if (!n) return;
                                    if (n.nodeType === Node.TEXT_NODE) {
                                        const p = n.parentElement; if (p && isElementVisible(p) && !isIgnoredElement(p)) partsLocal.push(n.nodeValue);
                                    } else if (n.nodeType === Node.ELEMENT_NODE) {
                                        const ee = n; if (!isElementVisible(ee) || isIgnoredElement(ee)) return;
                                        if (ee.classList.contains('katex')) { partsLocal.push(extractKatexTex(ee)); return; }
                                        for (let c = ee.firstChild; c; c = c.nextSibling) walkLocal(c);
                                    }
                                })(candidate);
                                return partsLocal.join('').replace(/\s+/g, ' ').trim();
                            })();
                            if (txt) optionTexts.push(txt);
                        });
                    }
                    const deduped = [...new Set(optionTexts.filter(Boolean))];
                    if (deduped.length > 0) {
                        pushRaw('\n');
                        const header = 'This is a multiple choice question. Choose one of the answers below:';
                        const lines = deduped.map(it => '- ' + it);
                        pushRawBlockWithLF(header + '\n' + lines.join('\n'));
                    }
                    pushRaw('\n');
                    return;
                }

                if (el.classList.contains('katex')) {
                    pushPiece(extractKatexTex(el));
                    return;
                }

                for (let child = el.firstChild; child; child = child.nextSibling) {
                    await traverse(child);
                }
            }
        }

        const root = document.querySelector('div.position-relative.exercise-wrapper');
        if (!root) return { status: 'no-target', message: 'No .exercise-wrapper found' };

        await traverse(root);

        // Assemble the final text from pieces
        let finalText = '';
        for (let i = 0; i < pieces.length; i++) {
            const piece = pieces[i];
            if (!piece) continue;

            if (finalText === '') {
                finalText = piece;
                continue;
            }

            const lastChar = finalText.slice(-1);
            const nextChar = piece[0];

            if (lastChar === '\n' || nextChar === '\n') {
                finalText += piece;
            } else {
                finalText += ' ' + piece;
            }
        }

        // Final cleanup
        finalText = finalText.replace(/\n /g, '\n'); // Clean spaces after newlines
        finalText = finalText.replace(/(\n){3,}/g, '\n\n'); // Collapse excess blank lines
        finalText = finalText.replace(/\r?\n/g, NL); // Normalize to CRLF
        finalText = finalText.trim();

        if (!doCopy) {
            return { status: 'extracted', text: finalText };
        }

        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(finalText);
            return { status: 'copied', text: finalText };
        }

        const ta = document.createElement('textarea');
        ta.value = finalText;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.documentElement.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.documentElement.removeChild(ta);
        if (ok) return { status: 'copied', text: finalText };
        return { status: 'failed', message: 'execCommand copy failed' };

    } catch (err) {
        console.error("Extraction error:", err);
        return { status: 'error', message: String(err) };
    }
}
