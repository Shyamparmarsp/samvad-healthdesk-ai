/**
 * Small network warm-up helpers.
 *
 * Both are free and content-free: they only ask the browser to open a connection or keep a
 * static asset in the HTTP cache. Neither calls a provider, sends patient data, or makes a
 * paid request.
 */

/** Adds a preconnect/dns-prefetch hint for an origin (idempotent). */
export function preconnect(origin: string): void {
  if (typeof document === 'undefined' || !origin || !origin.startsWith('http')) return;
  try {
    const { protocol, host } = new URL(origin);
    const key = `preconnect:${protocol}//${host}`;
    if (document.querySelector(`link[data-warm="${key}"]`)) return;

    for (const rel of ['preconnect', 'dns-prefetch'] as const) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = `${protocol}//${host}`;
      link.crossOrigin = 'anonymous';
      link.dataset.warm = key;
      document.head.appendChild(link);
    }
  } catch {
    // A malformed URL simply skips the hint.
  }
}

/**
 * Pulls a static asset into the HTTP cache so the next turn's playback can start without a
 * network round trip. Best effort: failures are ignored and never surfaced.
 */
export function warmUrl(url: string): void {
  if (typeof fetch !== 'function' || !url) return;
  try {
    void fetch(url, { cache: 'force-cache' }).catch(() => {});
  } catch {
    // Ignore; playback will request it normally.
  }
}
