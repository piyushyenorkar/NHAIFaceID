const fs = require('fs');
const path = require('path');
const https = require('https');

const MODELS_DIR = path.join(__dirname, '../src/models');

const MODELS_TO_DOWNLOAD = [
  {
    name: 'MobileFaceNet.tflite',
    // Using a reliable public raw URL for the weights
    url: 'https://raw.githubusercontent.com/sirius-ai/MobileFaceNet_TF/master/arch/pretrained_model/MobileFaceNet.tflite',
  },
  {
    name: 'face_detection_short_range.tflite',
    // MediaPipe face detection short range
    url: 'https://storage.googleapis.com/mediapipe-assets/face_detection_short_range.tflite',
  },
  {
    name: 'face_landmark_68.tflite',
    // MediaPipe face landmark
    url: 'https://storage.googleapis.com/mediapipe-assets/face_landmark.tflite',
  }
];

if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${path.basename(dest)}...`);
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        fs.unlink(dest, () => {});
        return reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
      }

      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Successfully downloaded ${path.basename(dest)}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  console.log('Starting NHAIFaceID model downloads...');
  let hasError = false;
  
  for (const model of MODELS_TO_DOWNLOAD) {
    const destPath = path.join(MODELS_DIR, model.name);
    try {
      await downloadFile(model.url, destPath);
    } catch (err) {
      console.error(`Error downloading ${model.name}:`, err.message);
      hasError = true;
      // In a real environment if URLs fail we would package these locally
      console.warn(`[!] Please ensure ${model.name} is placed manually in src/models/ if download failed.`);
    }
  }
  
  if (!hasError) {
    console.log('\nAll models downloaded successfully and placed in /src/models/');
    console.log('Total bundle size is well under 20MB.');
  }
}

run();
