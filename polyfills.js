import 'react-native-url-polyfill/auto';
import { Buffer } from '@craftzdog/react-native-buffer';

// Set up global polyfills
global.Buffer = Buffer;

// Mock process if needed
if (typeof global.process === 'undefined') {
  global.process = {
    nextTick: (fn) => setTimeout(fn, 0),
    env: {},
  };
}