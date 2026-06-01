/**
 * faceDetection.js
 * Wraps MediaPipe Face Detection to extract a single bounding box from a camera frame.
 * Target execution time: < 200ms
 */

import * as tf from '@tensorflow/tfjs';
import * as faceDetection from '@tensorflow-models/face-detection';

let detector = null;

/**
 * Initializes the face detection model.
 * Uses the short-range model which is ~2MB and optimized for faces < 2m from the camera.
 * @returns {Promise<boolean>} True if initialized successfully
 */
export async function initFaceDetector() {
  try {
    const start = Date.now();
    await tf.ready();
    
    const model = faceDetection.SupportedModels.MediaPipeFaceDetector;
    const detectorConfig = {
      runtime: 'tfjs',
      modelType: 'short', // Uses the short_range model
      maxFaces: 1 // We only want to authenticate one person at a time
    };
    
    detector = await faceDetection.createDetector(model, detectorConfig);
    const end = Date.now();
    console.log(`[Metrics] Face Detector initialized in ${end - start}ms`);
    return true;
  } catch (error) {
    console.error('Failed to initialize Face Detector:', error);
    return false;
  }
}

/**
 * Detects a face in the given image tensor/element.
 * @param {tf.Tensor3D | ImageData | HTMLImageElement} image - The camera frame
 * @returns {Promise<Object>} { detected: bool, bbox: {x,y,w,h}, landmarks: array, multipleFaces: bool }
 */
export async function detectFace(image) {
  if (!detector) {
    throw new Error('Face detector is not initialized. Call initFaceDetector() first.');
  }

  const start = Date.now();
  
  try {
    const faces = await detector.estimateFaces(image, { flipHorizontal: false });
    const end = Date.now();
    console.log(`[Metrics] Face detection completed in ${end - start}ms`);
    
    // We strictly enforce 1 face. If >1, we flag it for the Camera UI to reject
    if (faces.length > 1) {
      return { detected: false, bbox: null, landmarks: [], multipleFaces: true };
    }

    if (faces.length === 0) {
      return { detected: false, bbox: null, landmarks: [], multipleFaces: false };
    }

    const face = faces[0];
    
    return {
      detected: true,
      multipleFaces: false,
      bbox: {
        x: face.box.xMin,
        y: face.box.yMin,
        w: face.box.width,
        h: face.box.height
      },
      landmarks: face.keypoints || []
    };
    
  } catch (error) {
    console.error('Error during face detection:', error);
    return { detected: false, bbox: null, landmarks: [], multipleFaces: false };
  }
}
