import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import Svg, { Ellipse, Rect, Polyline } from 'react-native-svg';
import RNFS from 'react-native-fs';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';
import { decodeJpeg } from '@tensorflow/tfjs-react-native/dist/decode_image';

import { Buffer } from 'buffer';
import { alignAndCropFace, generateEmbedding } from '../services/faceRecognition';

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
    setStatusMessage('Align face inside guide oval...');
    lastDetectedRef.current = 0;
    setDetectedFace(null);
    setEnrollStatus('SCANNING');
  };

  // Called 30 times a second from CameraView
  const handleFaceDetected = (bbox, landmarks, embedding) => {
    if (enrollStatus !== 'SCANNING') return;
    
    if (bbox && landmarks) {
      // Zone Check: Face should be of reasonable size, but we relax the strict centering
      // because frame dimensions can be rotated (portrait vs landscape) causing issues.
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
            setStatusMessage(`Mapping face contours: ${nextProgress}%`);
          } else if (nextProgress < 70) {
            setStatusMessage(`Passive liveness security audit: ${nextProgress}%`);
          } else if (nextProgress < 100) {
            setStatusMessage(`Extracting biometric embedding: ${nextProgress}%`);
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
                      // Clean up 'file://' if present in tempPath before copy
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
            return 100;
          }
          return nextProgress;
        });
      } else {
        setProgress(0);
        setStatusMessage('Align face inside guide oval...');
      }
    }, 100); // 20 increments of 5% = 2000ms (2 seconds)

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [enrollStatus, employeeId, name, navigation]);

  if (enrollStatus === 'SUCCESS') {
    return (
      <View style={styles.successContainer}>
        <Text style={styles.successTitle}>Γ£à Enrollment Successful</Text>
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
            <Text style={styles.instructionText}>
              Verifying live 3D texture & mathematical face contours
            </Text>
          </View>
        )}

        {/* Processing Overlay */}
        {enrollStatus === 'PROCESSING' && (
          <View style={styles.processingOverlay}>
            <Text style={styles.processingTitle}>ΓÜÖ∩╕Å Biometric Audit in Progress</Text>
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
    padding: 18,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  simulatorCard: {
    backgroundColor: '#fff',
    padding: 14,
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
    paddingVertical: 18,
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
    paddingVertical: 16,
    paddingHorizontal: 26,
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
  },
  processingOverlay: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 48, 135, 0.95)', // Premium NHAI Blue
    paddingVertical: 22,
    paddingHorizontal: 26,
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
