import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, Switch, Easing, ActivityIndicator } from 'react-native';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';
import RNFS from 'react-native-fs';
import { alignAndCropFace, generateEmbedding } from '../services/faceRecognition';
import { calculateLandmarksVariance, checkPoseAngle } from '../services/livenessDetection';

export default function VerifyScreen({ navigation }) {
  const [matchStatus, setMatchStatus] = useState('SEARCHING'); // SEARCHING, MATCHED, LOW_CONFIDENCE, UNKNOWN, SPOOF_REJECTED
  const [matchData, setMatchData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedFace, setDetectedFace] = useState(null);
  const [simulateSpoof, setSimulateSpoof] = useState(false);
  
  // Scanning progress states
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Looking for face...');
  
  const cameraViewRef = useRef(null);
  const lastDetectedRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const confidenceAnim = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);
  const landmarksHistoryRef = useRef([]);
  const boxHistoryRef = useRef([]);
  const qualityReasonRef = useRef(null);

  // Processing animations
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isProcessing) {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      spinAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [isProcessing]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  useEffect(() => {
    isMountedRef.current = true;
    
    // Check if there are enrolled personnel profiles
    NHAIFaceSDK.hasEnrolledPersonnel().then(hasProfiles => {
      if (isMountedRef.current && !hasProfiles) {
        setMatchStatus('NO_ENROLLED');
      }
    });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const latestEmbeddingRef = useRef(null);
  const latestLandmarksRef = useRef(null);
  const latestBboxRef = useRef(null);

  // Called 30 times a second from CameraView
  const handleFaceDetected = (bbox, landmarks, embedding) => {
    if (matchStatus !== 'SEARCHING' || isProcessing) return;
    
    if (bbox && landmarks) {
      // Zone Check: Face should be of reasonable size, but we relax the strict centering
      // because frame dimensions can be rotated (portrait vs landscape) causing issues.
      const isCentered = true; 

      if (isCentered) {
        lastDetectedRef.current = Date.now();
        latestLandmarksRef.current = landmarks;
        latestBboxRef.current = bbox;
        
        // We only receive the embedding every ~300ms, keep the latest valid one
        if (embedding) {
          latestEmbeddingRef.current = embedding;
        }

        // Push relative landmarks to history
        if (bbox.w > 0 && bbox.h > 0) {
          const relativeLandmarks = landmarks.map(pt => ({
            x: (pt.x - bbox.x) / bbox.w,
            y: (pt.y - bbox.y) / bbox.h
          }));
          // Propagate the isSimulated flag so variance check knows if this frame is real data
          relativeLandmarks.isSimulated = landmarks.isSimulated === true;
          landmarksHistoryRef.current.push(relativeLandmarks);
          if (landmarksHistoryRef.current.length > 20) {
            landmarksHistoryRef.current.shift();
          }
        }

        // Bounding Box motion stability check
        boxHistoryRef.current.push({ x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h });
        if (boxHistoryRef.current.length > 5) {
          boxHistoryRef.current.shift();
        }

        let isMovingTooFast = false;
        if (boxHistoryRef.current.length >= 3) {
          let totalDiff = 0;
          const history = boxHistoryRef.current;
          for (let i = 1; i < history.length; i++) {
            const prevCenter = { x: history[i-1].x + history[i-1].w/2, y: history[i-1].y + history[i-1].h/2 };
            const currCenter = { x: history[i].x + history[i].w/2, y: history[i].y + history[i].h/2 };
            totalDiff += Math.sqrt(Math.pow(currCenter.x - prevCenter.x, 2) + Math.pow(currCenter.y - prevCenter.y, 2));
          }
          const avgDiff = totalDiff / (history.length - 1);
          if (avgDiff >= 0.035) {
            isMovingTooFast = true;
          }
        }

        // Pose Angle Check
        const poseResult = checkPoseAngle(landmarks);

        if (!poseResult.pass) {
          qualityReasonRef.current = 'bad_angle';
        } else if (isMovingTooFast) {
          qualityReasonRef.current = 'blurry';
        } else {
          qualityReasonRef.current = null;
        }
      }
    }
  };

  // Quick progress scanning loop for verification (400ms total for instant matching)
  useEffect(() => {
    if (matchStatus !== 'SEARCHING') {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    setProgress(0);
    setStatusMessage('Align face...');
    lastDetectedRef.current = 0;
    setDetectedFace(null);
    setIsProcessing(false);
    landmarksHistoryRef.current = []; // Clear history at start of scan
    boxHistoryRef.current = [];
    qualityReasonRef.current = null;

    progressIntervalRef.current = setInterval(() => {
      const faceDetected = Date.now() - lastDetectedRef.current < 800;

      if (faceDetected) {
        setProgress(prev => {
          if (qualityReasonRef.current) {
            setStatusMessage(
              qualityReasonRef.current === 'bad_angle'
                ? '👁 Look straight at camera'
                : '📷 Hold still — camera adjusting'
            );
            return Math.max(0, prev - 15); // Decay progress quickly if quality fails
          }

          const nextProgress = prev + 25; // 4 increments of 25 = 400ms
          
          if (nextProgress < 50) {
            setStatusMessage('Verifying liveness...');
          } else if (nextProgress < 100) {
            setStatusMessage('Matching identity...');
          } else if (nextProgress >= 100) {
            clearInterval(progressIntervalRef.current);
            if (isMountedRef.current) {
              setIsProcessing(true);
              setStatusMessage('⚙️ Audit in Progress — Analyzing liveness...');
            }
            
            // Defer execution by 100ms to allow React to paint the loading/processing states
            setTimeout(() => {
              (async () => {
                try {
                  const currentLandmarks = latestLandmarksRef.current;
                  const currentBbox = latestBboxRef.current;

                  // Calculate landmark variance over history
                  const avgVariance = calculateLandmarksVariance(landmarksHistoryRef.current);
                  console.log('[VerifyScreen] Landmark variance:', avgVariance);

                  // Skip variance spoof check if any frame used the simulated mathematical mesh
                  // (its relative-landmark positions are constant by design, giving a false zero-variance)
                  const hasSimulatedInHistory = landmarksHistoryRef.current.some(f => f.isSimulated === true);

                  // If average variance is less than 1.2e-4 across 10+ real frames, it's a rigid spoof
                  const isSpoofDetected = !hasSimulatedInHistory &&
                    landmarksHistoryRef.current.length >= 10 && avgVariance < 0.00012;

                  if (hasSimulatedInHistory) {
                    console.log('[VerifyScreen] Simulated landmarks in history — skipping variance spoof check.');
                  }

                  // Extract real 192-D embedding via native MobileFaceNet TFLite
                  let currentEmbedding = null;
                  if (cameraViewRef.current) {
                    try {
                      const photoPromise = cameraViewRef.current.capturePhoto();
                      const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Photo capture timeout')), 5000)
                      );
                      const photoPath = await Promise.race([photoPromise, timeoutPromise]);
                      if (photoPath) {
                        const cropped = await alignAndCropFace({ path: photoPath }, currentBbox, currentLandmarks);
                        currentEmbedding = await generateEmbedding(cropped);
                      }
                    } catch (photoErr) {
                      console.error('[VerifyScreen] Photo capture/embedding failed:', photoErr.message);
                    }
                  }

                  if (!currentEmbedding) {
                    setIsProcessing(false);
                    setProgress(0);
                    setMatchStatus('SEARCHING');
                    return;
                  }

                  if (currentLandmarks) {
                    currentLandmarks.isSpoof = isSpoofDetected || simulateSpoof;
                  }

                  const result = await NHAIFaceSDK.verifyEmbedding(
                    currentEmbedding, 
                    currentLandmarks, 
                    'Device_ID_Demo',
                    false,
                    currentBbox
                  );
                  if (!isMountedRef.current) return;
                  
                  let targetColor = '#dc3545';
                  if (result.status === 'MATCH') targetColor = '#28a745';
                  if (result.status === 'LOW_CONFIDENCE') targetColor = '#ffc107';

                  setDetectedFace({
                    bbox: currentBbox,
                    landmarks: currentLandmarks,
                    color: targetColor
                  });

                  if (result.status === 'REJECTED_SPOOF') {
                    setMatchData({
                      message: result.message,
                      livenessScore: result.livenessScore,
                      details: result.livenessDetails,
                      time_ms: result.processingTimeMs
                    });
                    setMatchStatus('SPOOF_REJECTED');
                  } else if (result.status === 'MATCH') {
                    setMatchData({
                      employee: result.employee,
                      confidence: result.confidence,
                      livenessScore: result.livenessScore,
                      time_ms: result.processingTimeMs,
                      breakdown: result.breakdownMs
                    });
                    setMatchStatus('MATCHED');
                    
                    Animated.timing(confidenceAnim, {
                      toValue: parseFloat(result.confidence),
                      duration: 800,
                      useNativeDriver: false
                    }).start();
                  } else if (result.status === 'LOW_CONFIDENCE') {
                    setMatchData({
                      employee: result.employee,
                      confidence: result.confidence,
                      livenessScore: result.livenessScore,
                      time_ms: result.processingTimeMs,
                      breakdown: result.breakdownMs
                    });
                    setMatchStatus('LOW_CONFIDENCE');
                    
                    Animated.timing(confidenceAnim, {
                      toValue: parseFloat(result.confidence),
                      duration: 800,
                      useNativeDriver: false
                    }).start();
                      } else if (result.status === 'NO_FACE') {
                        setMatchData({
                          message: 'No face detected in captured frame. Please verify that the camera lens is clear.'
                        });
                        setMatchStatus('UNKNOWN');
                      } else {
                        setMatchData({
                          message: 'No face matched in offline database.'
                        });
                        setMatchStatus('UNKNOWN');
                      }
                } catch (err) {
                  console.error('[VerifyScreen] Verification error:', err);
                  if (isMountedRef.current) {
                    setMatchData({ message: err.message || 'Verification pipeline error' });
                    setMatchStatus('UNKNOWN');
                  }
                } finally {
                  if (isMountedRef.current) {
                    setIsProcessing(false);
                  }
                }
              })();
            }, 100);
            return 100;
          }
          return nextProgress;
        });
      } else {
        setStatusMessage('Align face inside Guides...');
        setProgress(prev => Math.max(0, prev - 25)); // decay if face lost
      }
    }, 100);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [matchStatus]);

  const resetSearch = () => {
    setMatchData(null);
    setMatchStatus('SEARCHING');
    setIsProcessing(false);
    setDetectedFace(null);
    confidenceAnim.setValue(0);
  };

  const logAttendance = () => {
    navigation.navigate('Home');
  };

  // Border color based on status
  let borderColor = 'transparent';
  if (matchStatus === 'MATCHED') borderColor = '#10B981';
  if (matchStatus === 'LOW_CONFIDENCE') borderColor = '#F59E0B';
  if (matchStatus === 'SPOOF_REJECTED') borderColor = '#EF4444';
  if (matchStatus === 'UNKNOWN') borderColor = '#EF4444';

  // ─── NO ENROLLED STATE ─────────────────────
  if (matchStatus === 'NO_ENROLLED') {
    return (
      <View style={styles.noEnrolledContainer}>
        <View style={styles.lockCard}>
          <View style={styles.lockIconCircle}>
            <Text style={styles.lockEmoji}>🔒</Text>
          </View>
          <Text style={styles.lockTitle}>Database Unregistered</Text>
          <Text style={styles.lockSub}>
            No local biometric templates found. Enroll a face template first to establish identity profile before verification.
          </Text>
          
          <TouchableOpacity style={styles.enrollBtn} onPress={() => navigation.navigate('Enroll')} activeOpacity={0.85}>
            <Text style={styles.enrollBtnText}>Enroll New Personnel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate('Home')} activeOpacity={0.8}>
            <Text style={styles.homeBtnText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ─── HEADER ───────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Verify Identity</Text>
          <Text style={styles.headerSub}>NHAI DATALAKE 3.0</Text>
        </View>
        {/* Dev Toggle */}
        <View style={styles.devToggle}>
          <Text style={styles.devLabel}>Spoof</Text>
          <Switch
            value={simulateSpoof}
            onValueChange={setSimulateSpoof}
            trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#EF4444' }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {/* ─── CAMERA ───────────────────────────────── */}
      <View style={[styles.cameraWrapper, { borderColor, borderWidth: matchStatus !== 'SEARCHING' && matchStatus !== 'IDLE' ? 4 : 0 }]}>
        <CameraView 
          ref={cameraViewRef} 
          isActive={matchStatus === 'SEARCHING' || matchStatus === 'IDLE'} 
          onFaceDetected={handleFaceDetected} 
          detectedFace={detectedFace}
        />
        
        {/* Scanning Progress Overlay */}
        {matchStatus === 'SEARCHING' && !isProcessing && (
          <View style={styles.progressOverlay}>
            <Text style={styles.progressStatusText}>{statusMessage}</Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
          </View>
        )}

        {/* Processing / Verifying Overlay */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <Animated.View style={[styles.processingSpinnerWrap, { transform: [{ scale: pulseAnim }] }]}>
              <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
                <View style={styles.spinnerRing} />
              </Animated.View>
              <View style={styles.spinnerCenter}>
                <Text style={styles.spinnerIcon}>🔍</Text>
              </View>
            </Animated.View>
            <Text style={styles.processingTitle}>Verifying Identity</Text>
            <Text style={styles.processingText}>Matching neural face template against enrolled database...</Text>
            <View style={styles.processingProgressRow}>
              <ActivityIndicator size="small" color="#F5C40A" />
              <Text style={styles.processingSubtext}>Analyzing liveness & embedding</Text>
            </View>
          </View>
        )}
      </View>

      {/* ─── RESULTS PANEL ────────────────────────── */}
      <View style={styles.resultContainer}>

        {matchStatus === 'SEARCHING' && !isProcessing && (
          <View style={styles.searchingWrapper}>
            <Text style={styles.searchingTitle}>Scanning...</Text>
            <Text style={styles.searchingSubtext}>Analyzing LBP texture, HSV reflections & depth map</Text>
          </View>
        )}

        {matchStatus === 'SEARCHING' && isProcessing && (
          <View style={styles.searchingWrapper}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0A1F44" />
              <Text style={[styles.searchingTitle, { marginLeft: 10, fontSize: 18 }]}>Processing Match...</Text>
            </View>
            <Text style={styles.searchingSubtext}>Offline neural network matching in progress</Text>
          </View>
        )}

        {matchStatus === 'SPOOF_REJECTED' && matchData && (
          <View style={styles.resultCard}>
            <View style={[styles.statusBadge, { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.statusBadgeText, { color: '#EF4444' }]}>⚠️ SPOOF REJECTED</Text>
            </View>
            <Text style={styles.spoofReason}>{matchData.message}</Text>
            
            <View style={styles.breakdownCard}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Texture (LBP)</Text>
                <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>{(matchData.details.texture * 100).toFixed(1)}%</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Specular Reflection</Text>
                <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>{(matchData.details.reflection * 100).toFixed(1)}%</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>3D Depth Map</Text>
                <Text style={[styles.breakdownValue, { color: '#EF4444' }]}>{(matchData.details.depth * 100).toFixed(1)}%</Text>
              </View>
              <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                <Text style={[styles.breakdownLabel, { fontWeight: 'bold' }]}>Fused Liveness</Text>
                <Text style={[styles.breakdownValue, { color: '#EF4444', fontWeight: 'bold', fontSize: 16 }]}>{(matchData.livenessScore).toFixed(1)}%</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.retryBtn} onPress={resetSearch} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Reset Scan</Text>
            </TouchableOpacity>
            <Text style={styles.timingText}>Early-exit in {matchData.time_ms}ms</Text>
          </View>
        )}

        {(matchStatus === 'MATCHED' || matchStatus === 'LOW_CONFIDENCE') && matchData && (
          <View style={styles.resultCard}>
            <View style={[styles.statusBadge, { backgroundColor: matchStatus === 'MATCHED' ? '#F0FDF4' : '#FFFBEB' }]}>
              <Text style={[styles.statusBadgeText, { color: matchStatus === 'MATCHED' ? '#10B981' : '#F59E0B' }]}>
                {matchStatus === 'MATCHED' ? '✓ VERIFIED' : '⚠ LOW CONFIDENCE'}
              </Text>
            </View>
            <Text style={styles.matchedName}>{matchData.employee.name}</Text>
            <Text style={styles.matchedId}>ID: {matchData.employee.employee_id} · Liveness: {parseFloat(matchData.livenessScore).toFixed(1)}%</Text>
            
            <View style={styles.confidenceWrapper}>
              <View style={styles.confidenceHeader}>
                <Text style={styles.confidenceLabel}>Face Matching Confidence</Text>
                <Text style={[styles.confidencePercent, { color: matchStatus === 'MATCHED' ? '#10B981' : '#F59E0B' }]}>{matchData.confidence}%</Text>
              </View>
              <View style={styles.barTrack}>
                <Animated.View style={[
                  styles.barFill, 
                  { 
                    width: confidenceAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                    backgroundColor: matchStatus === 'MATCHED' ? '#10B981' : '#F59E0B'
                  }
                ]} />
              </View>
            </View>

            <View style={styles.timingRow}>
              <Text style={styles.timingChip}>🔎 {matchData.breakdown.detection}ms</Text>
              <Text style={styles.timingChip}>🧬 {matchData.breakdown.liveness}ms</Text>
              <Text style={styles.timingChip}>⚡ {matchData.breakdown.embedding}ms</Text>
              <Text style={styles.timingChip}>💾 {matchData.breakdown.sqlite}ms</Text>
            </View>
            
            <TouchableOpacity 
              style={[styles.primaryBtn, { backgroundColor: matchStatus === 'MATCHED' ? '#0A1F44' : '#F59E0B' }]} 
              onPress={logAttendance}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnText, { color: matchStatus === 'MATCHED' ? '#F5C40A' : '#000' }]}>Log Attendance</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={resetSearch}>
              <Text style={styles.secondaryBtnText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {matchStatus === 'UNKNOWN' && (
          <View style={styles.resultCard}>
            <View style={[styles.statusBadge, { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.statusBadgeText, { color: '#EF4444' }]}>✕ NO MATCH FOUND</Text>
            </View>
            <Text style={styles.unknownMessage}>{matchData?.message || 'No face matched in offline database.'}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={resetSearch} activeOpacity={0.85}>
              <Text style={styles.retryBtnText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A1F44',
  },
  // ─── HEADER ────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0A1F44',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backArrow: {
    color: '#F5C40A',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: -2,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 1,
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  devLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginRight: 6,
  },
  // ─── CAMERA ────────────────────────────────
  cameraWrapper: {
    flex: 1.1,
    position: 'relative',
    borderRadius: 0,
  },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 31, 68, 0.90)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  progressStatusText: {
    color: '#F5C40A',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F5C40A',
    borderRadius: 2,
  },
  // ─── PROCESSING OVERLAY ────────────────────
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 31, 68, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  processingSpinnerWrap: {
    width: 72,
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  spinnerRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(245,196,10,0.15)',
    borderTopColor: '#F5C40A',
    borderRightColor: '#F5C40A',
  },
  spinnerCenter: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(245,196,10,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerIcon: {
    fontSize: 22,
  },
  processingTitle: {
    color: '#F5C40A',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  processingText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  processingProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  processingSubtext: {
    color: '#F5C40A',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  // ─── RESULTS PANEL ─────────────────────────
  resultContainer: {
    flex: 0.9,
    backgroundColor: '#F0F2F5',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  searchingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  searchingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0A1F44',
    marginBottom: 6,
  },
  searchingSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  // ─── RESULT CARD ───────────────────────────
  resultCard: {
    alignItems: 'center',
    width: '100%',
    flex: 1,
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 12,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  matchedName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0A1F44',
    marginBottom: 2,
  },
  matchedId: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 14,
  },
  confidenceWrapper: {
    width: '100%',
    marginBottom: 10,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  confidenceLabel: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  confidencePercent: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  barTrack: {
    height: 10,
    width: '100%',
    backgroundColor: '#E5E7EB',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 5,
  },
  timingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  timingChip: {
    fontSize: 10,
    color: '#9CA3AF',
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginHorizontal: 3,
    marginVertical: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  primaryBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: '#0A1F44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: {
    color: '#0A1F44',
    fontSize: 14,
    fontWeight: 'bold',
  },
  retryBtn: {
    width: '100%',
    backgroundColor: '#0A1F44',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#0A1F44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  retryBtnText: {
    color: '#F5C40A',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  spoofReason: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  breakdownCard: {
    backgroundColor: '#fff',
    width: '100%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  breakdownTotal: {
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    paddingTop: 8,
    marginTop: 4,
  },
  breakdownLabel: {
    color: '#6B7280',
    fontSize: 13,
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  timingText: {
    fontSize: 10,
    color: '#10B981',
    marginTop: 8,
    fontWeight: 'bold',
  },
  unknownMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  // ─── NO ENROLLED STATE ─────────────────────
  noEnrolledContainer: {
    flex: 1,
    backgroundColor: '#0A1F44',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  lockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  lockIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockEmoji: {
    fontSize: 32,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0A1F44',
    marginBottom: 10,
    textAlign: 'center',
  },
  lockSub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  enrollBtn: {
    backgroundColor: '#0A1F44',
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#0A1F44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  enrollBtnText: {
    color: '#F5C40A',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  homeBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
  },
  homeBtnText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
});
