/**
 * Downloads a MobileFaceNet ONNX model for face recognition.
 * Follows redirects and handles HTTPS properly.
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'src', 'models', 'mobilefacenet_recognition.onnx');

// Try multiple known sources
const SOURCES = [
  // Nico Nielsen's Neural Networks repo (well-known MobileFaceNet ONNX)
  'https://github.com/niconielsen32/NeuralNetworks/raw/main/faceRecognition/mobilefacenet.onnx',
  // Alternative: try the onnx model zoo mirror
  'https://github.com/niconielsen32/NeuralNetworks/raw/refs/heads/main/faceRecognition/mobilefacenet.onnx',
];

function download(url, dest, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    console.log(`  Trying: ${url}`);
    lib.get(url, { headers: { 'User-Agent': 'NHAIFaceID/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`  Redirect ${res.statusCode} -> ${res.headers.location}`);
        return resolve(download(res.headers.location, dest, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const file = fs.createWriteStream(dest);
      let downloaded = 0;
      res.on('data', (chunk) => { downloaded += chunk.length; });
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`  Downloaded ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
        resolve(downloaded);
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('MobileFaceNet ONNX Model Downloader');
  console.log('===================================');
  
  for (const url of SOURCES) {
    try {
      const size = await download(url, OUTPUT);
      if (size > 100000) { // Must be > 100KB to be a real model
        console.log(`\nSuccess! Model saved to: ${OUTPUT}`);
        console.log(`Size: ${(size / 1024 / 1024).toFixed(2)} MB`);
        return;
      } else {
        console.log(`  File too small (${size} bytes), trying next source...`);
        fs.unlinkSync(OUTPUT);
      }
    } catch (e) {
      console.log(`  Failed: ${e.message}`);
    }
  }
  
  console.error('\nAll sources failed. Manual download required.');
  process.exit(1);
}

main();
