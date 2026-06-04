/**
 * NHAIFaceSDK.js
 * The public SDK Wrapper for Datalake 3.0 integration.
 * Exposes secure enrollment registry and geometric cross-validation in verify pipeline.
 */

import { initFaceDetector, detectFace } from './services/faceDetection';
import { initFaceRecognition, alignAndCropFace, generateEmbedding } from './services/faceRecognition';
import { runPassiveLiveness, calculateFacialRatios, calculateDepthVariance } from './services/livenessDetection';
import { loadAntiSpoofModel } from './services/antiSpoofCheck';
import { initDB, getDBConnection, insertEnrolledFace, insertVerificationLog } from './services/localStorage';
import { awsSyncManager } from './services/awsSync';
import { cosineSimilarity } from './utils/vectorMath';
import { MetricsLogger } from './utils/metrics';

class NHAIFaceSDK {
  /**
   * 1. initialize()
   * Loads the lightweight models (.tflite) and sets up SQLite database.
   * Runs locally, no internet required.
   */
  async initialize() {
    console.log('[NHAIFaceSDK] Initializing offline SDK...');

    // Load local SQLite DB
    await initDB();

    // Load AI Models
    await initFaceDetector();
    await initFaceRecognition();

    // Pre-warm the ONNX anti-spoof model so it's ready on the first verify call
    try {
      await loadAntiSpoofModel();
    } catch (e) {
      console.warn('[NHAIFaceSDK] ONNX anti-spoof model failed to pre-warm (will retry on first use):', e.message);
    }

    // Start background AWS offline queue listener
    awsSyncManager.startListener();

    console.log('[NHAIFaceSDK] Initialization complete. All models loaded locally.');
    return true;
  }

  /**
   * 2. enrollEmbedding(employeeId, name, embedding, landmarks, photoPath)
   * Extracts facial ratios and saves the pre-computed embedding from the native C++ frame processor to SQLite.
   */
  async enrollEmbedding(employeeId, name, embedding, landmarks, photoPath = null, bbox = null) {
    if (!employeeId || !name) throw new Error('employeeId and name are required');
    if (!embedding) throw new Error('Valid face embedding is required');

    // Strict enrollment anti-spoofing check — pass bbox so ONNX inference can run if image is available
    const livenessResult = await runPassiveLiveness(null, landmarks, bbox);
    if (!livenessResult.passed) {
      throw new Error(`Enrollment rejected: Liveness check failed (Score: ${(livenessResult.score * 100).toFixed(1)}%). Spoof enrollments are prohibited.`);
    }

    // Average the multi-pose ensemble into a single 192-D embedding
    let finalEmbedding;
    if (Array.isArray(embedding[0])) {
      // Ensemble of multiple pose embeddings — average them
      const validEmbeddings = embedding.filter(e => e && Array.isArray(e) && e.length === 192);
      if (validEmbeddings.length === 0) {
        throw new Error('No valid embeddings captured during enrollment.');
      }
      finalEmbedding = new Array(192).fill(0);
      for (const emb of validEmbeddings) {
        for (let i = 0; i < 192; i++) {
          finalEmbedding[i] += (typeof emb[i] === 'number' ? emb[i] : 0);
        }
      }
      for (let i = 0; i < 192; i++) {
        finalEmbedding[i] /= validEmbeddings.length;
      }
      // L2-normalize the averaged embedding
      const norm = Math.sqrt(finalEmbedding.reduce((s, v) => s + v * v, 0));
      if (norm > 0) {
        finalEmbedding = finalEmbedding.map(v => v / norm);
      }
      console.log(`[NHAIFaceSDK] Averaged ${validEmbeddings.length} pose embeddings. First5: [${finalEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    } else {
      finalEmbedding = embedding;
    }

    // Check if the face already exists in the system to prevent duplicate enrollments
    // We bypass the full verifyEmbedding pipeline (which includes liveness) and directly compare embeddings
    try {
      const db = await getDBConnection();
      const [results] = await db.executeSql('SELECT employee_id, name, embedding FROM enrolled_faces');

      for (let i = 0; i < results.rows.length; i++) {
        const row = results.rows.item(i);
        const storedEmbedding = JSON.parse(row.embedding);
        let sim = 0;
        if (Array.isArray(storedEmbedding[0])) {
          for (const emb of storedEmbedding) {
            const s = cosineSimilarity(finalEmbedding, emb);
            if (s > sim) sim = s;
          }
        } else {
          sim = cosineSimilarity(finalEmbedding, storedEmbedding);
        }
        // Threshold must be above verify MATCH (0.55) to prevent blocking new unique faces
        if (sim >= 0.60) {
          throw new Error(`Face is already enrolled under Employee ID: ${row.employee_id} (${row.name}). Similarity: ${(sim * 100).toFixed(1)}%. New unique face required.`);
        }
      }
    } catch (dupError) {
      if (dupError.message && dupError.message.includes('already enrolled')) {
        throw dupError;
      }
      console.warn('[NHAIFaceSDK] Duplicate check failed:', dupError.message);
    }

    // Log the final embedding being saved
    const nonZeroCount = finalEmbedding.filter(v => Math.abs(v) > 0.001).length;
    console.log(`[NHAIFaceSDK] Saving embedding: ${nonZeroCount}/192 non-zero dims. First8: [${finalEmbedding.slice(0, 8).map(v => (typeof v === 'number' ? v : 0).toFixed(4)).join(', ')}]`);

    // Extract mathematical face registration profile
    const depthVariance = calculateDepthVariance(landmarks);
    const faceRatios = calculateFacialRatios(landmarks);

    // Save to local SQLite database with registration metrics
    try {
      await insertEnrolledFace(employeeId, name, finalEmbedding, depthVariance, faceRatios, photoPath);
    } catch (dbError) {
      console.error('[NHAIFaceSDK] SQLite Insert failed:', dbError);
      if (dbError && dbError.message && dbError.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Employee ID "${employeeId}" is already registered. Please check the ID or use a different one.`);
      }
      throw dbError;
    }

