/**
 * Attaches swipe gesture handling to a card element.
 * onSwipe is called with 'left' or 'right'.
 */
export function enableSwipe(cardEl, { onSwipe, threshold = 80 }) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let dragging = false;

  function pointerStart(e) {
    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    startY = touch.clientY;
    currentX = 0;
    dragging = true;
    cardEl.style.transition = 'none';
  }

  function pointerMove(e) {
    if (!dragging) return;
    const touch = e.touches ? e.touches[0] : e;
    currentX = touch.clientX - startX;
    const rotation = currentX * 0.1;
    cardEl.style.transform = `translateX(${currentX}px) rotate(${rotation}deg)`;

    // Visual feedback
    if (currentX > threshold * 0.5) {
      cardEl.classList.add('swipe-right-hint');
      cardEl.classList.remove('swipe-left-hint');
    } else if (currentX < -threshold * 0.5) {
      cardEl.classList.add('swipe-left-hint');
      cardEl.classList.remove('swipe-right-hint');
    } else {
      cardEl.classList.remove('swipe-right-hint', 'swipe-left-hint');
    }
  }

  function pointerEnd() {
    if (!dragging) return;
    dragging = false;
    cardEl.classList.remove('swipe-right-hint', 'swipe-left-hint');

    if (Math.abs(currentX) > threshold) {
      const direction = currentX > 0 ? 'right' : 'left';
      const flyX = currentX > 0 ? window.innerWidth : -window.innerWidth;
      cardEl.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
      cardEl.style.transform = `translateX(${flyX}px) rotate(${currentX * 0.2}deg)`;
      cardEl.style.opacity = '0';
      setTimeout(() => onSwipe(direction), 300);
    } else {
      cardEl.style.transition = 'transform 0.3s ease-out';
      cardEl.style.transform = '';
    }
  }

  cardEl.addEventListener('touchstart', pointerStart, { passive: true });
  cardEl.addEventListener('touchmove', pointerMove, { passive: true });
  cardEl.addEventListener('touchend', pointerEnd);
  cardEl.addEventListener('mousedown', pointerStart);
  cardEl.addEventListener('mousemove', pointerMove);
  cardEl.addEventListener('mouseup', pointerEnd);
  cardEl.addEventListener('mouseleave', pointerEnd);
}
