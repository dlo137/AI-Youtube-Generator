// Polyfills for React Native compatibility with Node.js modules
try {
  require('react-native-url-polyfill/auto');
} catch (e) {
  console.warn('URL polyfill failed to load:', e);
}

try {
  require('react-native-get-random-values');
} catch (e) {
  console.warn('Random values polyfill failed to load:', e);
}

// Configure global polyfills safely
if (typeof global === 'undefined') {
  // @ts-ignore
  global = {};
}

// Disable WebSocket for React Native (use React Native's built-in WebSocket)
if (typeof WebSocket !== 'undefined') {
  // @ts-ignore
  global.WebSocket = WebSocket;
}

// Buffer polyfill
try {
  const { Buffer } = require('@craftzdog/react-native-buffer');
  if (!global.Buffer) {
    // @ts-ignore
    global.Buffer = Buffer;
  }
} catch (e) {
  console.warn('Buffer polyfill failed to load:', e);
}

// Process polyfill
try {
  if (!global.process) {
    // @ts-ignore
    global.process = require('process/browser');
  }
  if (!global.process.env) {
    global.process.env = {};
  }
  if (!global.process.env.NODE_ENV) {
    global.process.env.NODE_ENV = __DEV__ ? 'development' : 'production';
  }
} catch (e) {
  // Fallback if process module doesn't exist
  if (!global.process) {
    // @ts-ignore
    global.process = {
      env: {
        NODE_ENV: __DEV__ ? 'development' : 'production',
      },
      version: '',
      platform: 'android',
      nextTick: (fn: Function) => setTimeout(fn, 0),
    };
  }
}