package com.nhaifaceid

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.*
import org.tensorflow.lite.Interpreter
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.sqrt

/**
 * Native Kotlin module for face recognition using MobileFaceNet TFLite.
 *
 * This replaces the broken react-native-fast-tflite JavaScript approach
 * with a rock-solid native implementation using TensorFlow Lite Android SDK.
 *
 * Input:  112x112x3 RGB image (normalized to [-1, 1])
 * Output: 192-D L2-normalized face embedding
 */
class FaceRecognitionModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "FaceRecognitionModule"
        private const val MODEL_FILE = "MobileFaceNet.tflite"
        private const val INPUT_SIZE = 112
        private const val EMBEDDING_DIM = 192
    }

    private var interpreter: Interpreter? = null
    private var isInitialized = false

    override fun getName(): String = "FaceRecognitionModule"

    /**
     * Initialize the TFLite interpreter with MobileFaceNet model.
     * Called once from JS during app startup.
     */
    @ReactMethod
    fun initialize(promise: Promise) {
        try {
            if (isInitialized && interpreter != null) {
                promise.resolve("Already initialized")
                return
            }

            val startTime = System.currentTimeMillis()

            // Load model from assets (bundled via Metro as an asset)
            val modelBuffer = loadModelFromAssets(reactApplicationContext)
            if (modelBuffer == null) {
                promise.reject("MODEL_ERROR", "Failed to load MobileFaceNet.tflite from assets")
                return
            }

            // Create TFLite interpreter with GPU delegate if available
            val options = Interpreter.Options().apply {
                setNumThreads(4)
                // GPU delegate would go here for production
            }

            interpreter = Interpreter(modelBuffer, options)
            isInitialized = true

            val elapsed = System.currentTimeMillis() - startTime
            Log.i(TAG, "MobileFaceNet TFLite initialized in ${elapsed}ms")
            promise.resolve("MobileFaceNet initialized in ${elapsed}ms")
        } catch (e: Exception) {
            Log.e(TAG, "Initialization failed", e)
            promise.reject("INIT_ERROR", "TFLite initialization failed: ${e.message}", e)
        }
    }

    /**
     * Generate a 128-D face embedding from a base64-encoded JPEG image and bounding box.
     *
     * @param imageBase64 Base64-encoded JPEG image
     * @param x Normalized bounding box x (0-1)
     * @param y Normalized bounding box y (0-1)
     * @param w Normalized bounding box width (0-1)
     * @param h Normalized bounding box height (0-1)
     */
    @ReactMethod
    fun generateEmbedding(imageBase64: String, x: Double, y: Double, w: Double, h: Double, promise: Promise) {
        try {
            if (!isInitialized || interpreter == null) {
                promise.reject("NOT_INITIALIZED", "Call initialize() first")
                return
            }

            val startTime = System.currentTimeMillis()

            // 1. Decode base64 to Bitmap
            val imageBytes = Base64.decode(imageBase64, Base64.DEFAULT)
            val fullBitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.size)
            if (fullBitmap == null) {
                promise.reject("DECODE_ERROR", "Failed to decode image from base64")
                return
            }

            // 2. Crop face region from bitmap using normalized bbox
            val cropX = (x * fullBitmap.width).toInt().coerceIn(0, fullBitmap.width - 1)
            val cropY = (y * fullBitmap.height).toInt().coerceIn(0, fullBitmap.height - 1)
            val cropW = (w * fullBitmap.width).toInt().coerceIn(1, fullBitmap.width - cropX)
            val cropH = (h * fullBitmap.height).toInt().coerceIn(1, fullBitmap.height - cropY)

            val croppedBitmap = Bitmap.createBitmap(fullBitmap, cropX, cropY, cropW, cropH)

            // 3. Resize to 112x112
            val resizedBitmap = Bitmap.createScaledBitmap(croppedBitmap, INPUT_SIZE, INPUT_SIZE, true)

            // 4. Convert to float buffer normalized to [-1, 1]
            val inputBuffer = bitmapToInputBuffer(resizedBitmap)

            // 5. Run inference
            val outputArray = Array(1) { FloatArray(EMBEDDING_DIM) }
            interpreter!!.run(inputBuffer, outputArray)

            // 6. L2-normalize the embedding
            val rawEmbedding = outputArray[0]
            val normalized = l2Normalize(rawEmbedding)

            // 7. Convert to WritableArray for React Native
            val result = Arguments.createArray()
            for (v in normalized) {
                result.pushDouble(v.toDouble())
            }

            // Cleanup
            if (croppedBitmap != fullBitmap) croppedBitmap.recycle()
            if (resizedBitmap != croppedBitmap) resizedBitmap.recycle()
            fullBitmap.recycle()

            val elapsed = System.currentTimeMillis() - startTime
            Log.i(TAG, "192-D embedding generated in ${elapsed}ms (first5: [${normalized.take(5).joinToString(", ") { "%.4f".format(it) }}])")

            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Embedding generation failed", e)
            promise.reject("INFERENCE_ERROR", "Failed to generate embedding: ${e.message}", e)
        }
    }

    /**
     * Generate embedding directly from a photo file path (no base64 needed).
     */
    @ReactMethod
    fun generateEmbeddingFromFile(filePath: String, x: Double, y: Double, w: Double, h: Double, promise: Promise) {
        try {
            if (!isInitialized || interpreter == null) {
                promise.reject("NOT_INITIALIZED", "Call initialize() first")
                return
            }

            val startTime = System.currentTimeMillis()

            // Clean file path
            val cleanPath = filePath.removePrefix("file://")
            val file = File(cleanPath)
            if (!file.exists()) {
                promise.reject("FILE_ERROR", "Photo file not found: $cleanPath")
                return
            }

            val fullBitmap = BitmapFactory.decodeFile(cleanPath)
            if (fullBitmap == null) {
                promise.reject("DECODE_ERROR", "Failed to decode image file: $cleanPath")
                return
            }

            // Crop face region
            val cropX = (x * fullBitmap.width).toInt().coerceIn(0, fullBitmap.width - 1)
            val cropY = (y * fullBitmap.height).toInt().coerceIn(0, fullBitmap.height - 1)
            val cropW = (w * fullBitmap.width).toInt().coerceIn(1, fullBitmap.width - cropX)
            val cropH = (h * fullBitmap.height).toInt().coerceIn(1, fullBitmap.height - cropY)

            val croppedBitmap = Bitmap.createBitmap(fullBitmap, cropX, cropY, cropW, cropH)
            val resizedBitmap = Bitmap.createScaledBitmap(croppedBitmap, INPUT_SIZE, INPUT_SIZE, true)

            val inputBuffer = bitmapToInputBuffer(resizedBitmap)

            val outputArray = Array(1) { FloatArray(EMBEDDING_DIM) }
            interpreter!!.run(inputBuffer, outputArray)

            val normalized = l2Normalize(outputArray[0])

            val result = Arguments.createArray()
            for (v in normalized) {
                result.pushDouble(v.toDouble())
            }

            if (croppedBitmap != fullBitmap) croppedBitmap.recycle()
            if (resizedBitmap != croppedBitmap) resizedBitmap.recycle()
            fullBitmap.recycle()

            val elapsed = System.currentTimeMillis() - startTime
            Log.i(TAG, "192-D embedding from file in ${elapsed}ms (first5: [${normalized.take(5).joinToString(", ") { "%.4f".format(it) }}])")

            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Embedding from file failed", e)
            promise.reject("INFERENCE_ERROR", "Failed to generate embedding from file: ${e.message}", e)
        }
    }

    /**
     * Compute cosine similarity between two embeddings.
     */
    @ReactMethod
    fun cosineSimilarity(embedding1: ReadableArray, embedding2: ReadableArray, promise: Promise) {
        try {
            if (embedding1.size() != embedding2.size()) {
                promise.reject("DIM_MISMATCH", "Embedding dimensions don't match: ${embedding1.size()} vs ${embedding2.size()}")
                return
            }

            var dotProduct = 0.0
            var norm1 = 0.0
            var norm2 = 0.0

            for (i in 0 until embedding1.size()) {
                val a = embedding1.getDouble(i)
                val b = embedding2.getDouble(i)
                dotProduct += a * b
                norm1 += a * a
                norm2 += b * b
            }

            val similarity = if (norm1 > 0 && norm2 > 0) {
                dotProduct / (sqrt(norm1) * sqrt(norm2))
            } else {
                0.0
            }

            promise.resolve(similarity)
        } catch (e: Exception) {
            promise.reject("SIMILARITY_ERROR", e.message, e)
        }
    }

    // ─────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────

    private fun loadModelFromAssets(context: Context): MappedByteBuffer? {
        // Try loading from app's cache/files directory first (downloaded via Metro dev server)
        val cachedModel = File(context.cacheDir, MODEL_FILE)
        if (cachedModel.exists() && cachedModel.length() > 100000) {
            Log.i(TAG, "Loading model from cache: ${cachedModel.absolutePath}")
            val fis = FileInputStream(cachedModel)
            val channel = fis.channel
            return channel.map(FileChannel.MapMode.READ_ONLY, 0, channel.size())
        }

        // Try loading from Android assets (production build)
        try {
            val assetFd = context.assets.openFd(MODEL_FILE)
            val fis = FileInputStream(assetFd.fileDescriptor)
            val channel = fis.channel
            return channel.map(FileChannel.MapMode.READ_ONLY, assetFd.startOffset, assetFd.declaredLength)
        } catch (e: Exception) {
            Log.w(TAG, "Model not in assets: ${e.message}")
        }

        // Try loading from the React Native bundled assets directory
        try {
            // Metro bundles .tflite files with a hashed name in the assets dir
            val assetNames = context.assets.list("") ?: emptyArray()
            val tfliteAsset = assetNames.find { it.contains("mobilefacenet", ignoreCase = true) && it.endsWith(".tflite") }
            if (tfliteAsset != null) {
                val assetFd = context.assets.openFd(tfliteAsset)
                val fis = FileInputStream(assetFd.fileDescriptor)
                val channel = fis.channel
                return channel.map(FileChannel.MapMode.READ_ONLY, assetFd.startOffset, assetFd.declaredLength)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not search assets: ${e.message}")
        }

        // Try raw resources or files directory
        val filesModel = File(context.filesDir, MODEL_FILE)
        if (filesModel.exists()) {
            val fis = FileInputStream(filesModel)
            val channel = fis.channel
            return channel.map(FileChannel.MapMode.READ_ONLY, 0, channel.size())
        }

        Log.e(TAG, "MobileFaceNet.tflite not found in any location!")
        return null
    }

    /**
     * Converts a Bitmap to a ByteBuffer normalized to [-1, 1] for MobileFaceNet.
     * Layout: NHWC [1, 112, 112, 3]
     */
    private fun bitmapToInputBuffer(bitmap: Bitmap): ByteBuffer {
        val buffer = ByteBuffer.allocateDirect(1 * INPUT_SIZE * INPUT_SIZE * 3 * 4) // float32
        buffer.order(ByteOrder.nativeOrder())

        val pixels = IntArray(INPUT_SIZE * INPUT_SIZE)
        bitmap.getPixels(pixels, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)

        for (pixel in pixels) {
            // Extract RGB channels and normalize to [-1, 1]
            val r = ((pixel shr 16) and 0xFF) / 127.5f - 1.0f
            val g = ((pixel shr 8) and 0xFF) / 127.5f - 1.0f
            val b = (pixel and 0xFF) / 127.5f - 1.0f
            buffer.putFloat(r)
            buffer.putFloat(g)
            buffer.putFloat(b)
        }

        buffer.rewind()
        return buffer
    }

    /**
     * L2-normalizes a float array so cosine similarity = dot product.
     */
    private fun l2Normalize(vec: FloatArray): FloatArray {
        val squaredSum = vec.fold(0.0f) { acc, v -> acc + v * v }
        val norm = sqrt(squaredSum)
        return if (norm > 0) {
            FloatArray(vec.size) { vec[it] / norm }
        } else {
            vec
        }
    }
}
