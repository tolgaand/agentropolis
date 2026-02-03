/**
 * Dev mode detection utility.
 * Priority: ?dev=1/0 query param > localStorage > import.meta.env.DEV
 */
export function isDevMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('dev') === '1') return true;
  if (params.get('dev') === '0') return false;
  const stored = localStorage.getItem('devUi');
  if (stored !== null) return stored === '1';
  return import.meta.env.DEV;
}
