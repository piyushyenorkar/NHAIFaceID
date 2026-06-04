import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Switch, Animated, Easing, ActivityIndicator, ScrollView } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import RNFS from 'react-native-fs';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';

import { alignAndCropFace, generateEmbedding } from '../services/faceRecognition';
import { calculateLandmarksVariance, estimatePoseAngle } from '../services/livenessDetection';


export default function EnrollScreen({ navigation }) {
  const isFocused = useIsFocused();

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [enrollStatus, setEnrollStatus] = useState('IDLE'); // IDLE, SCANNING, PROCESSING, SUCCESS
  const [detectedFace, setDetectedFace] = useState(null);

  // Scanning progress states
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Looking for face...');

  const cameraViewRef = useRef(null);
  const lastDetectedRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const isMountedRef = useRef(true);
  const landmarksHistoryRef = useRef([]);
  const boxHistoryRef = useRef([]);
  const qualityReasonRef = useRef(null);

  // Multi-pose guided enrollment states
  const [enrollStage, setEnrollStageState] = useState('CENTER'); // CENTER, LEFT, RIGHT, UP, DOWN
  const enrollStageRef = useRef('CENTER');
  const setEnrollStage = (stage) => {
    enrollStageRef.current = stage;
    setEnrollStageState(stage);
  };
  const collectedEmbeddingsRef = useRef({
    CENTER: null,
    LEFT: null,
    RIGHT: null,
    UP: null,
    DOWN: null
  });
  const isProcessingStageRef = useRef(false);

  const [bypassPoseCheck, setBypassPoseCheckState] = useState(false);
  const bypassPoseCheckRef = useRef(false);
  const toggleBypassPoseCheck = (val) => {
    bypassPoseCheckRef.current = val;
    setBypassPoseCheckState(val);
  };

  const forceCaptureStage = () => {
    if (enrollStatus !== 'SCANNING') return;
    if (!latestLandmarksRef.current || !latestBboxRef.current) {
      Alert.alert('No Face Detected', 'Please align a face in the camera view before capturing.');
      return;
    }

    // Clear quality warning/reason to force capture
    qualityReasonRef.current = null;

    const currentStage = enrollStageRef.current;
    let targetProgress = 20;
    if (currentStage === 'CENTER') targetProgress = 20;
    else if (currentStage === 'LEFT') targetProgress = 40;
    else if (currentStage === 'RIGHT') targetProgress = 60;
    else if (currentStage === 'UP') targetProgress = 80;
    else if (currentStage === 'DOWN') targetProgress = 100;

    setProgress(targetProgress);
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Animated spinner for processing
  const spinAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (enrollStatus === 'PROCESSING') {
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      spinAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [enrollStatus]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Success screen animations
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (enrollStatus === 'SUCCESS') {
      Animated.parallel([
        Animated.spring(successScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
        Animated.timing(successOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start();
    } else {
      successScale.setValue(0);
      successOpacity.setValue(0);
    }
  }, [enrollStatus]);

  const latestEmbeddingRef = useRef(null);
  const latestLandmarksRef = useRef(null);
  const latestBboxRef = useRef(null);

  const startEnrollment = () => {
    if (!employeeId.trim() || !name.trim()) {
      Alert.alert('Validation Error', 'Employee ID and Full Name are mandatory.');
      return;
    }
    setProgress(0);
    setEnrollStage('CENTER');
    toggleBypassPoseCheck(false); // Reset bypass mode
    collectedEmbeddingsRef.current = { CENTER: null, LEFT: null, RIGHT: null, UP: null, DOWN: null };
    setStatusMessage('Align face inside guide oval...');
    lastDetectedRef.current = 0;
    setDetectedFace(null);
    setEnrollStatus('SCANNING');
  };

  // Called 30 times a second from CameraView
  const handleFaceDetected = (bbox, landmarks, embedding) => {
    if (enrollStatus !== 'SCANNING') return;

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
            const prevCenter = { x: history[i - 1].x + history[i - 1].w / 2, y: history[i - 1].y + history[i - 1].h / 2 };
            const currCenter = { x: history[i].x + history[i].w / 2, y: history[i].y + history[i].h / 2 };
            totalDiff += Math.sqrt(Math.pow(currCenter.x - prevCenter.x, 2) + Math.pow(currCenter.y - prevCenter.y, 2));
          }
          const avgDiff = totalDiff / (history.length - 1);
          if (avgDiff >= 0.035) {
            isMovingTooFast = true;
          }
        }

        // Real-time passive spoof liveness check using landmark variance
        let isSpoofDetected = false;
        if (landmarksHistoryRef.current.length >= 10) {
          const hasSimulatedInHistory = landmarksHistoryRef.current.some(f => f.isSimulated === true);
          if (!hasSimulatedInHistory) {
            const avgVariance = calculateLandmarksVariance(landmarksHistoryRef.current);
            console.log('[EnrollScreen] avgVariance:', avgVariance);
            if (avgVariance < 0.00012) {
              isSpoofDetected = true;
            }
          } else {
            console.log('[EnrollScreen] Simulated landmarks in history — skipping variance spoof check.');
          }
        }

        // Active Guided Stage Pose Verification
        const detectedPose = estimatePoseAngle(landmarks);
        if (!handleFaceDetected._poseLogCount) handleFaceDetected._poseLogCount = 0;
        if (handleFaceDetected._poseLogCount++ % 30 === 0) {
          console.log(`[Enroll] Stage: ${enrollStageRef.current} | Detected: ${detectedPose} | yaw=${(landmarks.yawAngle || 0).toFixed(1)} pitch=${(landmarks.pitchAngle || 0).toFixed(1)}`);
        }
        let poseMatchesStage = false;
        const yaw = landmarks.yawAngle || 0;
        const pitch = landmarks.pitchAngle || 0;
        if (bypassPoseCheckRef.current) {
          poseMatchesStage = true;
        } else {
          const stage = enrollStageRef.current;
          // CENTER: face looking roughly straight ahead
          if (stage === 'CENTER' && Math.abs(yaw) <= 15 && Math.abs(pitch) <= 12) {
            poseMatchesStage = true;
          }
          // LEFT/RIGHT: any significant horizontal turn (front camera can mirror, so accept either direction)
          if (stage === 'LEFT' && Math.abs(yaw) > 8) {
            poseMatchesStage = true;
          }
          if (stage === 'RIGHT' && Math.abs(yaw) > 8 && Math.sign(yaw) !== Math.sign(collectedEmbeddingsRef.current._lastYaw || yaw)) {
            // Accept the opposite horizontal direction from LEFT capture
            poseMatchesStage = true;
          }
          // If RIGHT can't distinguish direction, just accept any horizontal turn
          if (stage === 'RIGHT' && Math.abs(yaw) > 8) {
            poseMatchesStage = true;
          }
          // UP/DOWN: any significant vertical tilt (lowered threshold for easier trigger)
          if (stage === 'UP' && Math.abs(pitch) > 4) {
            poseMatchesStage = true;
          }
          if (stage === 'DOWN' && Math.abs(pitch) > 4) {
            poseMatchesStage = true;
          }
        }

        // For non-CENTER stages, skip motion/spoof checks since head movement is EXPECTED
        const currentStage = enrollStageRef.current;
        if (currentStage === 'CENTER') {
          if (isSpoofDetected) {
            qualityReasonRef.current = 'spoof';
          } else if (isMovingTooFast) {
            qualityReasonRef.current = 'blurry';
          } else if (!poseMatchesStage) {
            qualityReasonRef.current = 'bad_angle';
          } else {
            qualityReasonRef.current = null;
          }
        } else {
          // For LEFT/RIGHT/UP/DOWN: only check pose match, skip motion/spoof
          if (!poseMatchesStage) {
            qualityReasonRef.current = 'bad_angle';
          } else {
            qualityReasonRef.current = null;
          }
        }
      }
    }
  };

  // Progress scanning loop
  useEffect(() => {
    if (enrollStatus !== 'SCANNING') {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    lastDetectedRef.current = 0;
    landmarksHistoryRef.current = []; // Clear history at start of scan
    boxHistoryRef.current = [];
    qualityReasonRef.current = null;
    isProcessingStageRef.current = false;

    progressIntervalRef.current = setInterval(async () => {
      if (isProcessingStageRef.current) return;

      const faceDetected = Date.now() - lastDetectedRef.current < 800;

      if (faceDetected) {
        setProgress(prev => {
          let baseline = 0;
          let target = 33;
          const currentStage = enrollStageRef.current;
          if (currentStage === 'CENTER') { baseline = 0; target = 33; }
          else if (currentStage === 'LEFT') { baseline = 33; target = 66; }
          else if (currentStage === 'RIGHT') { baseline = 66; target = 100; }

          if (qualityReasonRef.current) {
            if (qualityReasonRef.current === 'spoof') {
              setStatusMessage('⚠️ SPOOF DETECTED — Use live face');
            } else if (qualityReasonRef.current === 'blurry') {
              setStatusMessage('📷 Hold still — camera adjusting');
            } else {
              if (currentStage === 'CENTER') setStatusMessage('👁 Look straight at camera');
              else if (currentStage === 'LEFT') setStatusMessage('👁 Turn your head slowly left');
              else if (currentStage === 'RIGHT') setStatusMessage('👁 Turn your head slowly right');
              else if (currentStage === 'UP') setStatusMessage('👁 Tilt your head slightly up');
              else if (currentStage === 'DOWN') setStatusMessage('👁 Tilt your head slightly down');
            }
            // For CENTER: decay progress. For others: just pause (don't decay) to avoid flicker
            if (currentStage === 'CENTER') {
              return Math.max(baseline, prev - 2);
            }
            return prev; // Pause — don't go backwards
          }

          const nextProgress = prev + 3; // Takes 1 second to lock each 33% stage segment

          if (currentStage === 'CENTER') {
            setStatusMessage(`Aligning center pose: ${Math.round((nextProgress - baseline) / 33 * 100)}%`);
          } else if (currentStage === 'LEFT') {
            setStatusMessage(`Registering left yaw profile: ${Math.round((nextProgress - baseline) / 33 * 100)}%`);
          } else if (currentStage === 'RIGHT') {
            setStatusMessage(`Registering right yaw profile: ${Math.round((nextProgress - baseline) / 34 * 100)}%`);
          }

          if (nextProgress >= target) {
            isProcessingStageRef.current = true;
            setStatusMessage(`Processing ${currentStage.toLowerCase()} profile...`);

            // Execute async capture
            (async () => {
              try {
                const currentLandmarks = latestLandmarksRef.current;
                const currentBbox = latestBboxRef.current;

                if (!currentLandmarks || !currentBbox) {
                  isProcessingStageRef.current = false;
                  return;
                }

                let embedding = null;

                // REAL face recognition: capture photo → native TFLite → 192-D embedding
                // NO FALLBACK — if photo fails, we retry, not fake it
                try {
                  if (cameraViewRef.current) {
                    const photoPromise = cameraViewRef.current.capturePhoto();
                    const timeoutPromise = new Promise((_, reject) =>
                      setTimeout(() => reject(new Error('Photo capture timeout')), 5000)
                    );
                    const photoPath = await Promise.race([photoPromise, timeoutPromise]);
                    if (photoPath) {
                      const cropped = await alignAndCropFace({ path: photoPath }, currentBbox, currentLandmarks);
                      embedding = await generateEmbedding(cropped);
                    }
                  }
                } catch (photoErr) {
                  console.error('[EnrollScreen] Photo capture/embedding error:', photoErr.message);
                }

                if (!embedding) {
                  console.warn('[EnrollScreen] Stage capture failed — no real embedding. Will retry.');
                  setStatusMessage('📷 Capture failed — hold still and try again');
                  isProcessingStageRef.current = false;
                  return; // Don't advance — retry this stage
                }

                collectedEmbeddingsRef.current[currentStage] = embedding;

                if (currentStage === 'CENTER') {
                  setEnrollStage('LEFT');
                  setProgress(33);
                } else if (currentStage === 'LEFT') {
                  setEnrollStage('RIGHT');
                  setProgress(66);
                } else if (currentStage === 'RIGHT') {
                  setProgress(100);
                  clearInterval(progressIntervalRef.current);
                  if (isMountedRef.current) setEnrollStatus('PROCESSING');

                  setTimeout(() => {
                    (async () => {
                      try {
                        const finalLandmarks = latestLandmarksRef.current;
                        const finalBbox = latestBboxRef.current;

                        const avgVariance = calculateLandmarksVariance(landmarksHistoryRef.current);
                        console.log('[EnrollScreen] Landmark variance:', avgVariance);
                        const hasSimulatedInHistory = landmarksHistoryRef.current.some(f => f.isSimulated === true);
                        // Only flag spoof via variance if all frames in history are real MLKit data
                        const isSpoofDetected = !hasSimulatedInHistory &&
                          landmarksHistoryRef.current.length >= 10 && avgVariance < 0.00012;

                        let permanentPhotoPath = null;
                        if (cameraViewRef.current) {
                          const tempPath = await cameraViewRef.current.capturePhoto();
                          if (tempPath) {
                            const fileName = `enrolled_${employeeId}_${Date.now()}.jpg`;
                            permanentPhotoPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
                            const sourcePath = tempPath.replace('file://', '');
                            await RNFS.copyFile(sourcePath, permanentPhotoPath);
                            permanentPhotoPath = `file://${permanentPhotoPath}`;
                          }
                        }

                        const ensemble = [
                          collectedEmbeddingsRef.current.CENTER,
                          collectedEmbeddingsRef.current.LEFT,
                          collectedEmbeddingsRef.current.RIGHT
                        ];

                        if (finalLandmarks) {
                          finalLandmarks.isSpoof = isSpoofDetected;
                        }

                        const result = await NHAIFaceSDK.enrollEmbedding(
                          employeeId,
                          name,
                          ensemble,
                          finalLandmarks,
                          permanentPhotoPath,
                          finalBbox
                        );

                        if (isMountedRef.current) {
                          setDetectedFace({
                            bbox: finalBbox,
                            landmarks: finalLandmarks,
                            color: '#28a745'
                          });

                          setEnrollStatus('SUCCESS');
                          setTimeout(() => {
                            if (isMountedRef.current) {
                              if (navigation.canGoBack()) {
                                navigation.goBack();
                              } else {
                                navigation.navigate('Home');
                              }
                            }
                          }, 2500);
                        }
                      } catch (error) {
                        console.error('[EnrollScreen]', error);
                        if (isMountedRef.current) {
                          setEnrollStatus('IDLE');
                          Alert.alert('Enrollment Failed', error.message || 'Face enrollment failed due to spoofing or poor lighting.');
                        }
                      }
                    })();
                  }, 100);
                }

                isProcessingStageRef.current = false;
              } catch (err) {
                console.error('[EnrollScreen] Stage capture error:', err);
                isProcessingStageRef.current = false;
              }
            })();

            return prev;
          }
          return nextProgress;
        });
      } else {
        setProgress(0);
        setStatusMessage('Align face inside guide oval...');
      }
    }, 100);

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [enrollStatus, employeeId, name, navigation]);

  // ─── POSE STAGE ICONS (Reduced to 3 poses) ────────────────────────────────
  const STAGES = ['CENTER', 'LEFT', 'RIGHT'];
  const STAGE_ICONS = { CENTER: '🎯', LEFT: '←', RIGHT: '→' };
  const STAGE_LABELS = { CENTER: 'Center', LEFT: 'Left', RIGHT: 'Right' };

  return (
    <View style={styles.cameraContainer}>
      <View style={styles.cameraWrapper}>
        <CameraView
          ref={cameraViewRef}
          isActive={isFocused}
          onFaceDetected={enrollStatus === 'SCANNING' ? handleFaceDetected : undefined}
          detectedFace={detectedFace}
        />

        {/* ─── IDLE (FORM) OVERLAY ──────────────────────────────────────── */}
        {enrollStatus === 'IDLE' && (
          <View style={styles.modalOverlay}>
            <View style={styles.header}>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')}>
                <Svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#F5C40A" fill="none">
                  <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <Path d="M5 12l14 0" />
                  <Path d="M5 12l6 6" />
                  <Path d="M5 12l6 -6" />
                </Svg>
              </TouchableOpacity>
              <View style={styles.headerTitles}>
                <Text style={styles.headerTitle}>Enroll Personnel</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.formScrollContent} keyboardShouldPersistTaps="handled" bounces={false}>
              <View style={styles.glassCard}>
                <View style={styles.iconCircle}>
                  <Svg width="36" height="36" viewBox="0 0 24 24" strokeWidth="2" stroke="#2563EB" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    <Path d="M10 9a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                    <Path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
                    <Path d="M4 16v2a2 2 0 0 0 2 2h2" />
                    <Path d="M16 4h2a2 2 0 0 1 2 2v2" />
                    <Path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
                    <Path d="M8 16a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2" />
                  </Svg>
                </View>
                <Text style={styles.formTitle}>Employee Details</Text>
                <Text style={styles.formSubtitle}>Enter credentials to begin biometric scan</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>EMPLOYEE ID</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. NHAI-0042"
                    placeholderTextColor="#9CA3AF"
                    value={employeeId}
                    onChangeText={setEmployeeId}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>FULL NAME</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Ravi Kumar"
                    placeholderTextColor="#9CA3AF"
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <TouchableOpacity style={styles.startBtn} onPress={startEnrollment} activeOpacity={0.85}>
                  <Text style={styles.startBtnText}>Save & Scan Face</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        )}

        {/* ─── SUCCESS OVERLAY ──────────────────────────────────────── */}
        {enrollStatus === 'SUCCESS' && (
          <View style={styles.modalOverlay}>
            <View style={styles.formContent}>
              <Animated.View style={[styles.glassCard, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
                <View style={styles.successCheckCircle}>
                  <Text style={styles.successCheckMark}>✓</Text>
                </View>
                <Text style={styles.successTitle}>Successfully Enrolled</Text>

                <View style={styles.successInfoRow}>
                  <Text style={styles.successLabel}>Name</Text>
                  <Text style={styles.successValue}>{name}</Text>
                </View>
                <View style={styles.successDivider} />
                <View style={styles.successInfoRow}>
                  <Text style={styles.successLabel}>Employee ID</Text>
                  <Text style={styles.successValue}>{employeeId}</Text>
                </View>

                <TouchableOpacity style={styles.startBtn} onPress={() => navigation.navigate('Home')}>
                  <Text style={styles.startBtnText}>Done</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
        )}

        {/* Floating Back Button over Camera */}
        {enrollStatus === 'SCANNING' && (
          <TouchableOpacity style={styles.floatingBackBtn} onPress={() => setEnrollStatus('IDLE')}>
            <Text style={styles.floatingBackArrow}>✕</Text>
          </TouchableOpacity>
        )}



        {/* Scanning Overlay (Glassmorphism) */}
        {enrollStatus === 'SCANNING' && (
          <View style={styles.progressOverlay}>
            <View style={styles.glassOverlayCard}>
              <Text style={styles.progressStatusText}>{statusMessage}</Text>

              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>

              <View style={styles.poseStepper}>
                {STAGES.map((stage) => {
                  const isActive = enrollStage === stage;
                  const isDone = !!collectedEmbeddingsRef.current[stage];
                  return (
                    <View key={stage} style={styles.poseStep}>
                      <View style={[
                        styles.poseIcon,
                        isDone && styles.poseIconDone,
                        isActive && styles.poseIconActive,
                      ]}>
                        <Text style={[
                          styles.poseIconText,
                          isDone && { color: '#fff' },
                          isActive && { color: '#fff' },
                        ]}>
                          {isDone ? '✓' : STAGE_ICONS[stage]}
                        </Text>
                      </View>
                      <Text style={[
                        styles.poseLabel,
                        isActive && { color: '#2563EB', fontWeight: 'bold' },
                        isDone && { color: '#10B981' },
                      ]}>
                        {STAGE_LABELS[stage]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* Processing Overlay */}
        {enrollStatus === 'PROCESSING' && (
          <View style={styles.processingOverlay}>
            <Animated.View style={[styles.processingSpinnerWrap, { transform: [{ scale: pulseAnim }] }]}>
              <Animated.View style={{ transform: [{ rotate: spinInterpolate }] }}>
                <View style={styles.spinnerRing} />
              </Animated.View>
              <View style={styles.spinnerCenter}>
                <Text style={styles.spinnerIcon}>🧬</Text>
              </View>
            </Animated.View>
            <Text style={styles.processingTitle}>Biometric Audit</Text>
            <Text style={styles.processingText}>
              Analyzing liveness cues & extracting neural face template
            </Text>
            <View style={styles.processingProgressRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.processingSubtext}>{Math.round(progress)}% — Do not move</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ─── IDLE (FORM) LAYOUT ────────────────────────────────
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 20,
  },
  header: {
    backgroundColor: '#0A1F44',
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    borderWidth: 1,
    borderColor: '#4B5563', // Muted border
    borderRadius: 8,
    padding: 8,
    marginRight: 16,
    marginTop: 0,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    color: '#F5C40A',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Inter-Bold',
  },
  formContent: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  formScrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60, // Fixed padding so it doesn't shift upwards when keyboard opens
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
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconText: {
    fontSize: 32,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  inputGroup: {
    width: '100%',
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  startBtn: {
    width: '100%',
    backgroundColor: '#0A1F44',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#0A1F44',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  startBtnText: {
    color: '#F5C40A',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  floatingBackArrow: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  floatingDevBar: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: 10,
    zIndex: 10,
    alignItems: 'flex-end',
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  devLabel: {
    color: '#FFF',
    fontSize: 12,
    marginRight: 8,
  },
  forceCaptureBtn: {
    backgroundColor: 'rgba(37,99,235,0.8)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  forceCaptureBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // ─── SCANNING OVERLAY ────────────────────────────────
  progressOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
  },
  glassOverlayCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
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
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 3,
  },
  poseStepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  poseStep: {
    alignItems: 'center',
    flex: 1,
  },
  poseIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  poseIconDone: {
    backgroundColor: '#10B981',
  },
  poseIconActive: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  poseIconText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  poseLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
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
  // ─── SUCCESS SCREEN EXTRAS ────────────────────────────────
  successCheckCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  successCheckMark: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 32,
  },
  successInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 12,
  },
  successLabel: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  successValue: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
  successDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E5E7EB',
  },
});
