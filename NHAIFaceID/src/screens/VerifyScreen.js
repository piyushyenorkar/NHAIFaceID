import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, Switch, Easing, ActivityIndicator } from 'react-native';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';
import RNFS from 'react-native-fs';
import { alignAndCropFace, generateEmbedding } from '../services/faceRecognition';
import { calculateLandmarksVariance, checkPoseAngle } from '../services/livenessDetection';

export default function VerifyScreen({ navigation }) {
  const [matchStatus, setMatchStatus] = useState('SEARCHING'); // SEARCHING, MATCHED, LOW_CONFIDENCE, UNKNOWN, SPOOF_REJECTED, NO_ENROLLED
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
      const isCentered = true;

      if (isCentered) {
        lastDetectedRef.current = Date.now();
        latestLandmarksRef.current = landmarks;
        latestBboxRef.current = bbox;

        if (embedding) {
          latestEmbeddingRef.current = embedding;
        }

        // Push relative landmarks to history
        if (bbox.w > 0 && bbox.h > 0) {
          const relativeLandmarks = landmarks.map(pt => ({
            x: (pt.x - bbox.x) / bbox.w,
            y: (pt.y - bbox.y) / bbox.h
          }));
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
            const prevCenter = { x: history[i - 1].x + history[i - 1].w / 2, y: history[i - 1].y + history[i - 1].h / 2 };
            const currCenter = { x: history[i].x + history[i].w / 2, y: history[i].y + history[i].h / 2 };
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

                  const hasSimulatedInHistory = landmarksHistoryRef.current.some(f => f.isSimulated === true);
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

                  let targetColor = '#EF4444'; // Red default
                  if (result.status === 'MATCH') targetColor = '#10B981'; // Green
                  if (result.status === 'LOW_CONFIDENCE') targetColor = '#F59E0B'; // Yellow

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
                    setMatchData({ message: 'No face detected in captured frame. Please verify that the camera lens is clear.' });
                    setMatchStatus('UNKNOWN');
                  } else {
                    setMatchData({ message: 'No face matched in offline database.' });
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

  // ─── NO ENROLLED STATE ─────────────────────
  if (matchStatus === 'NO_ENROLLED') {
    return (
      <View style={styles.noEnrolledContainer}>
        <View style={styles.idleHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.idleBackBtn}>
            <Text style={styles.idleBackArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.idleHeaderTitle}>Verification Setup</Text>
        </View>

        <View style={styles.formContent}>
          <View style={styles.glassCard}>
            <View style={styles.lockIconCircle}>
              <Text style={styles.lockEmoji}>🔒</Text>
            </View>
            <Text style={styles.lockTitle}>Database Unregistered</Text>
            <Text style={styles.lockSub}>
              No local biometric templates found. Enroll a face template first to establish an identity profile before verification.
            </Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Enroll')} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>Enroll New Personnel</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('Home')} activeOpacity={0.8}>
              <Text style={styles.secondaryBtnText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─── CAMERA AND VERIFICATION FLOW ──────────────────────────
  return (
    <View style={styles.cameraContainer}>
      {/* ─── FULL-SCREEN CAMERA ────────────────────────────── */}
      <View style={styles.cameraWrapper}>
        <CameraView
          ref={cameraViewRef}
          isActive={matchStatus === 'SEARCHING'}
          onFaceDetected={handleFaceDetected}
          detectedFace={detectedFace}
        />

        {/* Floating Back Button */}
        <TouchableOpacity style={styles.floatingBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.floatingBackArrow}>‹</Text>
        </TouchableOpacity>

        {/* Dev Options */}
        {matchStatus === 'SEARCHING' && (
          <View style={styles.floatingDevBar}>
            <View style={styles.devToggle}>
              <Text style={styles.devLabel}>Spoof Toggle</Text>
              <Switch
                value={simulateSpoof}
                onValueChange={setSimulateSpoof}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#EF4444' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        )}

        {/* ─── SEARCHING OVERLAY ────────────────────────────── */}
        {matchStatus === 'SEARCHING' && !isProcessing && (
          <View style={styles.bottomOverlayPanel}>
            <View style={styles.glassPanel}>
              <Text style={styles.progressStatusText}>{statusMessage}</Text>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
              <Text style={styles.searchingSubtext}>Analyzing face geometry and depth...</Text>
            </View>
          </View>
        )}

        {/* ─── PROCESSING OVERLAY ───────────────────────────── */}
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
            <Text style={styles.processingText}>Matching neural face template against secure database</Text>
            <View style={styles.processingProgressRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.processingSubtext}>Analyzing liveness & embeddings</Text>
            </View>
          </View>
        )}

        {/* ─── RESULT CARDS (MATCHED, LOW CONFIDENCE, SPOOF, UNKNOWN) ─── */}
        {matchStatus !== 'SEARCHING' && !isProcessing && (
          <View style={styles.bottomOverlayPanel}>
            <View style={[styles.glassPanel, { paddingBottom: 24 }]}>

              {/* === SPOOF REJECTED === */}
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
                      <Text style={[styles.breakdownLabel, { fontWeight: '700', color: '#111827' }]}>Fused Liveness</Text>
                      <Text style={[styles.breakdownValue, { color: '#EF4444', fontWeight: 'bold', fontSize: 16 }]}>{(matchData.livenessScore).toFixed(1)}%</Text>
                    </View>
                  </View>

                  <Text style={styles.timingText}>Early-exit in {matchData.time_ms}ms</Text>

                  <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={resetSearch} activeOpacity={0.85}>
                    <Text style={styles.primaryBtnText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* === VERIFIED OR LOW CONFIDENCE === */}
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
                    style={[styles.primaryBtn, { backgroundColor: matchStatus === 'MATCHED' ? '#2563EB' : '#F59E0B' }]}
                    onPress={logAttendance}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.primaryBtnText, { color: '#FFF' }]}>Log Attendance</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.secondaryBtn} onPress={resetSearch}>
                    <Text style={styles.secondaryBtnText}>Scan Again</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* === NO MATCH (UNKNOWN) === */}
              {matchStatus === 'UNKNOWN' && (
                <View style={styles.resultCard}>
                  <View style={[styles.statusBadge, { backgroundColor: '#FEF2F2' }]}>
                    <Text style={[styles.statusBadgeText, { color: '#EF4444' }]}>✕ NO MATCH FOUND</Text>
                  </View>
                  <Text style={styles.unknownMessage}>{matchData?.message || 'No face matched in offline database.'}</Text>

                  <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={resetSearch} activeOpacity={0.85}>
                    <Text style={styles.primaryBtnText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              )}

            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ─── NO ENROLLED / EMPTY STATE ────────────────────────────────
  noEnrolledContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB', // Light gray background
  },
  idleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  idleBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  idleBackArrow: {
    color: '#111827',
    fontSize: 32,
    fontWeight: '300',
    marginTop: -4,
  },
  idleHeaderTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  formContent: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  glassCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 8,
    alignItems: 'center',
  },
  lockIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  lockEmoji: {
    fontSize: 32,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
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

  // ─── CAMERA & SCANNING ────────────────────────────────
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  floatingBackBtn: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  floatingBackArrow: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: -4,
  },
  floatingDevBar: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    padding: 10,
    zIndex: 10,
    alignItems: 'flex-end',
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  devLabel: {
    color: '#FFF',
    fontSize: 12,
    marginRight: 8,
    fontWeight: '600',
  },

  // ─── BOTTOM OVERLAYS & GLASS PANELS ────────────────────────────────
  bottomOverlayPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  glassPanel: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    alignItems: 'center',
  },
  progressStatusText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
  searchingSubtext: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },

  // ─── PROCESSING OVERLAY ────────────────────────────────
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    zIndex: 20,
  },
  processingSpinnerWrap: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  spinnerRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#E5E7EB',
    borderTopColor: '#2563EB',
    borderRightColor: '#2563EB',
  },
  spinnerCenter: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerIcon: {
    fontSize: 28,
  },
  processingTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  processingText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  processingProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  processingSubtext: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },

  // ─── RESULT CARDS (MATCHED / SPOOF / UNKNOWN) ───────────────────
  resultCard: {
    alignItems: 'center',
    width: '100%',
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 16,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  matchedName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  matchedId: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginBottom: 20,
  },
  confidenceWrapper: {
    width: '100%',
    marginBottom: 16,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  confidenceLabel: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '600',
  },
  confidencePercent: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  barTrack: {
    height: 8,
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  timingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  timingChip: {
    fontSize: 11,
    color: '#6B7280',
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginHorizontal: 4,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontWeight: '600',
  },

  // Spoofing details
  spoofReason: {
    fontSize: 15,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '600',
  },
  breakdownCard: {
    backgroundColor: '#F9FAFB',
    width: '100%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  breakdownTotal: {
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    paddingTop: 10,
    marginTop: 6,
  },
  breakdownLabel: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  timingText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  unknownMessage: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },

  // Buttons
  primaryBtn: {
    width: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtnText: {
    color: '#6B7280',
    fontSize: 15,
    fontWeight: '600',
  },
});
