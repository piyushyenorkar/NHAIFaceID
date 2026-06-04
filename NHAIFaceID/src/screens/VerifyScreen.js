import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, SafeAreaView } from 'react-native';
import Svg, { Path, Ellipse, Rect } from 'react-native-svg';
import CameraView from '../components/CameraView';
import NHAIFaceSDK from '../NHAIFaceSDK';
import { alignAndCropFace, generateEmbedding } from '../services/faceRecognition';

export default function VerifyScreen({ navigation }) {
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [matchStatus, setMatchStatus] = useState('SEARCHING'); // SEARCHING, MATCHED, LOW_CONFIDENCE, UNKNOWN, SPOOF_REJECTED, NO_ENROLLED
  const [matchData, setMatchData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedFace, setDetectedFace] = useState(null);
  
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Align face within the guide frame');
  
  const cameraViewRef = useRef(null);
  const lastDetectedRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const confidenceAnim = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);

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
    NHAIFaceSDK.hasEnrolledPersonnel().then(hasProfiles => {
      if (isMountedRef.current && !hasProfiles) setMatchStatus('NO_ENROLLED');
    });
    return () => { isMountedRef.current = false; };
  }, []);

  const latestEmbeddingRef = useRef(null);
  const latestLandmarksRef = useRef(null);
  const latestBboxRef = useRef(null);

  const handleFaceDetected = (bbox, landmarks, embedding) => {
    if (matchStatus !== 'SEARCHING' || isProcessing) return;
    if (bbox && landmarks) {
      lastDetectedRef.current = Date.now();
      latestLandmarksRef.current = landmarks;
      latestBboxRef.current = bbox;
      if (embedding) latestEmbeddingRef.current = embedding;
    }
  };

  useEffect(() => {
    if (matchStatus !== 'SEARCHING') {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      return;
    }

    setProgress(0);
    setStatusMessage('Align face within the guide frame');
    lastDetectedRef.current = 0;
    setDetectedFace(null);
    setIsProcessing(false);

    progressIntervalRef.current = setInterval(() => {
      const faceDetected = Date.now() - lastDetectedRef.current < 800;

      if (faceDetected) {
        setProgress(prev => {
          const nextProgress = prev + 25; 
          if (nextProgress < 100) {
            setStatusMessage(`Scanning Face Geometry... ${nextProgress}%`);
          } else if (nextProgress >= 100) {
            clearInterval(progressIntervalRef.current);
            if (isMountedRef.current) {
              setIsProcessing(true);
              setStatusMessage('⚙️ Audit in Progress');
            }
            
            setTimeout(() => {
              (async () => {
                try {
                  const currentLandmarks = latestLandmarksRef.current;
                  const currentBbox = latestBboxRef.current;
                  let currentEmbedding = latestEmbeddingRef.current;

                  if (!currentEmbedding && cameraViewRef.current) {
                    const photoPath = await cameraViewRef.current.capturePhoto();
                    if (photoPath) {
                      const cropped = await alignAndCropFace({ path: photoPath }, currentBbox, currentLandmarks);
                      currentEmbedding = await generateEmbedding(cropped);
                    }
                  }

                  if (!currentEmbedding) {
                    setIsProcessing(false); setProgress(0); setMatchStatus('SEARCHING');
                    return;
                  }

                  const result = await NHAIFaceSDK.verifyEmbedding(currentEmbedding, currentLandmarks, 'Device_ID_Demo');
                  if (!isMountedRef.current) return;
                  
                  let targetColor = result.status === 'MATCH' ? '#10B981' : (result.status === 'LOW_CONFIDENCE' ? '#F59E0B' : '#EF4444');
                  
                  setDetectedFace({ bbox: currentBbox, landmarks: currentLandmarks, color: targetColor });
                  setMatchData(result);
                  setMatchStatus(result.status === 'MATCH' || result.status === 'LOW_CONFIDENCE' ? result.status : (result.status === 'REJECTED_SPOOF' ? 'SPOOF_REJECTED' : 'UNKNOWN'));

                  if (result.status === 'MATCH' || result.status === 'LOW_CONFIDENCE') {
                    Animated.timing(confidenceAnim, { toValue: parseFloat(result.confidence || 0), duration: 800, useNativeDriver: false }).start();
                  }
                } catch (err) {
                  if (isMountedRef.current) {
                    setMatchData({ message: err.message || 'Verification pipeline error' });
                    setMatchStatus('UNKNOWN');
                  }
                } finally {
                  if (isMountedRef.current) setIsProcessing(false);
                }
              })();
            }, 100);
            return 100;
          }
          return nextProgress;
        });
      } else {
        setStatusMessage('Align face within the guide frame');
        setProgress(0);
      }
    }, 100);

    return () => clearInterval(progressIntervalRef.current);
  }, [matchStatus]);

  const resetSearch = () => {
    setMatchData(null); setMatchStatus('SEARCHING'); setIsProcessing(false); setDetectedFace(null);
    confidenceAnim.setValue(0);
  };

  const renderHeader = () => (
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
        <Text style={styles.headerTitle}>Verify Identity</Text>
      </View>
    </View>
  );

  if (matchStatus === 'NO_ENROLLED') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {renderHeader()}
          <View style={styles.noEnrolledContainer}>
            <View style={styles.lockCard}>
            <View style={{ marginBottom: 24, backgroundColor: '#F0F2F5', padding: 20, borderRadius: 40 }}>
              <Svg width="64" height="64" viewBox="0 0 24 24" strokeWidth="1.5" stroke="#0A1F44" fill="none">
                <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <Ellipse cx="12" cy="6" rx="8" ry="3" />
                <Path d="M4 6v6c0 1.657 3.582 3 8 3c.4 0 .792 -.018 1.171 -.053" />
                <Path d="M4 12v6c0 1.657 3.582 3 8 3c.75 0 1.472 -.063 2.146 -.178" />
                {/* Red Lock over the database */}
                <Rect x="15" y="14" width="7" height="7" rx="1" stroke="#EF4444" />
                <Path d="M18.5 14v-2a1.5 1.5 0 0 0 -3 0v2" stroke="#EF4444" />
              </Svg>
            </View>
            <Text style={styles.lockTitle}>Database Unregistered</Text>
            <Text style={styles.lockSub}>
              No offline biometric templates were found on this device. Please enroll a new face geometry profile to establish your identity and begin verification.
            </Text>
              
              <TouchableOpacity style={styles.enrollBtn} onPress={() => navigation.navigate('Enroll')}>
                <Text style={styles.enrollBtnText}>Enroll New Personnel Now</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.homeBtn} onPress={() => navigation.navigate('Home')}>
                <Text style={styles.homeBtnText}>Return to Dashboard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── CAMERA AND VERIFICATION FLOW ──────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {renderHeader()}
        
        <View style={[styles.cameraWrapper, { borderColor: matchStatus !== 'SEARCHING' ? (matchStatus === 'MATCHED' ? '#10B981' : (matchStatus === 'LOW_CONFIDENCE' ? '#F59E0B' : '#EF4444')) : 'transparent', borderWidth: matchStatus !== 'SEARCHING' ? 4 : 0 }]}>
          <CameraView 
            ref={cameraViewRef} 
            isActive={matchStatus === 'SEARCHING'} 
            onFaceDetected={handleFaceDetected} 
            detectedFace={detectedFace}
          />
          
          {matchStatus === 'SEARCHING' && (
            <View style={styles.yellowBanner}>
              <Text style={styles.bannerTitle}>{statusMessage}</Text>
              {progress > 0 && (
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                </View>
              )}
            </View>
          )}
        </View>

        <View style={styles.resultContainer}>
          {matchStatus === 'SEARCHING' && (
            <View style={styles.searchingWrapper}>
              <Text style={styles.searchingText}>{isProcessing ? '⚙️ Biometric Audit in Progress' : 'Running Biometric Audit...'}</Text>
              <Text style={styles.searchingSubtext}>{isProcessing ? 'Processing offline neural network matching... Please wait.' : 'Analyzing LBP texture, HSV reflections & depth map'}</Text>
            </View>
          )}

          {matchStatus === 'SPOOF_REJECTED' && matchData && (
            <View style={styles.matchCard}>
              <Text style={styles.unknownTitle}>⚠️ SPOOF REJECTED</Text>
              <Text style={styles.spoofReason}>{matchData.message || matchData.livenessDetails?.reason}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={resetSearch}>
                <Text style={styles.retryBtnText}>Reset Scan</Text>
              </TouchableOpacity>
            </View>
          )}

          {(matchStatus === 'MATCHED' || matchStatus === 'LOW_CONFIDENCE') && matchData && (
            <View style={styles.matchCard}>
              <Text style={matchStatus === 'MATCHED' ? styles.verifiedTitle : styles.warningTitle}>
                {matchStatus === 'MATCHED' ? '✓ VERIFIED' : '⚠ LOW CONFIDENCE'}
              </Text>
              <Text style={styles.nameText}>{matchData.employee?.name}</Text>
              <Text style={styles.idText}>ID: {matchData.employee?.employee_id} | Liveness: {parseFloat(matchData.livenessScore || 0).toFixed(1)}%</Text>
              
              <View style={styles.confidenceWrapper}>
                <Text style={styles.confidenceLabel}>Face Matching Confidence: {matchData.confidence}%</Text>
                <View style={styles.barTrack}>
                  <Animated.View style={[ styles.barFill, { width: confidenceAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }), backgroundColor: matchStatus === 'MATCHED' ? '#10B981' : '#F59E0B' }]} />
                </View>
              </View>
              
              <TouchableOpacity style={styles.logBtn} onPress={() => navigation.navigate('Home')}>
                <Text style={styles.logBtnText}>Log Attendance</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0A1F44' },
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  header: { backgroundColor: '#0A1F44', paddingTop: 14, paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', alignItems: 'center' },
  backBtn: { borderWidth: 1, borderColor: '#4B5563', borderRadius: 8, padding: 8, marginRight: 16 },
  headerTitles: { flex: 1 },
  headerTitle: { color: '#F5C40A', fontSize: 20, fontFamily: 'Inter-Bold', fontWeight: 'bold' },
  
  noEnrolledContainer: { flex: 1, justifyContent: 'center', padding: 20 },
  lockCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 30, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
  lockIcon: { fontSize: 50, marginBottom: 16 },
  lockTitle: { fontSize: 22, fontFamily: 'Inter-Bold', color: '#0A1F44', marginBottom: 12, textAlign: 'center' },
  lockSub: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  
  enrollBtn: { backgroundColor: '#0A1F44', paddingVertical: 16, borderRadius: 8, width: '100%', alignItems: 'center', marginBottom: 12 },
  enrollBtnText: { color: '#F5C40A', fontSize: 16, fontFamily: 'Inter-Bold' },
  homeBtn: { backgroundColor: 'transparent', paddingVertical: 16, width: '100%', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8 },
  homeBtnText: { color: '#4B5563', fontSize: 16, fontFamily: 'Inter-SemiBold' },
  
  cameraWrapper: { flex: 1.5, position: 'relative', overflow: 'hidden', backgroundColor: '#000' },
  yellowBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#F59E0B', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  bannerTitle: { color: '#000', fontSize: 14, fontFamily: 'Inter-Bold', marginBottom: 6 },
  progressBarTrack: { width: '100%', height: 6, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#000' },
  
  resultContainer: { flex: 1, backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, marginTop: -16, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6 },
  searchingWrapper: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchingText: { fontSize: 18, fontFamily: 'Inter-Bold', color: '#0A1F44', marginBottom: 8, textAlign: 'center' },
  searchingSubtext: { fontSize: 13, fontFamily: 'Inter-Regular', color: '#6B7280', textAlign: 'center', paddingHorizontal: 20 },
  
  matchCard: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  verifiedTitle: { color: '#10B981', fontSize: 24, fontFamily: 'Inter-Bold', marginBottom: 8 },
  warningTitle: { color: '#F59E0B', fontSize: 24, fontFamily: 'Inter-Bold', marginBottom: 8 },
  unknownTitle: { color: '#EF4444', fontSize: 24, fontFamily: 'Inter-Bold', marginBottom: 8 },
  nameText: { fontSize: 24, fontFamily: 'Inter-Bold', color: '#0A1F44', marginBottom: 4 },
  idText: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#6B7280', marginBottom: 24, textAlign: 'center' },
  spoofReason: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#EF4444', textAlign: 'center', marginBottom: 24 },
  
  confidenceWrapper: { width: '100%', marginBottom: 24 },
  confidenceLabel: { fontSize: 13, fontFamily: 'Inter-SemiBold', color: '#374151', marginBottom: 8 },
  barTrack: { height: 8, width: '100%', backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  
  logBtn: { width: '100%', backgroundColor: '#0A1F44', paddingVertical: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  logBtnText: { color: '#F5C40A', fontSize: 16, fontFamily: 'Inter-Bold' },
  secondaryRetryBtn: { paddingVertical: 12, alignItems: 'center' },
  secondaryRetryBtnText: { color: '#0A1F44', fontSize: 15, fontFamily: 'Inter-SemiBold' },
  retryBtn: { width: '100%', backgroundColor: '#0A1F44', paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
  retryBtnText: { color: '#F5C40A', fontSize: 16, fontFamily: 'Inter-Bold' }
});
