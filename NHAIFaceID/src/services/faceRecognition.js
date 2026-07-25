/**
 * faceRecognition.js
 * 
 * PRIMARY PATH: Native Kotlin MobileFaceNet TFLite module (FaceRecognitionModule)
 * - Runs MobileFaceNet directly via TensorFlow Lite Android SDK in native Kotlin
 * - 128-D L2-normalized face embeddings
 * - ~30ms inference time on modern Android devices
 * 
 * NO FALLBACK: If the native module or image is unavailable, an error is returned.
 * We do NOT fake embeddings with geometric hashes.
 */

import { NativeModules } from 'react-native';

const { FaceRecognitionModule } = NativeModules;

// Track initialization state
let isNativeModuleReady = false;

/**
 * Initializes the native MobileFaceNet TFLite model.
 * Called once from NHAIFaceSDK.initialize().
 * @returns {Promise<boolean>}
 */
export async function initFaceRecognition() {
  const start = Date.now();
  try {
    if (!FaceRecognitionModule) {
      console.error('[FaceRecognition] FATAL: Native FaceRecognitionModule not found. Did you rebuild the Android app?');
      return false;
    }

    const result = await FaceRecognitionModule.initialize();
    isNativeModuleReady = true;
    console.log(`[Metrics] ${result} (total init: ${Date.now() - start}ms)`);
    return true;
  } catch (error) {
    console.error('[FaceRecognition] Native module initialization failed:', error.message);
    isNativeModuleReady = false;
    return false;
  }
}

/**
 * Reads the captured photo from disk and returns a descriptor object.
 * 
 * @param {object} image   - { path: 'file:///...' }  (local file URI)
 * @param {object} bbox    - Normalized face bounding box { x, y, w, h }
 * @param {object} [landmarks] - Raw landmark array (unused in native path, kept for API compat)
 * @returns {Promise<object>}
 */
export async function alignAndCropFace(image, bbox, landmarks = null) {
  const start = Date.now();

  // We only need the file path — the native module handles cropping and resizing
  const photoPath = image?.path || null;

  console.log(
    `[Metrics] Face alignment prep completed in ${Date.now() - start}ms (path: ${photoPath ? 'yes' : 'no'})`
  );

  return {
    photoPath,
    originalBbox: bbox || { x: 0, y: 0, w: 1, h: 1 },
    landmarks,
  };
}

/**
 * Generates a REAL 128-dimensional L2-normalized face embedding using 
 * the native MobileFaceNet TFLite model.
 * 
 * NO FALLBACK. If the model or image is unavailable, returns null with an error log.
 *
 * @param {object} croppedFace - Result of alignAndCropFace()
 * @returns {Promise<number[] | null>}
 */
export async function generateEmbedding(croppedFace) {
  const start = Date.now();

  if (!isNativeModuleReady) {
    console.warn('[FaceRecognition] Native module not ready yet, attempting to initialize...');
    const initialized = await initFaceRecognition();
    if (!initialized) {
      console.error('[FaceRecognition] Cannot generate embedding: native module failed to initialize');
      return null;
    }
  }

  if (!FaceRecognitionModule) {
    console.error('[FaceRecognition] Cannot generate embedding: native module missing');
    return null;
  }

  const photoPath = croppedFace?.photoPath;
  const bbox = croppedFace?.originalBbox || { x: 0, y: 0, w: 1, h: 1 };

  if (!photoPath) {
    console.error('[FaceRecognition] Cannot generate embedding: no photo path provided. Real image data is required.');
    return null;
  }

  try {
    // Use FULL IMAGE — the bbox from MLKit's frame processor runs on a different
    // resolution/timing/coordinate space than takePhoto(), so mapping coordinates
    // between them is unreliable. The Kotlin module now handles EXIF rotation,
    // ensuring the face is UPRIGHT (not sideways). MobileFaceNet resizes the full
    // frame to 112x112, which naturally centers the face since the user is guided
    // by the on-screen oval.
    const embeddingArray = await FaceRecognitionModule.generateEmbeddingFromFile(
      photoPath,
      0, 0, 1, 1  // full image
    );

    if (!embeddingArray || embeddingArray.length !== 192) {
      console.error(`[FaceRecognition] Native module returned invalid embedding (length: ${embeddingArray?.length})`);
      return null;
    }

    // Convert ReadableArray to JS array
    const embedding = Array.from(embeddingArray);

    const nonZero = embedding.filter(v => Math.abs(v) > 0.001).length;
    console.log(
      `[Metrics] MobileFaceNet 192-D embedding (NATIVE TFLite) generated in ${Date.now() - start}ms | ` +
      `${nonZero}/192 non-zero dims | first5: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`
    );

    return embedding;
  } catch (error) {
    console.error('[FaceRecognition] Native TFLite inference FAILED:', error.message);
    return null;
  }
}

/**
 * Computes cosine similarity between two 128-D embeddings.
 * Uses the native module for precision, with JS fallback.
 * 
 * @param {number[]} emb1 
 * @param {number[]} emb2 
 * @returns {Promise<number>} Cosine similarity in range [-1, 1]
 */
export async function computeCosineSimilarity(emb1, emb2) {
  if (!emb1 || !emb2 || emb1.length !== emb2.length) {
    return 0;
  }

  // JS implementation (fast enough for 128-D vectors)
  let dot = 0, norm1 = 0, norm2 = 0;
  for (let i = 0; i < emb1.length; i++) {
    const a = typeof emb1[i] === 'number' ? emb1[i] : 0;
    const b = typeof emb2[i] === 'number' ? emb2[i] : 0;
    dot += a * b;
    norm1 += a * a;
    norm2 += b * b;
  }

  if (norm1 === 0 || norm2 === 0) return 0;
  return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * L2-normalizes a raw vector so cosine similarity = dot product.
 * @param {number[]} vec
 * @returns {number[]}
 */
export function l2Normalize(vec) {
  const squaredSum = vec.reduce((s, v) => s + v * v, 0);
  const norm = Math.sqrt(squaredSum);
  return vec.map(v => norm > 0 ? v / norm : 0);
}
