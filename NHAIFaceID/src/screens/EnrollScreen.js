import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, SafeAreaView, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import Svg, { Ellipse, Rect, Polyline, Path } from 'react-native-svg';
import RNFS from 'react-native-fs';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';

import { Buffer } from 'buffer';
import { alignAndCropFace, generateEmbedding } from '../services/faceRecognition';

export default function EnrollScreen({ navigation }) {
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [enrollStatus, setEnrollStatus] = useState('IDLE'); // IDLE, SCANNING, PROCESSING, SUCCESS
  const [detectedFace, setDetectedFace] = useState(null);
  const [focusedInput, setFocusedInput] = useState(null);

  // Scanning progress states
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('SCANNING');
  
  const cameraViewRef = useRef(null);
  const lastDetectedRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const isMountedRef = useRef(true);

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
    setStatusMessage('SCANNING');
    lastDetectedRef.current = 0;
    setDetectedFace(null);
    setEnrollStatus('SCANNING');
  };

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
      }
    }
  };

  // Progress scanning loop (2 seconds total)
  useEffect(() => {
    if (enrollStatus !== 'SCANNING') {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    lastDetectedRef.current = 0;
    progressIntervalRef.current = setInterval(async () => {
      const faceDetected = Date.now() - lastDetectedRef.current < 800;

      if (faceDetected) {
        setProgress(prev => {
          const nextProgress = prev + 5;
          
          if (nextProgress < 35) {
            setStatusMessage(`SCANNING`);
          } else if (nextProgress < 70) {
            setStatusMessage(`ANALYZING`);
          } else if (nextProgress < 100) {
            setStatusMessage(`EXTRACTING`);
          } else if (nextProgress >= 100) {
            clearInterval(progressIntervalRef.current);
            if (isMountedRef.current) setEnrollStatus('PROCESSING');
            
            // Defer execution by 100ms to allow React to paint the PROCESSING state
            setTimeout(() => {
              (async () => {
                try {
                  const currentLandmarks = latestLandmarksRef.current;
                  const currentBbox = latestBboxRef.current;
                  
                  // Always capture a high-res photo for the user profile list
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

                  let currentEmbedding = latestEmbeddingRef.current;
                  if (!currentEmbedding && permanentPhotoPath) {
                    const cropped = await alignAndCropFace({ path: permanentPhotoPath }, currentBbox, currentLandmarks);
                    currentEmbedding = await generateEmbedding(cropped);
                  }

                  if (!currentEmbedding) {
                    Alert.alert('Error', 'Could not extract valid 3D facial embedding. Please try again in better lighting.');
                    setEnrollStatus('IDLE');
                    return;
                  }

                  const result = await NHAIFaceSDK.enrollEmbedding(employeeId, name, currentEmbedding, currentLandmarks, permanentPhotoPath);
                  
                  if (isMountedRef.current) {
                    setDetectedFace({
                      bbox: currentBbox,
                      landmarks: currentLandmarks,
                      color: '#10B981'
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
            return 100;
          }
          return nextProgress;
        });
      } else {
        setProgress(0);
        setStatusMessage('SCANNING');
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

      {/* Progress Overlay */}
      {enrollStatus === 'SCANNING' && (
        <View style={styles.progressOverlay}>
          <Text style={styles.progressText}>
            {statusMessage}
          </Text>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          
          <Text style={styles.instructionText}>
            Align your face within the guide and hold still.
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
  safeArea: {
    flex: 1,
    backgroundColor: '#0A1F44',
  },
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
  cameraTopRow: {
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
  liveBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 6,
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
  guideFrameContainer: {
    position: 'absolute',
    top: 60,
    bottom: 60,
    left: 40,
    right: 40,
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
  statusSubtext: {
    color: '#FFD700',
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
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
    paddingVertical: 18,
    borderRadius: 8,
  },
  doneBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  }
});
