// Bump this whenever the list of cached files changes.
const CACHE_NAME = 'alyx-income-manager-2026-v3';

// The app's own files. These MUST all cache or the install fails.
const APP_SHELL_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Third-party libraries. These URLs must match the <script> tags in index.html
// exactly, or the cached copy is never used and the app breaks offline.
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18.3.1/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone@7.29.13/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'
];

// How long to wait for the network before showing the cached app instead.
const NETWORK_TIMEOUT_MS = 4000;

// Install event - cache resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await cache.addAll(APP_SHELL_URLS);

      // Cache each library on its own. One CDN being briefly unreachable should
      // not stop the app itself from being installed for offline use; a library
      // that failed here is cached later, the first time the page loads it.
      await Promise.all(CDN_URLS.map(url =>
        cache.add(url).catch(error => {
          console.warn('Could not pre-cache', url, error);
        })
      ));
    })
  );
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      ))
      // Take control of all pages immediately
      .then(() => self.clients.claim())
  );
});

/**
 * The app's own files: try the network first so a newly deployed version (for
 * example a tax-calculation fix) reaches the user on the next load, and fall
 * back to the cached copy when offline or when the network is too slow.
 *
 * Cache-first was used here before. It meant index.html was served from the
 * cache forever, and a fix only reached the user if CACHE_NAME was also bumped.
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  const fromNetwork = fetch(request).then(response => {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  });

  const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS));

  try {
    const response = await Promise.race([fromNetwork, timeout]);
    if (response) {
      return response;
    }
  } catch (error) {
    // Offline - fall through to the cache
  }

  // ignoreSearch: the OAuth redirect lands on /?auth=success
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) {
    // Do not leave a rejected network promise unhandled
    fromNetwork.catch(() => {});
    return cached;
  }

  // Nothing cached: wait for the network however long it takes
  return fromNetwork;
}

/**
 * Third-party libraries: the URLs are version-pinned, so their content never
 * changes. Serve from cache, and cache on first use if not there yet.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  // 'opaque' = a cross-origin <script> without the crossorigin attribute. Its
  // status is not readable, but it is still usable as a cached script.
  if (response && (response.status === 200 || response.type === 'opaque')) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Only the libraries listed above are cached. Everything else cross-origin
  // (Google Drive API, the auth worker) always goes straight to the network.
  if (CDN_URLS.some(cdnUrl => request.url === cdnUrl || request.url.startsWith(cdnUrl + '/'))) {
    event.respondWith(cacheFirst(request));
  }
});
