// Mock WebSocket implementation for React Native
// This prevents Node.js 'ws' package from being loaded

export default class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CLOSED;
  url = '';

  constructor(url?: string) {
    this.url = url || '';
    console.warn('WebSocket functionality is disabled in this app');
  }

  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {}
}

// Export both default and named exports to match 'ws' package API
export { MockWebSocket };
module.exports = MockWebSocket;
module.exports.default = MockWebSocket;