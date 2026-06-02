import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';
import RNFS from 'react-native-fs';
import { decodeJpeg } from '@tensorflow/tfjs-react-native/dist/decode_image';

import { Buffer } from 'buffer';

function base64ToUint8Array(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export default function VerifyScreen({ navigation }) {
  const [matchStatus, setMatchStatus] = useState('SEARCHING'); // SEARCHING, MATCHED, LOW_CONFIDENCE, UNKNOWN, SPOOF_REJECTED
  const [matchData, setMatchData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedFace, setDetectedFace] = useState(null);
  
  // Scanning progress states
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Looking for face...');
  
  const cameraViewRef = useRef(null);
  const lastDetectedRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const confidenceAnim = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);

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

  // Called 30 times a second from CameraView
  const handleFaceDetected = (bbox, landmarks) => {
    if (matchStatus !== 'SEARCHING' || isProcessing) return;
    lastDetectedRef.current = Date.now();
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

    progressIntervalRef.current = setInterval(() => {
      const faceDetected = Date.now() - lastDetectedRef.current < 800;

      if (faceDetected) {
        setProgress(prev => {
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
                let tensor = null;
                try {
                  if (cameraViewRef.current) {
                    const photoPath = await cameraViewRef.current.capturePhoto();
                    if (photoPath) {
                      const cleanPath = photoPath.replace(/^file:\/\//, '');
                      const base64Data = await RNFS.readFile(cleanPath, 'base64');
                      const rawBytes = base64ToUint8Array(base64Data);
                      tensor = decodeJpeg(rawBytes);

                      const result = await NHAIFaceSDK.verify(tensor, 'Device_ID_Demo');
                      if (!isMountedRef.current) return;
                      
                      let targetColor = '#dc3545';
                      if (result.status === 'MATCH') targetColor = '#28a745';
                      if (result.status === 'LOW_CONFIDENCE') targetColor = '#ffc107';

                      setDetectedFace({
                        bbox: result.bbox,
                        landmarks: result.landmarks,
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
                    } else {
                      throw new Error('Camera captured empty photo path');
                    }
                  } else {
                    throw new Error('Camera is not active');
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
  let borderColor = 'gray';
  if (matchStatus === 'MATCHED') borderColor = '#28a745';
  if (matchStatus === 'LOW_CONFIDENCE') borderColor = '#ffc107';
  if (matchStatus === 'SPOOF_REJECTED') borderColor = '#dc3545';
  if (matchStatus === 'UNKNOWN') borderColor = '#dc3545';

  if (matchStatus === 'NO_ENROLLED') {
    return (
      <View style={styles.noEnrolledContainer}>
        <View style={styles.lockCard}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>Database Unregistered</Text>
          <Text style={styles.lockSub}>
            No local biometric templates found. You must enroll a face template first to establish your identity profile before verification can proceed.
          </Text>
          
          <TouchableOpacity 
            style={styles.enrollBtn} 
            onPress={() => navigation.navigate('Enroll')}
          >
            <Text style={styles.enrollBtnText}>Enroll New Personnel Now</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.homeBtn} 
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.homeBtnText}>Return to Dashboard</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.cameraWrapper, { borderColor, borderWidth: matchStatus !== 'SEARCHING' && matchStatus !== 'IDLE' ? 6 : 0 }]}>
        <CameraView 
          ref={cameraViewRef} 
          isActive={matchStatus === 'SEARCHING' || matchStatus === 'IDLE'} 
          onFaceDetected={handleFaceDetected} 
          detectedFace={detectedFace}
        />
        
        {/* Rapid Scanning Progress Overlay */}
        {matchStatus === 'SEARCHING' && (
          <View style={styles.progressOverlay}>
            <Text style={styles.progressText}>{statusMessage}</Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
          </View>
        )}
      </View>

      <View style={styles.resultContainer}>
        {matchStatus === 'IDLE' && (
          <View style={styles.matchCard}>
            <Text style={[styles.searchingText, { marginBottom: 30 }]}>Ready to Verify</Text>
            <TouchableOpacity style={styles.logBtn} onPress={() => setMatchStatus('SEARCHING')}>
              <Text style={styles.logBtnText}>Scan Face (Passive Liveness)</Text>
            </TouchableOpacity>
          </View>
        )}

        {matchStatus === 'SEARCHING' && (
          <View style={styles.searchingWrapper}>
            <Text style={styles.searchingText}>
              {isProcessing ? '⚙️ Biometric Audit in Progress' : 'Running Biometric Audit...'}
            </Text>
            <Text style={styles.searchingSubtext}>
              {isProcessing 
                ? 'Processing offline neural network matching... Please wait.' 
                : 'Analyzing LBP texture, HSV reflections & depth map'}
            </Text>
          </View>
        )}

        {matchStatus === 'SPOOF_REJECTED' && matchData && (
          <View style={styles.matchCard}>
            <Text style={styles.unknownTitle}>⚠️ SPOOF REJECTED</Text>
            <Text style={styles.spoofReason}>{matchData.message}</Text>
            
            <View style={styles.scoreBreakdownContainer}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Texture (LBP):</Text>
                <Text style={styles.breakdownValueRed}>{(matchData.details.texture * 100).toFixed(1)}%</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Specular Reflection:</Text>
                <Text style={styles.breakdownValueRed}>{(matchData.details.reflection * 100).toFixed(1)}%</Text>
              </View>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>3D Depth Map:</Text>
                <Text style={styles.breakdownValueRed}>{(matchData.details.depth * 100).toFixed(1)}%</Text>
              </View>
              <View style={[styles.breakdownRow, { borderTopWidth: 1, borderColor: '#ccc', paddingTop: 6, marginTop: 6 }]}>
                <Text style={[styles.breakdownLabel, { fontWeight: 'bold' }]}>Fused Liveness Score:</Text>
                <Text style={styles.breakdownValueRedBold}>{(matchData.livenessScore).toFixed(1)}%</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.retryBtn} onPress={resetSearch}>
              <Text style={styles.retryBtnText}>Reset Scan</Text>
            </TouchableOpacity>
            
            <Text style={styles.earlyExitText}>Early-exit triggered in {matchData.time_ms}ms (saved embedding GPU load)</Text>
          </View>
        )}

        {(matchStatus === 'MATCHED' || matchStatus === 'LOW_CONFIDENCE') && matchData && (
          <View style={styles.matchCard}>
            <Text style={matchStatus === 'MATCHED' ? styles.verifiedTitle : styles.warningTitle}>
              {matchStatus === 'MATCHED' ? '✓ VERIFIED' : '⚠ LOW CONFIDENCE'}
            </Text>
            <Text style={styles.nameText}>{matchData.employee.name}</Text>
            <Text style={styles.idText}>ID: {matchData.employee.employee_id} | Liveness: {parseFloat(matchData.livenessScore).toFixed(1)}%</Text>
            
            <View style={styles.confidenceWrapper}>
              <Text style={styles.confidenceLabel}>Face Matching Confidence: {matchData.confidence}%</Text>
              <View style={styles.barTrack}>
                <Animated.View style={[
                  styles.barFill, 
                  { 
                    width: confidenceAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                    backgroundColor: matchStatus === 'MATCHED' ? '#28a745' : '#ffc107'
                  }
                ]} />
              </View>
            </View>

            <View style={styles.miniBreakdown}>
              <Text style={styles.miniBreakdownText}>
                Detect: {matchData.breakdown.detection}ms | Liveness: {matchData.breakdown.liveness}ms | Embed: {matchData.breakdown.embedding}ms | SQL Match: {matchData.breakdown.sqlite}ms
              </Text>
            </View>
            
            <TouchableOpacity style={[styles.logBtn, { backgroundColor: matchStatus === 'MATCHED' ? '#003087' : '#ffc107' }]} onPress={logAttendance}>
              <Text style={[styles.logBtnText, { color: matchStatus === 'MATCHED' ? '#FFD700' : '#000' }]}>Log Attendance</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryRetryBtn} onPress={resetSearch}>
              <Text style={styles.secondaryRetryBtnText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {matchStatus === 'UNKNOWN' && (
          <View style={styles.matchCard}>
            <Text style={styles.unknownTitle}>NO MATCH FOUND</Text>
            <Text style={styles.idText}>{matchData?.message || 'No face matched in offline database.'}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={resetSearch}>
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
    backgroundColor: '#000',
  },
  cameraWrapper: {
    flex: 1.2,
    position: 'relative',
  },
  progressOverlay: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    width: '80%'
  },
  progressText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
  },
  resultContainer: {
    flex: 0.8,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  matchCard: {
    alignItems: 'center',
    width: '100%',
  },
  verifiedTitle: {
    color: '#28a745',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  warningTitle: {
    color: '#ffc107',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  unknownTitle: {
    color: '#dc3545',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  nameText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 4,
  },
  idText: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 16,
  },
  confidenceWrapper: {
    width: '100%',
    marginBottom: 12,
  },
  confidenceLabel: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
    fontWeight: '500',
  },
  barTrack: {
    height: 12,
    width: '100%',
    backgroundColor: '#e9ecef',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  miniBreakdown: {
    marginVertical: 10,
  },
  miniBreakdownText: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
  },
  logBtn: {
    width: '100%',
    backgroundColor: '#003087',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  logBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  secondaryRetryBtn: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryRetryBtnText: {
    color: '#003087',
    fontSize: 15,
    fontWeight: 'bold',
  },
  retryBtn: {
    width: '100%',
    backgroundColor: '#003087',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  retryBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  spoofReason: {
    fontSize: 16,
    color: '#dc3545',
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  scoreBreakdownContainer: {
    backgroundColor: '#f8f9fa',
    width: '100%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  breakdownLabel: {
    color: '#555',
    fontSize: 13,
  },
  breakdownValueRed: {
    color: '#dc3545',
    fontSize: 13,
    fontWeight: 'bold',
  },
  breakdownValueRedBold: {
    color: '#dc3545',
    fontSize: 15,
    fontWeight: 'bold',
  },
  earlyExitText: {
    fontSize: 10,
    color: '#28a745',
    marginTop: 10,
    fontWeight: 'bold',
  },
  searchingWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  searchingText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 8,
  },
  searchingSubtext: {
    fontSize: 13,
    color: '#6c757d',
    textAlign: 'center',
  },
  noEnrolledContainer: {
    flex: 1,
    backgroundColor: '#003087',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  lockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  lockIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  lockTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 12,
    textAlign: 'center',
  },
  lockSub: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  enrollBtn: {
    backgroundColor: '#003087',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  enrollBtnText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: 'bold',
  },
  homeBtn: {
    backgroundColor: 'transparent',
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ced4da',
    borderRadius: 10,
  },
  homeBtnText: {
    color: '#495057',
    fontSize: 15,
    fontWeight: '600',
  }
});
