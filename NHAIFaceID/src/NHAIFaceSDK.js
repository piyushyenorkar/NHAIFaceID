/**
 * NHAIFaceSDK.js
 * The public SDK Wrapper for Datalake 3.0 integration.
 * Exposes secure enrollment registry and geometric cross-validation in verify pipeline.
 */

import { initFaceDetector, detectFace } from './services/faceDetection';
import { initFaceRecognition, alignAndCropFace, generateEmbedding } from './services/faceRecognition';
import { runPassiveLiveness, calculateFacialRatios, calculateDepthVariance } from './services/livenessDetection';
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

    // Start background AWS offline queue listener
    awsSyncManager.startListener();

    console.log('[NHAIFaceSDK] Initialization complete. All models loaded locally.');
    return true;
  }

  /**
   * 2. enrollEmbedding(employeeId, name, embedding, landmarks, photoPath)
   * Extracts facial ratios and saves the pre-computed embedding from the native C++ frame processor to SQLite.
   */
  async enrollEmbedding(employeeId, name, embedding, landmarks, photoPath = null) {
    if (!employeeId || !name) throw new Error('employeeId and name are required');
    if (!embedding) throw new Error('Valid face embedding is required');

    // Strict enrollment anti-spoofing check
    const livenessResult = await runPassiveLiveness(null, landmarks, null);
    if (!livenessResult.passed) {
      throw new Error(`Enrollment rejected: Liveness check failed (Score: ${(livenessResult.score * 100).toFixed(1)}%). Spoof enrollments are prohibited.`);
    }

    // Check if the face already exists in the system to prevent duplicate enrollments
    // Threshold is set to 0.80 (high confidence) to avoid false positives from
    // landmark-geometry-based embeddings where similar camera framing can produce similar vectors.
    const dupCheck = await this.verifyEmbedding(embedding, landmarks, 'enrollment_check', true);
    if (dupCheck.status === 'MATCH' && parseFloat(dupCheck.confidence) > 80) {
      throw new Error(`Face is already enrolled under Employee ID: ${dupCheck.employee?.employee_id || 'Unknown'} (${dupCheck.employee?.name || 'Unknown'}). New unique face required.`);
    }

    // Extract mathematical face registration profile
    const depthVariance = calculateDepthVariance(landmarks);
    const faceRatios = calculateFacialRatios(landmarks);

    // Save to local SQLite database with registration metrics
    try {
      await insertEnrolledFace(employeeId, name, embedding, depthVariance, faceRatios, photoPath);
    } catch (dbError) {
      console.error('[NHAIFaceSDK] SQLite Insert failed:', dbError);
      if (dbError && dbError.message && dbError.message.includes('UNIQUE constraint failed')) {
        throw new Error(`Employee ID "${employeeId}" is already registered. Please check the ID or use a different one.`);
      }
      throw dbError;
    }
    
    console.log(`[NHAIFaceSDK] Successfully enrolled ${name} offline with geometric ratios.`);
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
  async verifyEmbedding(currentEmbedding, landmarks, deviceId = 'unknown', skipLog = false) {
    MetricsLogger.startTimer('Total Pipeline');
    
    // STEP 1: Passive Liveness
    MetricsLogger.startTimer('1. Passive Liveness');
    // Since we skipped taking a photo, we pass null to use coordinate/depth based liveness
    const livenessResult = await runPassiveLiveness(null, landmarks, null);
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

    // STEP 2: SQLite Search & Validation
    MetricsLogger.startTimer('2. Offline SQLite Search & Validation');
    const currentRatios = calculateFacialRatios(landmarks);
    
    let bestMatch = null;
    let bestScore = -1;
    let geoMismatchOccurred = false;

    try {
      const db = await getDBConnection();
      const [results] = await db.executeSql('SELECT employee_id, name, embedding, depth_variance, face_ratios FROM enrolled_faces');
      
      for (let i = 0; i < results.rows.length; i++) {
        const row = results.rows.item(i);
        const storedEmbedding = JSON.parse(row.embedding);
        
        // 1. Calculate base embedding similarity
        const embeddingScore = cosineSimilarity(currentEmbedding, storedEmbedding);
        
        // 2. Perform geometric verification against registered template
        const storedRatios = JSON.parse(row.face_ratios || '{}');
        let ratioPenalty = 1.0;
        let isGeoMismatch = false;

        if (storedRatios.interpupillaryRatio && storedRatios.noseHeightRatio) {
          const interpupillaryDiff = Math.abs(currentRatios.interpupillaryRatio - storedRatios.interpupillaryRatio);
          const noseHeightDiff = Math.abs(currentRatios.noseHeightRatio - storedRatios.noseHeightRatio);

          const interpupillaryError = interpupillaryDiff / storedRatios.interpupillaryRatio;
          const noseHeightError = noseHeightDiff / storedRatios.noseHeightRatio;

          // If ratios deviate by > 15%, apply a severe structural mismatch penalty
          if (interpupillaryError > 0.15 || noseHeightError > 0.15) {
            ratioPenalty = 0.40; // High penalty
            isGeoMismatch = true;
          }
        }

        const score = embeddingScore * ratioPenalty;

        if (score > bestScore) {
          bestScore = score;
          bestMatch = row;
          geoMismatchOccurred = isGeoMismatch;
        }
      }
    } catch (dbError) {
      console.error('[NHAIFaceSDK] Database query failed:', dbError);
    }

    const sqliteTime = MetricsLogger.endTimer('2. Offline SQLite Search & Validation');

    // Classification threshold:
    // MobileFaceNet native cosine similarity is generally lower than TFJS. Adjusting threshold.
    let status = 'NO_MATCH';
    if (bestScore > 0.70) {
      status = 'MATCH';
    } else if (bestScore >= 0.55) {
      status = 'LOW_CONFIDENCE';
    }

    if (geoMismatchOccurred && status === 'MATCH') {
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
      geometricMatch: !geoMismatchOccurred,
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
