// Lets the site's modules load in Node: libraries the browser loads from a CDN
// (Supabase) are replaced by a small stand-in, and browser storage is a no-op.
import { register } from 'node:module';
register(new URL('./cdn-hooks.mjs', import.meta.url));
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
