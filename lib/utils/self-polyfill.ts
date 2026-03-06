/**
 * Polyfill for 'self' in Node.js/SSR environments.
 * Some browser-oriented libraries (e.g., papaparse) reference 'self'
 * which doesn't exist in Node.js.
 */
if (typeof globalThis !== 'undefined' && typeof (globalThis as any).self === 'undefined') {
  (globalThis as any).self = globalThis;
}
