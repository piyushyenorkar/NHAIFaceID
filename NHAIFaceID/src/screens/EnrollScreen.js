import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
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
        if (enrollStageRef.current === 'CENTER' && detectedPose === 'center') poseMatchesStage = true;
        if (enrollStageRef.current === 'LEFT' && detectedPose === 'left') poseMatchesStage = true;
        if (enrollStageRef.current === 'RIGHT' && detectedPose === 'right') poseMatchesStage = true;
        if (enrollStageRef.current === 'UP' && detectedPose === 'up') poseMatchesStage = true;
        if (enrollStageRef.current === 'DOWN' && detectedPose === 'down') poseMatchesStage = true;

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
        <Text style={styles.successTitle}>✅ Enrollment Successful</Text>
        <Text style={styles.successText}>Name: {name}</Text>
        <Text style={styles.successText}>Employee ID: {employeeId}</Text>
        <Text style={styles.timestamp}>Enrolled on: {new Date().toLocaleString()}</Text>
        
        <TouchableOpacity 
          style={styles.doneBtn} 
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.doneBtnText}>Return Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isCapturing = enrollStatus === 'SCANNING';

  return (
    <View style={styles.container}>
      {/* Top Input Form */}
      <View style={styles.formContainer}>
        <TextInput 
          style={[styles.input, { color: '#000' }]}
          placeholder="Employee ID"
          placeholderTextColor="#666"
          value={employeeId}
          onChangeText={setEmployeeId}
          editable={enrollStatus === 'IDLE'}
        />
        <TextInput 
          style={[styles.input, { color: '#000' }]}
          placeholder="Full Name"
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
          editable={enrollStatus === 'IDLE'}
        />

        {enrollStatus === 'IDLE' && (
          <TouchableOpacity style={styles.startBtn} onPress={startEnrollment}>
            <Text style={styles.startBtnText}>Start Enrollment</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Camera Area */}
      <View style={styles.cameraWrapper}>
        <CameraView 
          ref={cameraViewRef}
          isActive={enrollStatus !== 'SUCCESS'}
          onFaceDetected={handleFaceDetected}
          detectedFace={detectedFace}
        />
        
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 12, borderTopWidth: 0.5, borderColor: 'rgba(255,255,255,0.2)', paddingTop: 10 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: enrollStage === 'CENTER' ? '#FFD700' : collectedEmbeddingsRef.current.CENTER ? '#28a745' : '#888' }}>
                {collectedEmbeddingsRef.current.CENTER ? '✓ Center' : '○ Center'}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: enrollStage === 'LEFT' ? '#FFD700' : collectedEmbeddingsRef.current.LEFT ? '#28a745' : '#888' }}>
                {collectedEmbeddingsRef.current.LEFT ? '✓ Left' : '○ Left'}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: enrollStage === 'RIGHT' ? '#FFD700' : collectedEmbeddingsRef.current.RIGHT ? '#28a745' : '#888' }}>
                {collectedEmbeddingsRef.current.RIGHT ? '✓ Right' : '○ Right'}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: enrollStage === 'UP' ? '#FFD700' : collectedEmbeddingsRef.current.UP ? '#28a745' : '#888' }}>
                {collectedEmbeddingsRef.current.UP ? '✓ Up' : '○ Up'}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: 'bold', color: enrollStage === 'DOWN' ? '#FFD700' : collectedEmbeddingsRef.current.DOWN ? '#28a745' : '#888' }}>
                {collectedEmbeddingsRef.current.DOWN ? '✓ Down' : '○ Down'}
              </Text>
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
            <Text style={styles.statusSubtext}>
              {Math.round(progress)}% Complete - Do not move
            </Text>

            {/* Show physical geometric distances on screen if capturing */}
            {latestEmbeddingRef.current && (
              <View style={{marginTop: 10, backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 8}}>
                <Text style={{color: '#00FF00', fontSize: 10, fontFamily: 'monospace'}}>
                  CAPTURED GEOMETRY (First 8 Distances):
                </Text>
                <Text style={{color: '#00FF00', fontSize: 10, fontFamily: 'monospace', marginTop: 4}}>
                  [{latestEmbeddingRef.current.slice(0, 8).map(v => v.toFixed(3)).join(', ')} ...]
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
    backgroundColor: '#fff',
  },
  formContainer: {
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  simulatorCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ced4da',
    marginBottom: 16,
  },
  simulatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  simulatorLabel: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  startBtn: {
    backgroundColor: '#003087',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  progressOverlay: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 20,
    alignItems: 'center',
    width: '90%'
  },
  progressText: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    marginTop: 10,
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
  },
  instructionText: {
    color: '#FFF',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8f9fa',
  },
  successTitle: {
    fontSize: 28,
    color: '#28a745',
    fontWeight: 'bold',
    marginBottom: 24,
  },
  successText: {
    fontSize: 18,
    color: '#333',
    marginBottom: 8,
  },
  timestamp: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 16,
    marginBottom: 32,
  },
  doneBtn: {
    backgroundColor: '#003087',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 8,
  },
  doneBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  processingOverlay: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 48, 135, 0.95)', // Premium NHAI Blue
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 20,
    alignItems: 'center',
    width: '90%',
    borderWidth: 1.5,
    borderColor: '#FFD700', // Premium NHAI Yellow border
  },
  processingTitle: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  processingText: {
    color: '#FFF',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 6,
  },
  processingSubtext: {
    color: '#FFD700',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
  }
});
