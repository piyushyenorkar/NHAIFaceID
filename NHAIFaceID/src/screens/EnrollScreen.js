import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Switch, Animated, Easing, ActivityIndicator } from 'react-native';
import Svg, { Ellipse, Rect, Polyline } from 'react-native-svg';
import RNFS from 'react-native-fs';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';

import { alignAndCropFace, generateEmbedding } from '../services/faceRecognition';
import { calculateLandmarksVariance, checkPoseAngle, estimatePoseAngle } from '../services/livenessDetection';


export default function EnrollScreen({ navigation }) {
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
            const prevCenter = { x: history[i-1].x + history[i-1].w/2, y: history[i-1].y + history[i-1].h/2 };
            const currCenter = { x: history[i].x + history[i].w/2, y: history[i].y + history[i].h/2 };
            totalDiff += Math.sqrt(Math.pow(currCenter.x - prevCenter.x, 2) + Math.pow(currCenter.y - prevCenter.y, 2));
          }
          const avgDiff = totalDiff / (history.length - 1);
          if (avgDiff >= 0.035) {
            isMovingTooFast = true;
          }
        }

        // Real-time passive spoof liveness check using landmark variance
        // Skip if any frame in the history used the simulated mathematical mesh
        // (its relative-landmark positions are constant by design, giving a false zero-variance)
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
        // Throttled pose diagnostic (every ~1s at 30fps)
        if (!handleFaceDetected._poseLogCount) handleFaceDetected._poseLogCount = 0;
        if (handleFaceDetected._poseLogCount++ % 30 === 0) {
          console.log(`[Enroll] Stage: ${enrollStageRef.current} | Detected: ${detectedPose} | yaw=${(landmarks.yawAngle||0).toFixed(1)} pitch=${(landmarks.pitchAngle||0).toFixed(1)}`);
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
          let target = 20;
          const currentStage = enrollStageRef.current;
          if (currentStage === 'CENTER') { baseline = 0; target = 20; }
          else if (currentStage === 'LEFT') { baseline = 20; target = 40; }
          else if (currentStage === 'RIGHT') { baseline = 40; target = 60; }
          else if (currentStage === 'UP') { baseline = 60; target = 80; }
          else if (currentStage === 'DOWN') { baseline = 80; target = 100; }

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

          const nextProgress = prev + 2; // Takes 1 second to lock each 20% stage segment
          
          if (currentStage === 'CENTER') {
            setStatusMessage(`Aligning center pose: ${Math.round((nextProgress - baseline) / 20 * 100)}%`);
          } else if (currentStage === 'LEFT') {
            setStatusMessage(`Registering left yaw profile: ${Math.round((nextProgress - baseline) / 20 * 100)}%`);
          } else if (currentStage === 'RIGHT') {
            setStatusMessage(`Registering right yaw profile: ${Math.round((nextProgress - baseline) / 20 * 100)}%`);
          } else if (currentStage === 'UP') {
            setStatusMessage(`Registering upper pitch profile: ${Math.round((nextProgress - baseline) / 20 * 100)}%`);
          } else if (currentStage === 'DOWN') {
            setStatusMessage(`Registering lower pitch profile: ${Math.round((nextProgress - baseline) / 20 * 100)}%`);
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
                  setProgress(20);
                } else if (currentStage === 'LEFT') {
                  setEnrollStage('RIGHT');
                  setProgress(40);
                } else if (currentStage === 'RIGHT') {
                  setEnrollStage('UP');
                  setProgress(60);
                } else if (currentStage === 'UP') {
                  setEnrollStage('DOWN');
                  setProgress(80);
                } else if (currentStage === 'DOWN') {
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
                          collectedEmbeddingsRef.current.RIGHT,
                          collectedEmbeddingsRef.current.UP,
                          collectedEmbeddingsRef.current.DOWN
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
                          Alert.alert('Success', `Employee ${name} (${employeeId}) has been successfully enrolled offline.`);
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

  // ─── POSE STAGE ICONS ──────────────────────────────────────
  const STAGES = ['CENTER', 'LEFT', 'RIGHT', 'UP', 'DOWN'];
  const STAGE_ICONS = { CENTER: '🎯', LEFT: '←', RIGHT: '→', UP: '↑', DOWN: '↓' };
  const STAGE_LABELS = { CENTER: 'Center', LEFT: 'Left', RIGHT: 'Right', UP: 'Up', DOWN: 'Down' };

  // ─── SUCCESS SCREEN ────────────────────────────────────────
  if (enrollStatus === 'SUCCESS') {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successHeader}>
          <Text style={styles.successHeaderTitle}>NHAI</Text>
          <Text style={styles.successHeaderSub}>ENROLLMENT COMPLETE</Text>
        </View>
        <Animated.View style={[styles.successCard, { opacity: successOpacity, transform: [{ scale: successScale }] }]}>
          <View style={styles.successCheckCircle}>
            <Text style={styles.successCheckMark}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Enrollment Successful</Text>
          <View style={styles.successInfoRow}>
            <Text style={styles.successLabel}>Name</Text>
            <Text style={styles.successValue}>{name}</Text>
          </View>
          <View style={styles.successDivider} />
          <View style={styles.successInfoRow}>
            <Text style={styles.successLabel}>Employee ID</Text>
            <Text style={styles.successValue}>{employeeId}</Text>
          </View>
          <View style={styles.successDivider} />
          <View style={styles.successInfoRow}>
            <Text style={styles.successLabel}>Enrolled On</Text>
            <Text style={styles.successValueSmall}>{new Date().toLocaleString()}</Text>
          </View>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.doneBtnText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  const isCapturing = enrollStatus === 'SCANNING';

  return (
    <View style={styles.container}>
      {/* ─── HEADER ─────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Enroll Personnel</Text>
          <Text style={styles.headerSub}>NHAI DATALAKE 3.0</Text>
        </View>
      </View>

      {/* ─── INPUT FORM ──────────────────────────────── */}
      <View style={styles.formContainer}>
        <View style={styles.inputRow}>
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>EMPLOYEE ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. NHAI-0042"
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={employeeId}
              onChangeText={setEmployeeId}
              editable={enrollStatus === 'IDLE'}
            />
          </View>
          <View style={[styles.inputWrapper, { marginLeft: 12 }]}>
            <Text style={styles.inputLabel}>FULL NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ravi Kumar"
              placeholderTextColor="rgba(0,0,0,0.3)"
              value={name}
              onChangeText={setName}
              editable={enrollStatus === 'IDLE'}
            />
          </View>
        </View>

        {enrollStatus === 'IDLE' && (
          <TouchableOpacity style={styles.startBtn} onPress={startEnrollment} activeOpacity={0.85}>
            <Text style={styles.startBtnText}>Start Face Enrollment</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ─── DEV OPTIONS (scanning) ──────────────────── */}
      {enrollStatus === 'SCANNING' && (
        <View style={styles.devBar}>
          <View style={styles.devToggle}>
            <Text style={styles.devLabel}>Bypass Pose</Text>
            <Switch
              value={bypassPoseCheck}
              onValueChange={toggleBypassPoseCheck}
              trackColor={{ false: 'rgba(255,255,255,0.15)', true: '#10B981' }}
              thumbColor="#fff"
            />
          </View>
          <TouchableOpacity style={styles.forceCaptureBtn} onPress={forceCaptureStage} activeOpacity={0.8}>
            <Text style={styles.forceCaptureBtnText}>⚡ Force {enrollStage}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── CAMERA AREA ─────────────────────────────── */}
      <View style={styles.cameraWrapper}>
        <CameraView 
          ref={cameraViewRef}
          isActive={enrollStatus !== 'SUCCESS'}
          onFaceDetected={handleFaceDetected}
          detectedFace={detectedFace}
        />

        {/* Scanning Progress Overlay */}
        {enrollStatus === 'SCANNING' && (
          <View style={styles.progressOverlay}>
            {/* Status Message */}
            <Text style={styles.progressStatusText}>{statusMessage}</Text>
            
            {/* Progress Bar */}
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>

            {/* 5-Pose Stepper */}
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
                        isActive && { color: '#0A1F44' },
                      ]}>
                        {isDone ? '✓' : STAGE_ICONS[stage]}
                      </Text>
                    </View>
                    <Text style={[
                      styles.poseLabel,
                      isActive && { color: '#F5C40A' },
                      isDone && { color: '#10B981' },
                    ]}>
                      {STAGE_LABELS[stage]}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.instructionHint}>
              Rotate head slowly through each profile
            </Text>
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
              <ActivityIndicator size="small" color="#F5C40A" />
              <Text style={styles.processingSubtext}>{Math.round(progress)}% — Do not move</Text>
            </View>

            {/* Live embedding readout */}
            {latestEmbeddingRef.current && (
              <View style={styles.embeddingReadout}>
                <Text style={styles.embeddingLabel}>LIVE 192-D Embedding:</Text>
                <Text style={styles.embeddingValue}>
                  [{latestEmbeddingRef.current.slice(0, 6).map(v => (typeof v === 'number' ? v : 0).toFixed(3)).join(', ')} ...]
                </Text>
              </View>
            )}
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
  // ─── FORM ──────────────────────────────────
  formContainer: {
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
  },
  inputRow: {
    flexDirection: 'row',
  },
  inputWrapper: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0A1F44',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  startBtn: {
    backgroundColor: '#0A1F44',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#0A1F44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startBtnText: {
    color: '#F5C40A',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  // ─── DEV BAR ───────────────────────────────
  devBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0D2B5E',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  devLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    marginRight: 8,
  },
  forceCaptureBtn: {
    backgroundColor: 'rgba(245,196,10,0.15)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,196,10,0.4)',
  },
  forceCaptureBtnText: {
    color: '#F5C40A',
    fontSize: 12,
    fontWeight: 'bold',
  },
  // ─── CAMERA ────────────────────────────────
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  // ─── SCANNING OVERLAY ──────────────────────
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(10, 31, 68, 0.92)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  progressStatusText: {
    color: '#F5C40A',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  progressBarTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F5C40A',
    borderRadius: 3,
  },
  // ─── POSE STEPPER ──────────────────────────
  poseStepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  poseStep: {
    alignItems: 'center',
    flex: 1,
  },
  poseIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 4,
  },
  poseIconDone: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  poseIconActive: {
    backgroundColor: '#F5C40A',
    borderColor: '#F5C40A',
    shadowColor: '#F5C40A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  poseIconText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
  },
  poseLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  instructionHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
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
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  spinnerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(245,196,10,0.15)',
    borderTopColor: '#F5C40A',
    borderRightColor: '#F5C40A',
  },
  spinnerCenter: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(245,196,10,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerIcon: {
    fontSize: 24,
  },
  processingTitle: {
    color: '#F5C40A',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  processingText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  processingProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  processingSubtext: {
    color: '#F5C40A',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },
  embeddingReadout: {
    marginTop: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  embeddingLabel: {
    color: '#10B981',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 3,
  },
  embeddingValue: {
    color: '#10B981',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  // ─── SUCCESS SCREEN ────────────────────────
  successContainer: {
    flex: 1,
    backgroundColor: '#0A1F44',
  },
  successHeader: {
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 24,
    backgroundColor: '#0A1F44',
  },
  successHeaderTitle: {
    color: '#F5C40A',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  successHeaderSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  successCard: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCheckCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  successCheckMark: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 24,
    color: '#0A1F44',
    fontWeight: 'bold',
    marginBottom: 28,
  },
  successInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 8,
  },
  successLabel: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  successValue: {
    color: '#0A1F44',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successValueSmall: {
    color: '#6B7280',
    fontSize: 13,
  },
  successDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  doneBtn: {
    backgroundColor: '#0A1F44',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    marginTop: 32,
    shadowColor: '#0A1F44',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  doneBtnText: {
    color: '#F5C40A',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
