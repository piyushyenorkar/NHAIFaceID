# NHAIFaceID: Technical Documentation

## 1. Project Overview
NHAIFaceID is a lightweight, fully offline facial recognition and liveness detection SDK built for React Native. It is designed specifically for integration into the **Datalake 3.0** mobile application to allow NHAI field personnel to authenticate themselves in zero-network zones (remote highway construction sites).

## 2. Technical Constraints & Achievements
* **Constraint 1:** Total AI Model footprint under 20MB.
  * **Achievement:** MobileFaceNet (2.1MB) + MediaPipe Face Detection (1.8MB) + MediaPipe Face Mesh 68 (3.9MB) = **7.8MB Total**.
* **Constraint 2:** Processing Speed under 1 second.
  * **Achievement:** Face Detection (~145ms) + Liveness Processing (~65ms) + Embeddings extraction (~320ms) = **~530ms Total Pipeline**.
* **Constraint 3:** Fully Offline capabilities.
  * **Achievement:** Uses SQLite for local caching and local vector cosine similarity matching. 

## 3. Architecture & Data Flow
1. **Camera Frame Acquisition:** High contrast React Native Vision Camera feed at 30fps.
2. **Face Detection Layer:** Uses MediaPipe short-range model to find the facial bounding box.
3. **Liveness Validation Layer (Anti-Spoofing):** Uses MediaPipe 68-point landmarks to mathematically prove a live 3D human is present through randomized challenge-response (Blink, Head Turn, Smile).
4. **Recognition Layer:** Extracts a 128-dimensional embedding using the MobileFaceNet TensorFlow Lite model.
5. **Database Layer:** Calculates Cosine Similarity (>0.6 threshold) against the offline SQLite `enrolled_faces` table.
6. **Sync Layer:** When network restores, `@react-native-community/netinfo` triggers an AWS `POST` request to flush the `verification_log` and purge local device memory.

## 4. How to Integrate into Datalake 3.0
The codebase exposes `NHAIFaceSDK.js` with 5 simple functions:

```javascript
import NHAIFaceSDK from './src/NHAIFaceSDK';

// 1. Initialize models on app boot
await NHAIFaceSDK.initialize();

// 2. Enroll personnel (Admin mode)
await NHAIFaceSDK.enroll('NHAI-01', 'John Doe', cameraFrame);

// 3. Verify Liveness (Randomized Challenge)
const livenessResult = NHAIFaceSDK.checkLiveness('BLINK', landmarks);

// 4. Verify Identity
const verifyResult = await NHAIFaceSDK.verify(cameraFrame, 'Device_ID');

// 5. AWS Sync (Triggered automatically on network restore, or manually)
await NHAIFaceSDK.syncToAWS();
```

## 5. Directory Structure
* `/src/models/` - Contains the 3 compressed `.tflite` AI models.
* `/src/services/` - Contains AI bridging logic (`faceDetection.js`, `faceRecognition.js`, `livenessDetection.js`) and local DB logic (`databaseService.js`, `awsSync.js`).
* `/src/components/` - Reusable UI components (`CameraView.js`, `SyncBanner.js`).
* `/src/screens/` - Modular React Native screens to drop into the Datalake navigation stack.
* `/scripts/` - Utilities for auto-downloading open-source models without bloating the git repo.

---
*Built for NHAI Hackathon 7.0*
