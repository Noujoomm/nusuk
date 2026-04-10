/**
 * Smooth scroll to an element after it renders.
 * Used when showing edit forms, modals, or inline edit sections.
 * Waits a tick for the DOM to update before scrolling.
 */
export function scrollToEdit(selector: string, delay = 100) {
  setTimeout(() => {
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, delay);
}

/**
 * Scroll to the top of the page smoothly.
 */
export function scrollToTop(delay = 50) {
  setTimeout(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, delay);
}
