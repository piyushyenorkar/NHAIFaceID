# NHAIFaceID - Master Architecture & Technical Implementation Document

## 1. Executive Summary
This document serves as the exhaustive technical reference for **NHAIFaceID**. It details exactly what libraries were used, how the pipeline operates from end to end, the specific mathematical strategies implemented to achieve the extreme optimizations, and the low-level native Android code modifications we built to bypass framework limitations.

Our goal was to build a secure, offline facial recognition and liveness detection system operating under a rigid **20MB footprint constraint** and a **1-second execution constraint**. 

## 2. Core Tech Stack & Dependencies
* **Framework:** React Native (Cross-platform application logic and UI)
* **Camera System:** `react-native-vision-camera` (Capturing high-speed real-time frames)
* **Face Detection & Mesh:** `@mediapipe/face_mesh` and `@mediapipe/face_detection` (Running via TensorFlow.js for lightweight 3D face geometry)
* **Face Recognition (Embeddings):** `MobileFaceNet.tflite` (A highly quantized, lightweight 1.9MB Convolutional Neural Network run natively via Android TFLite C API)
* **Database:** `react-native-sqlite-storage` (Secure, encrypted offline storage for the biometric vectors)
* **Native Language:** Kotlin (For high-speed Image/Bitmap processing and Model Inference)

---

## 3. The Liveness Detection Pipeline (Anti-Spoofing)

**Where it happens:** `src/components/CameraView.js`

### How we built it:
Instead of utilizing a heavy 50MB+ neural network for spoof detection, we achieved high-security liveness detection using mathematical variance over time.
1. **The 468-Landmark Mesh:** As the user holds their phone, `CameraView.js` captures frames and passes them to the MediaPipe Face Mesh model. This plots exactly 468 X, Y, Z coordinates on the user's face in 3D space.
2. **Temporal Micro-Variance Tracking:** We store these mesh outputs in an array (`landmarksHistoryRef`). Every 400 milliseconds, the SDK calculates the mathematical variance of these points.
3. **The Logic:** A real human face is constantly making micro-movements (breathing, micro-expressions, heartbeat jitters). A printed photograph or a video on a screen is completely static relative to itself. 
4. **The Threshold:** If the variance across the history is `< 0.00012`, the system instantly flags `isSpoofDetected = true` and rejects the scan.

---

## 4. The Face Recognition Engine (Native Kotlin)

**Where it happens:** `android/app/src/main/java/com/nhaifaceid/FaceRecognitionModule.kt`

### The Problem with standard React Native ML:
Passing heavy image data (Base64 strings or massive Arrays) back and forth across the React Native JavaScript bridge takes hundreds of milliseconds and causes the app to crash on low-end devices due to RAM exhaustion. 

### How we solved it (The Native Bypass):
We wrote a custom Kotlin module to execute the heaviest calculations natively in Android C/C++ memory.

#### Step 1: The EXIF Rotation Fix
When front-facing Android cameras take a photo, they often save the raw pixels sideways (Landscape) and only add an EXIF metadata tag saying "Rotate 270 degrees". If we fed sideways pixels into our AI, it would fail. 
We implemented an `androidx.exifinterface.media.ExifInterface` interceptor in our Kotlin code. Before touching the AI, the Kotlin code reads the EXIF byte-array, calculates the correct orientation, and draws a newly rotated `Bitmap` using a `Matrix`.

#### Step 2: The Fixed Center-Crop Strategy
Originally, we relied on MLKit to draw a bounding box around the face. However, MLKit bounding boxes often drifted or suffered from mirroring bugs, causing inconsistent inputs.
To solve this, we forced the user to align their face inside a UI oval on the screen. Since we *know* the face is in the center, our Kotlin code executes a highly precise **Fixed Center Crop**:
* `startX = width * 0.25`
* `startY = height * 0.25`
* `cropWidth = width * 0.5`
* `cropHeight = height * 0.5`
This guarantees the MobileFaceNet model receives the exact same framing every single time, drastically increasing accuracy.

#### Step 3: TFLite Inference
The tightly cropped face is resized to `112x112` pixels, converted to a ByteBuffer, and normalized to values between `[-1, 1]`. 
It is fed into the `MobileFaceNet.tflite` model, which spits out a **192-Dimensional Array** (a biometric vector mathematically representing the uniqueness of the face).
Finally, we apply **L2-Normalization** to the array, plotting the vector perfectly onto a mathematical hypersphere. This allows us to use ultra-fast Cosine Similarity for matching.

---

## 5. Offline Storage & Mathematical Matching

**Where it happens:** `src/NHAIFaceSDK.js` & `src/services/localStorage.js`

### Enrollment
When a user enrolls, their 192-D vector is serialized into a JSON string and saved into `react-native-sqlite-storage` under their `Employee_ID`.

### Verification (Cosine Similarity)
When a user tries to verify, the system generates their *current* 192-D vector. We then pull all enrolled vectors from SQLite.
To compare them, we calculate the **Dot Product** (Cosine Similarity) between the vectors. 
* A perfect match is `1.0`. 
* Completely different faces score `< 0.2`.
* We set our strict **MATCH Threshold to 0.55**. If the highest dot product in the database is $\ge 0.55$, the SDK returns `MATCH` and logs the attendance.

---

## 6. The User Interface (Glassmorphism UI)

**Where it happens:** `src/screens/EnrollScreen.js` & `src/screens/VerifyScreen.js`

We designed a premium, modern interface leveraging **Glassmorphism** (translucent backgrounds with slight blur/opacity) overlaying the live camera feed. 
* **EnrollScreen:** Guides the user through entering their details and scanning their face. Features a spinning DNA loading animation during the "Biometric Audit".
* **VerifyScreen:** Instantly scans the face. If a Spoof is detected, it renders a bold red warning card. If verified, it displays the employee's name, ID, match confidence percentage, and micro-second processing benchmarks in a clean green overlay.

---

## 7. AWS Sync & Purge (Network Awareness)

**Where it happens:** Scope planned via `@react-native-community/netinfo`

The SDK operates in a fully disconnected environment. To ensure scalability:
1. Every verification event is appended to a local `attendance_logs` SQLite table.
2. The app listens for OS network events.
3. Upon detecting a stable internet connection, it scoops the logs, JSON stringifies them, and transmits them to an AWS REST endpoint.
4. Upon successful HTTP 200 response, it executes an `SQL DELETE` command to purge the local logs, ensuring compliance with strict data retention and edge-storage policies.
