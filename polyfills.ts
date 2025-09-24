// Polyfills for React Native compatibility with Node.js modules
import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';

// Configure global polyfills
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
import { Buffer } from '@craftzdog/react-native-buffer';
if (!global.Buffer) {
  // @ts-ignore
  global.Buffer = Buffer;
}

// Process polyfill
if (!global.process) {
  // @ts-ignore
  global.process = {
    env: {
      NODE_ENV: __DEV__ ? 'development' : 'production',
    },
    version: '',
    platform: 'linux', // Use a valid platform value
  };
}