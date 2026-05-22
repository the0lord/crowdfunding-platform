/**
 * process polyfill for browser — direct CJS-compatible export.
 *
 * vite-plugin-node-polyfills ships a shim that wraps `process` in ESM
 * named exports (`exports.default`, `exports.process`).  When esbuild
 * pre-bundles CJS deps like readable-stream, it does:
 *
 *    var process2 = require_shim();   // returns mod.exports
 *
 * That gives the consumer the *wrapper* object, not the actual process,
 * so `process2.nextTick` is undefined.
 *
 * This shim assigns the process object directly to `module.exports`
 * so CJS consumers get the right thing.
 */

var process = {};

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
  throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout() {
  throw new Error('clearTimeout has not been defined');
}

(function () {
  try {
    cachedSetTimeout = typeof setTimeout === 'function' ? setTimeout : defaultSetTimout;
  } catch (e) {
    cachedSetTimeout = defaultSetTimout;
  }
  try {
    cachedClearTimeout = typeof clearTimeout === 'function' ? clearTimeout : defaultClearTimeout;
  } catch (e) {
    cachedClearTimeout = defaultClearTimeout;
  }
})();

function runTimeout(fun) {
  if (cachedSetTimeout === setTimeout) return setTimeout(fun, 0);
  if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
    cachedSetTimeout = setTimeout;
    return setTimeout(fun, 0);
  }
  try { return cachedSetTimeout(fun, 0); } catch (e) {
    try { return cachedSetTimeout.call(null, fun, 0); } catch (e2) {
      return cachedSetTimeout.call(this, fun, 0);
    }
  }
}

function runClearTimeout(marker) {
  if (cachedClearTimeout === clearTimeout) return clearTimeout(marker);
  if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
    cachedClearTimeout = clearTimeout;
    return clearTimeout(marker);
  }
  try { return cachedClearTimeout(marker); } catch (e) {
    try { return cachedClearTimeout.call(null, marker); } catch (e2) {
      return cachedClearTimeout.call(this, marker);
    }
  }
}

var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
  if (!draining || !currentQueue) return;
  draining = false;
  if (currentQueue.length) {
    queue = currentQueue.concat(queue);
  } else {
    queueIndex = -1;
  }
  if (queue.length) drainQueue();
}

function drainQueue() {
  if (draining) return;
  var timeout = runTimeout(cleanUpNextTick);
  draining = true;
  var len = queue.length;
  while (len) {
    currentQueue = queue;
    queue = [];
    while (++queueIndex < len) {
      if (currentQueue) currentQueue[queueIndex].run();
    }
    queueIndex = -1;
    len = queue.length;
  }
  currentQueue = null;
  draining = false;
  runClearTimeout(timeout);
}

process.nextTick = function (fun) {
  var args = new Array(arguments.length - 1);
  if (arguments.length > 1) {
    for (var i = 1; i < arguments.length; i++) {
      args[i - 1] = arguments[i];
    }
  }
  queue.push(new Item(fun, args));
  if (queue.length === 1 && !draining) runTimeout(drainQueue);
};

function Item(fun, array) {
  this.fun = fun;
  this.array = array;
}
Item.prototype.run = function () {
  this.fun.apply(null, this.array);
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = '';
process.versions = {};

function noop() {}
process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;
process.listeners = function () { return []; };
process.binding = function () { throw new Error('process.binding is not supported'); };
process.cwd = function () { return '/'; };
process.chdir = function () { throw new Error('process.chdir is not supported'); };
process.umask = function () { return 0; };

// Ensure the global process is THIS object so CJS deps that access
// window.process or the free variable also get nextTick and friends
globalThis.process = process;

export { process };
export default process;
