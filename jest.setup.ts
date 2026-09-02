import '@testing-library/jest-dom';
import 'whatwg-fetch';

// jsdom doesn't expose the web streams globals that @ai-sdk/* packages (via eventsource-parser)
// need at import time. Node's stream/web module provides them.
if (typeof (globalThis as any).TransformStream === 'undefined') {
  const { TransformStream, ReadableStream, WritableStream } = require('node:stream/web');
  (globalThis as any).TransformStream = TransformStream;
  (globalThis as any).ReadableStream = (globalThis as any).ReadableStream || ReadableStream;
  (globalThis as any).WritableStream = (globalThis as any).WritableStream || WritableStream;
}
