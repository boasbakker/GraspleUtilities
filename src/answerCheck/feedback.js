// src/answerCheck/feedback.js - Legacy feedback display

function getAuthToken() {
    return window.graspleAuthToken || '';
}

function showFeedback(btn, html, correctAnswer) {
    let fbDiv = document.getElementById('grasple-tools-feedback');
    if (!fbDiv) {
        fbDiv = document.createElement('div');
        fbDiv.id = 'grasple-tools-feedback';
        fbDiv.style.marginTop = '10px';
        fbDiv.style.border = '1px solid #ccc';
        fbDiv.style.padding = '10px';
        fbDiv.style.borderRadius = '5px';
        fbDiv.style.backgroundColor = '#f9f9f9';
        const footer = document.querySelector('.exercise-footer');
        if (footer) footer.parentNode.insertBefore(fbDiv, footer.nextSibling);
    }

    let content = '<strong>Feedback:</strong><br>' + html;
    if (correctAnswer) {
        content += '<hr><strong>Correct Answer:</strong> ' + correctAnswer;
    }
    fbDiv.innerHTML = content;

    if (window.renderMathInElement) {
        try { window.renderMathInElement(fbDiv); } catch (e) { }
    } else if (window.MathJax && window.MathJax.typeset) {
        try { window.MathJax.typeset([fbDiv]); } catch (e) { }
    }
}