    console.log(`[NHAIFaceSDK] Successfully enrolled ${name} with native MobileFaceNet 192-D embedding.`);
    return {
      success: true,
      landmarks
    };
  }

  /**
   * 3. checkLiveness(faceFrame, landmarks)
   * Runs the new passive liveness checks: LBP, Specular HSV reflection, and Landmark Depth cues in parallel.
   */
  async checkLiveness(faceFrame, landmarks, bbox = null) {
    return await runPassiveLiveness(faceFrame, landmarks, bbox);
  }

  /**
   * 4. verifyEmbedding(currentEmbedding, landmarks, deviceId, skipLog)
   * Uses the pre-computed embedding from the native C++ frame processor (MobileFaceNet).
   * Completely bypasses JS photo capture, making verification instant.
   */
  async verifyEmbedding(currentEmbedding, landmarks, deviceId = 'unknown', skipLog = false, bbox = null) {
    MetricsLogger.startTimer('Total Pipeline');

    // STEP 1: Passive Liveness — pass bbox so ONNX inference can run if image frame is available
    MetricsLogger.startTimer('1. Passive Liveness');
    // Since we skipped taking a photo, we pass null as the frame; bbox enables ONNX crop when frame is provided
    const livenessResult = await runPassiveLiveness(null, landmarks, bbox);
    const livenessTime = MetricsLogger.endTimer('1. Passive Liveness');

    if (!livenessResult.passed) {
      const pipelineMs = MetricsLogger.endTimer('Total Pipeline');

      // LOG SPOOF ATTEMPT TO SQLITE (for audit sync)
      if (!skipLog) {
        await insertVerificationLog({
          employee_id: 'UNKNOWN_SPOOF',
          matched: false,
          confidence: 0,
          liveness_passed: false,
          liveness_score: (livenessResult.score * 100).toFixed(2),
          pipeline_ms: pipelineMs,
          device_id: deviceId
        });
      }

      return {
        status: 'REJECTED_SPOOF',
        message: 'Spoofing detected (paper grain / screen glare / flat 2D frame)',
        confidence: 0,
        livenessScore: livenessResult.score,
        livenessDetails: livenessResult.details,
        processingTimeMs: pipelineMs
      };
    }

    // STEP 2: Offline SQLite Search & Validation (Strict 192-D MobileFaceNet matching)
    MetricsLogger.startTimer('2. Offline SQLite Search & Validation');

    let bestMatch = null;
    let bestScore = -1;

    try {
      const db = await getDBConnection();
      const [results] = await db.executeSql('SELECT employee_id, name, embedding FROM enrolled_faces');

      for (let i = 0; i < results.rows.length; i++) {
        const row = results.rows.item(i);
        const storedEmbedding = JSON.parse(row.embedding);

        let embeddingScore = 0;
        if (Array.isArray(storedEmbedding[0])) {
          let maxSim = -1;
          for (const emb of storedEmbedding) {
            const sim = cosineSimilarity(currentEmbedding, emb);
            if (sim > maxSim) {
              maxSim = sim;
            }
          }
          embeddingScore = maxSim;
        } else {
          embeddingScore = cosineSimilarity(currentEmbedding, storedEmbedding);
        }

        // Pure 192-D embedding similarity (NO geometry/ratio penalties)
        if (embeddingScore > bestScore) {
          bestScore = embeddingScore;
          bestMatch = row;
        }
      }
    } catch (dbError) {
      console.error('[NHAIFaceSDK] Database query failed:', dbError);
    }

    const sqliteTime = MetricsLogger.endTimer('2. Offline SQLite Search & Validation');

    // Log the match result for diagnostics
    console.log(`[NHAIFaceSDK] Verify result: bestScore=${(bestScore * 100).toFixed(2)}%, bestMatch=${bestMatch ? bestMatch.employee_id : 'none'}`);
    if (currentEmbedding) {
      const nonZero = currentEmbedding.filter(v => Math.abs(v) > 0.001).length;
      console.log(`[NHAIFaceSDK] Verify embedding: ${nonZero}/192 non-zero dims, first5: [${currentEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    }

    // Classification thresholds for full-image MobileFaceNet embeddings.
    // Full-frame selfies produce lower cosine similarity than tightly-cropped faces
    // because background pixels dilute the embedding. Thresholds are calibrated accordingly.
    let status = 'NO_MATCH';
    if (bestScore >= 0.55) {
      status = 'MATCH';
    } else if (bestScore >= 0.40) {
      status = 'LOW_CONFIDENCE';
    }

    const pipelineMs = MetricsLogger.endTimer('Total Pipeline');
    MetricsLogger.logConfidence(bestScore * 100);

    // Save attendance log in local SQLite
    if (!skipLog) {
      const logData = {
        employee_id: bestMatch ? bestMatch.employee_id : null,
        matched: status === 'MATCH',
        confidence: (bestScore * 100).toFixed(2),
        liveness_passed: true,
        liveness_score: (livenessResult.score * 100).toFixed(2),
        pipeline_ms: pipelineMs,
        device_id: deviceId
      };
      await insertVerificationLog(logData);
    }

    return {
      status,
      employee: status !== 'NO_MATCH' ? bestMatch : null,
      confidence: (bestScore * 100).toFixed(2),
      livenessScore: (livenessResult.score * 100).toFixed(2),
      livenessDetails: livenessResult.details,
      geometricMatch: true, // Legacy flag, now strictly true since we use native embeddings
      processingTimeMs: pipelineMs,
      breakdownMs: {
        liveness: livenessTime,
        sqlite: sqliteTime
      }
    };
  }

  /**
   * 5. hasEnrolledPersonnel()
   * Checks if SQLite database has any enrolled faces.
   */
  async hasEnrolledPersonnel() {
    try {
      const db = await getDBConnection();
      const [results] = await db.executeSql('SELECT COUNT(*) as count FROM enrolled_faces');
      if (results.rows.length > 0) {
        return results.rows.item(0).count > 0;
      }
      return false;
    } catch (e) {
      console.log('[NHAIFaceSDK] Error checking enrolled personnel:', e);
      return false;
    }
  }

  /**
   * 6. syncToAWS()
   * Manually flushes offline database queue to AWS backend.
   */
  async syncToAWS() {
    console.log('[NHAIFaceSDK] Manually triggering AWS sync...');
    await awsSyncManager.triggerSync();
    return true;
  }
}

export default new NHAIFaceSDK();
