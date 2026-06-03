import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import Svg, { Ellipse, Rect, Polyline } from 'react-native-svg';
import RNFS from 'react-native-fs';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';
import { decodeJpeg } from '@tensorflow/tfjs-react-native/dist/decode_image';

import { Buffer } from 'buffer';
import { alignAndCropFace, generateEmbedding } from '../services/faceRecognition';
import { calculateLandmarksVariance, checkPoseAngle, estimatePoseAngle } from '../services/livenessDetection';

function base64ToUint8Array(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export default function EnrollScreen({ navigation }) {
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [enrollStatus, setEnrollStatus] = useState('IDLE'); // IDLE, SCANNING, PROCESSING, SUCCESS
  const [detectedFace, setDetectedFace] = useState(null);
  const [focusedInput, setFocusedInput] = useState(null);

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
        let poseMatchesStage = false;
        if (bypassPoseCheckRef.current) {
          poseMatchesStage = true;
        } else {
          if (enrollStageRef.current === 'CENTER' && detectedPose === 'center') poseMatchesStage = true;
          if (enrollStageRef.current === 'LEFT' && detectedPose === 'left') poseMatchesStage = true;
          if (enrollStageRef.current === 'RIGHT' && detectedPose === 'right') poseMatchesStage = true;
          if (enrollStageRef.current === 'UP' && detectedPose === 'up') poseMatchesStage = true;
          if (enrollStageRef.current === 'DOWN' && detectedPose === 'down') poseMatchesStage = true;
        }

        if (isSpoofDetected) {
          qualityReasonRef.current = 'spoof';
        } else if (isMovingTooFast) {
          qualityReasonRef.current = 'blurry';
        } else if (!poseMatchesStage) {
          qualityReasonRef.current = 'bad_angle';
        } else {
          qualityReasonRef.current = null;
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
            return Math.max(baseline, prev - 2); // decay progress slowly to baseline of active stage
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
                if (cameraViewRef.current) {
                  const photoPath = await cameraViewRef.current.capturePhoto();
                  if (photoPath) {
                    const cropped = await alignAndCropFace({ path: photoPath }, currentBbox, currentLandmarks);
                    embedding = await generateEmbedding(cropped);
                  }
                }

                if (!embedding) {
                  isProcessingStageRef.current = false;
                  return;
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

  if (enrollStatus === 'SUCCESS') {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Enrollment Successful</Text>
          
          <View style={styles.successDetailCard}>
            <Text style={styles.successText}>Name: <Text style={styles.successValue}>{name}</Text></Text>
            <Text style={styles.successText}>Employee ID: <Text style={styles.successValue}>{employeeId}</Text></Text>
            <Text style={styles.timestamp}>Registered locally on: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</Text>
          </View>

          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.doneBtnText}>Return Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isCapturing = enrollStatus === 'SCANNING';

  return (
    <View style={styles.container}>
      {/* Full Screen Camera Background */}
      <View style={styles.cameraWrapper}>
        <CameraView 
          ref={cameraViewRef}
          isActive={enrollStatus !== 'SUCCESS'}
          onFaceDetected={handleFaceDetected}
          detectedFace={detectedFace}
        />
      </View>

      {/* Dim overlay when form is shown */}
      {enrollStatus === 'IDLE' && <View style={styles.backgroundOverlay} />}

      {/* Top Input Form - absolute glass card */}
      {enrollStatus === 'IDLE' && (
        <View style={styles.formContainer}>
          <Text style={styles.formTitle}>Biometric Enrollment</Text>
          <Text style={styles.formSubtitle}>Offline Face ID Registration</Text>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Employee ID</Text>
            <TextInput
              style={[styles.input, focusedInput === 'id' && styles.inputFocused]}
              placeholder="e.g. NHAI-2026-904"
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={employeeId}
              onChangeText={setEmployeeId}
              editable={enrollStatus === 'IDLE'}
              onFocus={() => setFocusedInput('id')}
              onBlur={() => setFocusedInput(null)}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Full Name</Text>
            <TextInput
              style={[styles.input, focusedInput === 'name' && styles.inputFocused]}
              placeholder="e.g. Piyush Yenorkar"
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={name}
              onChangeText={setName}
              editable={enrollStatus === 'IDLE'}
              onFocus={() => setFocusedInput('name')}
              onBlur={() => setFocusedInput(null)}
            />
          </View>

          <TouchableOpacity style={styles.startBtn} onPress={startEnrollment}>
            <Text style={styles.startBtnText}>START ENROLLMENT</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Developer Options for scanning */}
      {enrollStatus === 'SCANNING' && (
        <View style={styles.simulatorHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={styles.simulatorLabelDev}>Bypass Pose</Text>
            <Switch
              value={bypassPoseCheck}
              onValueChange={toggleBypassPoseCheck}
              trackColor={{ false: '#334155', true: '#10B981' }}
              thumbColor={bypassPoseCheck ? '#FFFFFF' : '#94A3B8'}
            />
          </View>
          <TouchableOpacity 
            style={styles.forceCaptureBtn} 
            onPress={forceCaptureStage}
          >
            <Text style={styles.forceCaptureBtnText}>Force Capture {enrollStage}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Progress Overlay */}
      {enrollStatus === 'SCANNING' && (
        <View style={styles.progressOverlay}>
          <Text style={styles.progressText}>
            {statusMessage}
          </Text>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          
          {/* Visual 5-Pose Guidance Stepper */}
          <View style={styles.stepperContainer}>
            <View style={styles.stepItem}>
              <View style={[styles.stepIndicator, { backgroundColor: enrollStage === 'CENTER' ? '#F5C40A' : collectedEmbeddingsRef.current.CENTER ? '#10B981' : '#64748B' }]} />
              <Text style={[styles.stepText, { color: enrollStage === 'CENTER' ? '#F5C40A' : collectedEmbeddingsRef.current.CENTER ? '#10B981' : '#64748B' }]}>
                Center
              </Text>
            </View>
            <View style={styles.stepItem}>
              <View style={[styles.stepIndicator, { backgroundColor: enrollStage === 'LEFT' ? '#F5C40A' : collectedEmbeddingsRef.current.LEFT ? '#10B981' : '#64748B' }]} />
              <Text style={[styles.stepText, { color: enrollStage === 'LEFT' ? '#F5C40A' : collectedEmbeddingsRef.current.LEFT ? '#10B981' : '#64748B' }]}>
                Left
              </Text>
            </View>
            <View style={styles.stepItem}>
              <View style={[styles.stepIndicator, { backgroundColor: enrollStage === 'RIGHT' ? '#F5C40A' : collectedEmbeddingsRef.current.RIGHT ? '#10B981' : '#64748B' }]} />
              <Text style={[styles.stepText, { color: enrollStage === 'RIGHT' ? '#F5C40A' : collectedEmbeddingsRef.current.RIGHT ? '#10B981' : '#64748B' }]}>
                Right
              </Text>
            </View>
            <View style={styles.stepItem}>
              <View style={[styles.stepIndicator, { backgroundColor: enrollStage === 'UP' ? '#F5C40A' : collectedEmbeddingsRef.current.UP ? '#10B981' : '#64748B' }]} />
              <Text style={[styles.stepText, { color: enrollStage === 'UP' ? '#F5C40A' : collectedEmbeddingsRef.current.UP ? '#10B981' : '#64748B' }]}>
                Up
              </Text>
            </View>
            <View style={styles.stepItem}>
              <View style={[styles.stepIndicator, { backgroundColor: enrollStage === 'DOWN' ? '#F5C40A' : collectedEmbeddingsRef.current.DOWN ? '#10B981' : '#64748B' }]} />
              <Text style={[styles.stepText, { color: enrollStage === 'DOWN' ? '#F5C40A' : collectedEmbeddingsRef.current.DOWN ? '#10B981' : '#64748B' }]}>
                Down
              </Text>
            </View>
          </View>

          <Text style={styles.instructionText}>
            Rotate head slowly through center, left, right, up, down profiles.
          </Text>
        </View>
      )}

      {/* Processing Overlay */}
      {enrollStatus === 'PROCESSING' && (
        <View style={styles.processingOverlay}>
          <Text style={styles.processingTitle}>⚙️ Biometric Audit in Progress</Text>
          <Text style={styles.processingText}>
            Analyzing passive liveness cues & extracting offline face template.
          </Text>
          <Text style={styles.processingSubtext}>
            {Math.round(progress)}% Complete - Do not move
          </Text>

          {/* Show physical geometric distances on screen if capturing */}
          {latestEmbeddingRef.current && (
            <View style={{marginTop: 14, backgroundColor: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245, 196, 10, 0.2)'}}>
              <Text style={{color: '#10B981', fontSize: 10, fontFamily: 'monospace', fontWeight: 'bold'}}>
                CAPTURED GEOMETRY (First 8 Distances):
              </Text>
              <Text style={{color: '#10B981', fontSize: 10, fontFamily: 'monospace', marginTop: 4}}>
                [{latestEmbeddingRef.current.slice(0, 8).map(v => v.toFixed(3)).join(', ')} ...]
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D', // Premium Slate Dark background
  },
  cameraWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 30, 0.65)', // Dimming camera slightly for form input
  },
  formContainer: {
    position: 'absolute',
    top: '20%',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.88)', // Dark Glassmorphic container
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#F5C40A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    zIndex: 10,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputWrapper: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#FFFFFF',
  },
  inputFocused: {
    borderColor: '#F5C40A', // Highlight with gold border on focus
    backgroundColor: 'rgba(245, 196, 10, 0.03)',
  },
  startBtn: {
    backgroundColor: '#003087',
    borderColor: '#F5C40A',
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#F5C40A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startBtnText: {
    color: '#F5C40A',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  simulatorHeader: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 196, 10, 0.3)',
    zIndex: 100,
  },
  simulatorLabelDev: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: 'bold',
    marginRight: 8,
  },
  forceCaptureBtn: {
    backgroundColor: 'rgba(0, 48, 135, 0.6)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F5C40A',
  },
  forceCaptureBtnText: {
    color: '#F5C40A',
    fontSize: 11,
    fontWeight: 'bold',
  },
  progressOverlay: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
    width: '90%',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  progressText: {
    color: '#F5C40A',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    marginTop: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F5C40A',
  },
  stepperContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 6,
    borderTopWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  stepText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  instructionText: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0F1D',
    padding: 24,
  },
  successCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  successIcon: {
    fontSize: 40,
    color: '#10B981',
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 24,
    color: '#10B981',
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  successDetailCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    width: '100%',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  successText: {
    fontSize: 14,
    color: '#94A3B8',
    marginBottom: 8,
    textAlign: 'center',
  },
  successValue: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  timestamp: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
  doneBtn: {
    backgroundColor: '#003087',
    borderColor: '#F5C40A',
    borderWidth: 1.5,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#F5C40A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  doneBtnText: {
    color: '#F5C40A',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  processingOverlay: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingVertical: 24,
    paddingHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    width: '90%',
    borderWidth: 1.5,
    borderColor: '#F5C40A',
    shadowColor: '#F5C40A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  processingTitle: {
    color: '#F5C40A',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  processingText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
  },
  processingSubtext: {
    color: '#F5C40A',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
  }
});
