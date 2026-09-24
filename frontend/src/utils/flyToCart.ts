/**
 * Sends a small copy of the dish photo flying along an arc into the visible cart target
 * (`[data-cart-target]`). Purely decorative: skipped with reduced motion or when no target is visible.
 */
export function flyToCart(source: HTMLElement | null, imageUrl?: string | null): void {
  if (!source || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-cart-target]'))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .find(({ r }) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight);
  if (!target) return;

  const from = source.getBoundingClientRect();
  const size = Math.min(from.width, 120);
  const ghost = document.createElement('div');
  ghost.className = 'fly';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.width = `${size}px`;
  ghost.style.height = `${size * 0.75}px`;
  ghost.style.left = `${from.left + from.width / 2 - size / 2}px`;
  ghost.style.top = `${from.top + from.height / 2 - (size * 0.75) / 2}px`;
  ghost.style.backgroundImage = imageUrl ? `url("${imageUrl}")` : 'linear-gradient(135deg, #F97316, #DB2777)';
  document.body.appendChild(ghost);

  const dx = target.r.left + target.r.width / 2 - (from.left + from.width / 2);
  const dy = target.r.top + target.r.height / 2 - (from.top + from.height / 2);
  // Arc peak: above the midpoint, but never above the top of the viewport.
  const startY = from.top + from.height / 2;
  const lift = Math.max(Math.min(-80, dy / 2 - 120), 24 - startY);
  const anim = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${lift}px) scale(0.6) rotate(-8deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12) rotate(12deg)`, opacity: 0.4 },
    ],
    { duration: 700, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
  );
  const cleanup = () => ghost.remove();
  anim.onfinish = cleanup;
  anim.oncancel = cleanup;
}
