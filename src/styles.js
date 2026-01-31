// src/styles.js - Custom CSS injection

/**
 * Inject custom styles for toggling and answer highlighting
 */
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .grasple-mc-correct,
    .grasple-mc-correct:hover {
        border: 3px solid #28a745 !important;
        background-color: #d4edda !important;
    }
    .grasple-mc-correct *,
    .grasple-mc-correct:hover * {
        background-color: transparent !important;
        background: transparent !important;
    }
    .grasple-hidden-by-feedback {
      display: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}
