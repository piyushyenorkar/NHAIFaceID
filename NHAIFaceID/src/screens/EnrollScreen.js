import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';
import RNFS from 'react-native-fs';
import { decodeJpeg } from '@tensorflow/tfjs-react-native/dist/decode_image';

import { Buffer } from 'buffer';

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
  const handleFaceDetected = (bbox, landmarks) => {
    if (enrollStatus !== 'SCANNING') return;
    lastDetectedRef.current = Date.now();
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
                let tensor = null;
                try {
                  if (cameraViewRef.current) {
                    const photoPath = await cameraViewRef.current.capturePhoto();
                    if (photoPath) {
                      const cleanPath = photoPath.replace(/^file:\/\//, '');
                      const base64Data = await RNFS.readFile(cleanPath, 'base64');
                      const rawBytes = base64ToUint8Array(base64Data);
                      tensor = decodeJpeg(rawBytes);
                      
                      const result = await NHAIFaceSDK.enroll(employeeId, name, tensor);
                      
                      if (isMountedRef.current) {
                        setDetectedFace({
                          bbox: result.bbox,
                          landmarks: result.landmarks,
                          color: '#28a745'
                        });
                        
                        setTimeout(() => {
                          if (isMountedRef.current) setEnrollStatus('SUCCESS');
                        }, 1500);
                      }
                    } else {
                      throw new Error('Camera captured empty photo path');
                    }
                  } else {
                    throw new Error('Camera is not active');
                  }
                } catch (err) {
                  console.error('[EnrollScreen] Enrollment failed:', err);
                  if (isMountedRef.current) {
                    setEnrollStatus('IDLE');
                    Alert.alert(
                      'Enrollment Failed ❌',
                      err.message || 'Face enrollment failed. Please hold still and try again.',
                      [{ text: 'Retry', onPress: () => { if (isMountedRef.current) { setEnrollStatus('SCANNING'); setProgress(0); setStatusMessage('Align face inside guide oval...'); } } }]
                    );
                  }
                } finally {
                  if (tensor) {
                    tensor.dispose();
                  }
                }
              })();
            }, 100);
            return 100;
          }
          return nextProgress;
        });
      } else {
        setStatusMessage('Face lost. Align face in guides...');
        setProgress(prev => Math.max(0, prev - 10)); // decay progress if face lost
      }
    }, 100); // 20 increments of 5% = 2000ms (2 seconds)

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [enrollStatus, employeeId, name]);

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
            <Text style={styles.instructionText}>
              Verifying live 3D texture & mathematical face contours
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
              Please hold still, this takes a few seconds...
            </Text>
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
