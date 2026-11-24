let toastTimer;

function showToast(message, duration = 3000) {
  let toast = document.querySelector('#app-toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.append(toast);
  }

  toast.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, duration);
}

window.showToast = showToast;

document.querySelectorAll('.book-match').forEach((button) => {
  button.addEventListener('click', () => {
    const matchSelect = document.querySelector('#match');
    const bookingForm = document.querySelector('#booking-form');
    const matchName = button.closest('.match-card').querySelector('p').textContent;

    matchSelect.value = button.dataset.match;
    bookingForm.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'start',
    });
    matchSelect.focus({ preventScroll: true });
    showToast(`${matchName} selected. Complete the form to continue.`);
  });
});
