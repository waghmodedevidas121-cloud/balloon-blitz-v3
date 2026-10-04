import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://game.test';
const CACHE = 'balloon-blitz-v3-9';

function workerHarness(fetcher = async () => new Response('online')) {
  const handlers = new Map();
  const cacheData = new Map();
  let failWrites = false;
  let skipWaitingCalls = 0;
  let claimCalls = 0;

  const keyOf = request => new URL(typeof request === 'string' ? request : request.url, `${ORIGIN}/sw.js`).href;
  const caches = {
    async open(name) {
      if (!cacheData.has(name)) {
        const entries = new Map();
        cacheData.set(name, {
          async addAll(paths) {
            for (const path of paths) entries.set(keyOf(path), new Response(path));
          },
          async match(request) { return entries.get(keyOf(request)) || null; },
          async put(request, response) {
            if (failWrites) throw new Error('cache write denied');
            entries.set(keyOf(request), response.clone());
          }
        });
      }
      return cacheData.get(name);
    },
    async keys() { return [...cacheData.keys()]; },
    async delete(name) { return cacheData.delete(name); }
  };

  const self = {
    addEventListener(type, handler) { handlers.set(type, handler); },
    async skipWaiting() { skipWaitingCalls++; },
    clients: { async claim() { claimCalls++; } }
  };
  vm.runInNewContext(source, { self, caches, URL, location: { origin: ORIGIN }, Response, fetch: fetcher });

  const event = (request = null) => {
    const lifetimes = [];
    let responsePromise = null;
    return {
      request,
      waitUntil(promise) { lifetimes.push(Promise.resolve(promise)); },
      respondWith(promise) { responsePromise = Promise.resolve(promise); },
      async finish() { await Promise.all(lifetimes); return responsePromise ? responsePromise : null; }
    };
  };

  return {
    handlers, caches, cacheData, event,
    get failWrites() { return failWrites; }, set failWrites(value) { failWrites = value; },
    get skipWaitingCalls() { return skipWaitingCalls; }, get claimCalls() { return claimCalls; }
  };
}

test('worker installs a complete release cache and prunes only older Balloon Blitz caches on activation', async () => {
  const worker = workerHarness();
  const install = worker.event();
  worker.handlers.get('install')(install);
  await install.finish();
  assert.equal(worker.skipWaitingCalls, 1);
  const releaseCache = await worker.caches.open(CACHE);
  assert.ok(await releaseCache.match(`${ORIGIN}/js/app.js`));
  assert.ok(await releaseCache.match(`${ORIGIN}/assets/ui/pause.png`));

  await worker.caches.open('balloon-blitz-v3-8');
  await worker.caches.open('unrelated-app-cache');
  const activate = worker.event();
  worker.handlers.get('activate')(activate);
  await activate.finish();
  assert.deepEqual((await worker.caches.keys()).sort(), [CACHE, 'unrelated-app-cache'].sort());
  assert.equal(worker.claimCalls, 1);
});

test('worker serves cached core assets, falls back to cached home offline, and rejects uncached offline assets clearly', async () => {
  let networkCalls = 0;
  const worker = workerHarness(async () => { networkCalls++; throw new Error('offline'); });
  const install = worker.event();
  worker.handlers.get('install')(install);
  await install.finish();

  const cssRequest = { method: 'GET', url: `${ORIGIN}/css/app.css`, mode: 'cors' };
  const css = worker.event(cssRequest);
  worker.handlers.get('fetch')(css);
  const cssResponse = await css.finish();
  assert.equal(cssResponse.status, 200);
  assert.equal(await cssResponse.text(), './css/app.css');
  assert.equal(networkCalls, 0);

  const navigation = worker.event({ method: 'GET', url: `${ORIGIN}/`, mode: 'navigate' });
  worker.handlers.get('fetch')(navigation);
  const home = await navigation.finish();
  assert.equal(home.status, 200);
  assert.equal(await home.text(), './index.html');

  const missing = worker.event({ method: 'GET', url: `${ORIGIN}/missing.png`, mode: 'cors' });
  worker.handlers.get('fetch')(missing);
  const offline = await missing.finish();
  assert.equal(offline.status, 503);
  assert.equal(await offline.text(), 'Offline');
  assert.equal(networkCalls, 2);
});

test('worker leaves non-GET and cross-origin requests alone and cache write errors do not break online assets', async () => {
  let networkCalls = 0;
  const worker = workerHarness(async () => { networkCalls++; return new Response('network asset'); });
  const install = worker.event();
  worker.handlers.get('install')(install);
  await install.finish();

  const external = worker.event({ method: 'GET', url: 'https://cdn.example/image.png', mode: 'cors' });
  worker.handlers.get('fetch')(external);
  assert.equal(await external.finish(), null);
  const post = worker.event({ method: 'POST', url: `${ORIGIN}/submit`, mode: 'cors' });
  worker.handlers.get('fetch')(post);
  assert.equal(await post.finish(), null);
  assert.equal(networkCalls, 0);

  worker.failWrites = true;
  const request = worker.event({ method: 'GET', url: `${ORIGIN}/dynamic.png`, mode: 'cors' });
  worker.handlers.get('fetch')(request);
  const response = await request.finish();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'network asset');
  assert.equal(networkCalls, 1);
});
