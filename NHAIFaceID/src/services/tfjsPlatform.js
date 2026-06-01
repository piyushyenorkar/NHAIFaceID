import * as tf from '@tensorflow/tfjs';
import { Buffer } from 'buffer';

// Helper to parse XMLHttpRequest response headers
function parseHeaders(rawHeaders) {
  const headers = new Headers();
  const preProcessedHeaders = rawHeaders.replace(/\r?\n[\t ]+/g, ' ');
  preProcessedHeaders.split(/\r?\n/).forEach(line => {
    const parts = line.split(':');
    const key = parts.shift().trim();
    if (key) {
      const value = parts.join(':').trim();
      headers.append(key, value);
    }
  });
  return headers;
}

// XHR fetch implementation that supports arraybuffer correctly in React Native/Hermes
export async function customFetch(path, init, options) {
  return new Promise((resolve, reject) => {
    const request = new Request(path, init);
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const reqOptions = {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: parseHeaders(xhr.getAllResponseHeaders() || ''),
        url: '',
      };
      reqOptions.url = 'responseURL' in xhr ?
        xhr.responseURL :
        reqOptions.headers.get('X-Request-URL');
      const body = 'response' in xhr ? xhr.response : xhr.responseText;
      resolve(new Response(body, reqOptions));
    };
    xhr.onerror = () => reject(new TypeError('Network request failed'));
    xhr.ontimeout = () => reject(new TypeError('Network request failed'));
    xhr.open(request.method, request.url, true);
    if (request.credentials === 'include') {
      xhr.withCredentials = true;
    } else if (request.credentials === 'omit') {
      xhr.withCredentials = false;
    }
    if (options != null && options.isBinary) {
      xhr.responseType = 'arraybuffer';
    }
    request.headers.forEach((value, name) => {
      xhr.setRequestHeader(name, value);
    });
    xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit);
  });
}

// Platform implementation for React Native environment
export class PlatformReactNative {
  async fetch(path, init, options) {
    return customFetch(path, init, options);
  }
  encode(text, encoding) {
    if (encoding === 'utf-16') {
      encoding = 'utf16le';
    }
    return new Uint8Array(Buffer.from(text, encoding));
  }
  decode(bytes, encoding) {
    if (encoding === 'utf-16') {
      encoding = 'utf16le';
    }
    return Buffer.from(bytes).toString(encoding);
  }
  now() {
    if (global.nativePerformanceNow) {
      return global.nativePerformanceNow();
    }
    return Date.now();
  }
}

// Register the custom platform
export function registerTFJSPlatform() {
  global.Buffer = Buffer;
  tf.env().registerFlag('IS_REACT_NATIVE', () => true);
  tf.setPlatform('react-native', new PlatformReactNative());
  console.log('[TFJSPlatform] Registered custom offline React Native platform successfully.');
}
