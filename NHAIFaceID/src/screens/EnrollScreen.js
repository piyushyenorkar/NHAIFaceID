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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
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

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}}>
          <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
            
            {/* Form Card */}
            <View style={styles.formCard}>
              <Text style={styles.inputLabel}>EMPLOYEE ID</Text>
              <View style={styles.inputWrapper}>
                <View style={styles.iconBox}>
                  <Svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" stroke="#F59E0B" fill="none">
                    <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <Path d="M3 5m0 2a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2z" />
                    <Path d="M7 15l10 0" />
                    <Path d="M7 9l0 .01" />
                  </Svg>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="NHAI-2024-00423"
                  placeholderTextColor="#9CA3AF"
                  value={employeeId}
                  onChangeText={setEmployeeId}
                  editable={enrollStatus === 'IDLE'}
                />
              </View>

              <Text style={styles.inputLabel}>FULL NAME</Text>
              <View style={styles.inputWrapper}>
                <View style={styles.iconBox}>
                  <Svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" stroke="#F59E0B" fill="none">
                    <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <Path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
                    <Path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
                  </Svg>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="As per official records"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={setName}
                  editable={enrollStatus === 'IDLE'}
                />
              </View>
            </View>

            {/* Camera Card */}
            <View style={styles.cameraCard}>
              <View style={styles.cameraContainer}>
                <CameraView 
                  ref={cameraViewRef}
                  isActive={enrollStatus !== 'SUCCESS'}
                  onFaceDetected={handleFaceDetected}
                  detectedFace={detectedFace}
                />
                
                {/* Overlays */}
                {/* Top Row */}
                <View style={styles.cameraTopRow}>
                  <TouchableOpacity style={styles.pillBtn} onPress={() => cameraViewRef.current?.toggleCamera()}>
                    <Svg width="12" height="12" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#FFF" fill="none">
                      <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                      <Path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                      <Path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                    </Svg>
                    <Text style={styles.pillBtnText}>FLIP</Text>
                  </TouchableOpacity>
                  
                  <View style={styles.liveBtn}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                </View>

                {/* Guide Frame */}
                <View style={styles.guideFrameContainer}>
                  {/* Corners */}
                  <View style={[styles.corner, styles.topLeftCorner]} />
                  <View style={[styles.corner, styles.topRightCorner]} />
                  <View style={[styles.corner, styles.bottomLeftCorner]} />
                  <View style={[styles.corner, styles.bottomRightCorner]} />
                  
                  <Svg height="200" width="160" style={styles.ovalSvg}>
                    <Ellipse cx="80" cy="100" rx="70" ry="90" stroke="#F5C40A" strokeWidth="2" strokeDasharray="4,6" fill="none" />
                    {/* Add a solid stroke that fills up based on progress */}
                    <Ellipse cx="80" cy="100" rx="70" ry="90" stroke="#10B981" strokeWidth="4" fill="none" 
                             strokeDasharray="600" strokeDashoffset={600 - (600 * (progress/100))} />
                  </Svg>
                  
                  <Text style={styles.scanningText}>
                    {enrollStatus === 'PROCESSING' ? 'PROCESSING' : statusMessage}
                  </Text>
                </View>

                {/* Processing Overlay restored */}
                {enrollStatus === 'PROCESSING' && (
                  <View style={styles.processingOverlay}>
                    <Text style={styles.processingTitle}>⚙️ Biometric Audit in Progress</Text>
                    <Text style={styles.processingText}>
                      Analyzing passive liveness cues & extracting offline face template.
                    </Text>
                    <Text style={styles.statusSubtext}>
                      {Math.round(progress)}% Complete - Do not move
                    </Text>
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
              
              {/* Yellow Banner */}
              <View style={styles.yellowBanner}>
                <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                  <Svg width="20" height="20" viewBox="0 0 24 24" strokeWidth="1.5" stroke="#000" fill="none" style={{marginRight: 10}}>
                    <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <Path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
                    <Path d="M4 16v2a2 2 0 0 0 2 2h2" />
                    <Path d="M16 4h2a2 2 0 0 1 2 2v2" />
                    <Path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
                    <Path d="M9 10l.01 0" />
                    <Path d="M15 10l.01 0" />
                    <Path d="M9 15l6 0" />
                  </Svg>
                  {enrollStatus === 'SCANNING' ? (
                    <View>
                      <Text style={styles.bannerTitle}>Scanning Face Geometry...</Text>
                      <View style={[styles.progressBarTrack, { width: 160, backgroundColor: 'rgba(0,0,0,0.15)', marginTop: 4, height: 6 }]}>
                        <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: '#000' }]} />
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.bannerTitle}>Align face within the guide{'\n'}frame</Text>
                  )}
                </View>
                {enrollStatus === 'SCANNING' ? (
                  <Text style={[styles.bannerSub, { fontSize: 18, fontFamily: 'Inter-Bold' }]}>{progress}%</Text>
                ) : (
                  <Text style={styles.bannerSub}>Good light{'\n'}helps</Text>
                )}
              </View>
            </View>

          </ScrollView>

          {/* Start Button */}
          {enrollStatus === 'IDLE' && (
            <TouchableOpacity style={styles.startBtn} onPress={startEnrollment}>
              <Text style={styles.startBtnText}>Start Enrollment</Text>
            </TouchableOpacity>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Svg width="10" height="10" viewBox="0 0 24 24" strokeWidth="2" stroke="#9CA3AF" fill="none">
              <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <Path d="M5 11h14v10a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z" />
              <Path d="M8 11v-4a4 4 0 0 1 8 0v4" />
            </Svg>
            <Text style={styles.footerText}>Data secured under MeitY standards · NHAI © 2024</Text>
          </View>

        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A1F44',
  },
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
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

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 16,
  },
  formCard: {
    backgroundColor: '#FFF',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#6B7280',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    height: 42,
    marginBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  iconBox: {
    width: 48,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#111827',
    fontFamily: 'Inter-SemiBold',
    fontWeight: '600',
  },
  cameraCard: {
    flex: 1,
    marginHorizontal: 16,
    backgroundColor: '#111827',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F2937',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  cameraContainer: {
    flex: 1,
    minHeight: 460,
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  cameraTopRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  pillBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pillBtnText: {
    color: '#FFF',
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    marginLeft: 6,
    letterSpacing: 1,
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
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  liveText: {
    color: '#FFF',
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1,
  },
  guideFrameContainer: {
    position: 'absolute',
    top: 60,
    bottom: 60,
    left: 40,
    right: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#F5C40A',
  },
  topLeftCorner: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  topRightCorner: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeftCorner: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRightCorner: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  ovalSvg: {
    marginTop: 10,
  },
  scanningText: {
    color: '#F5C40A',
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    letterSpacing: 2,
    marginTop: 20,
  },

  yellowBanner: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bannerTitle: {
    color: '#000',
    fontSize: 13,
    fontFamily: 'Inter-Bold',
    lineHeight: 18,
  },
  bannerSub: {
    color: '#000',
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    textAlign: 'right',
    opacity: 0.8,
    lineHeight: 16,
  },
  startBtn: {
    backgroundColor: '#0A1F44',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    elevation: 4,
  },
  startBtnText: {
    color: '#FFD700',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  footerText: {
    color: '#9CA3AF',
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    marginLeft: 6,
  },
  progressBarTrack: {
    width: 120,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
  },
  processingOverlay: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 48, 135, 0.95)',
    paddingVertical: 22,
    paddingHorizontal: 26,
    borderRadius: 20,
    alignItems: 'center',
    width: '90%',
    borderWidth: 1.5,
    borderColor: '#FFD700',
    zIndex: 20,
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
