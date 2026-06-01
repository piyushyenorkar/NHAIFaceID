# NHAIFaceID SDK - API Reference

This document outlines the public API for the **NHAIFaceID SDK** to be integrated into NHAI Datalake 3.0.

## Core Initialization

### `NHAIFaceSDK.initialize()`
Initializes the offline SQLite database, warms up the TensorFlow Lite models into memory, and prepares the AWS background sync queue.
- **Returns:** `Promise<boolean>`

## Face Enrollment

### `NHAIFaceSDK.enrollFace(imageData, name)`
Extracts a high-quality 128-d embedding vector from the user's face and securely stores it in the local offline SQLite database.
- **Parameters:**
  - `imageData` (String): Base64 encoded image or local file URI from the camera.
  - `name` (String): The NHAI employee or contractor's name.
- **Returns:** `Promise<{ success: boolean, message: string }>`

## Face Verification

### `NHAIFaceSDK.verifyFace(imageData)`
Compares the live face against all enrolled faces in the offline database using optimized cosine similarity math. Must complete in under 1000ms.
- **Parameters:**
  - `imageData` (String): Base64 encoded image or local file URI.
- **Returns:** `Promise<{ match: boolean, confidence: number, matchedName: string | null }>`

## Liveness Detection

### `NHAIFaceSDK.checkLiveness(videoStream)`
Evaluates Eye Aspect Ratio (EAR) and head movement vectors to ensure the subject is a live human and not a 2D photograph.
- **Returns:** `Promise<{ isLive: boolean, score: number }>`

## Offline Sync

### `AWSSyncManager.forceSync()`
Forces the SDK to immediately attempt to upload all pending offline verification logs to the NHAI AWS Datalake.
- **Returns:** `Promise<void>`
