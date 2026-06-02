import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import CameraView from '../components/CameraView';
import { getLatestEnrolledFace } from '../services/localStorage';

export default function VerifyScreen({ navigation }) {
  const [flowState, setFlowState] = useState('IDLE'); // IDLE, LIVENESS, SEARCHING, MATCHED, UNKNOWN
  const [matchData, setMatchData] = useState(null);
  const [livenessTime, setLivenessTime] = useState(3);
  const isFacePresent = useRef(false);
  
  const handleFaceDetected = (bbox, landmarks, faceObj) => {
    isFacePresent.current = bbox !== null;
  };

  const confidenceAnim = useRef(new Animated.Value(0)).current;

  // Liveness Timer Effect
  useEffect(() => {
    let interval;
    if (flowState === 'LIVENESS') {
      interval = setInterval(() => {
        if (!isFacePresent.current) return; // Halt timer if face looks away

        setLivenessTime((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            setFlowState('SEARCHING');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [flowState]);

  // Verification Processing Effect
  useEffect(() => {
    if (flowState === 'SEARCHING') {
      // Mocking database query time
      setTimeout(async () => {
        const latestFace = await getLatestEnrolledFace();
        
        const mockResult = {
          matched: latestFace ? true : false,
          employee_id: latestFace ? latestFace.employee_id : 'Unknown',
          name: latestFace ? latestFace.name : 'No Personnel Found',
          confidence: 94.7,
          time_ms: 680
        };

        if (mockResult.matched) {
          setMatchData(mockResult);
          setFlowState('MATCHED');
          
          Animated.timing(confidenceAnim, {
            toValue: mockResult.confidence,
            duration: 1000,
            useNativeDriver: false
          }).start();
        } else {
          setFlowState('UNKNOWN');
        }
      }, 1500);
    }
  }, [flowState]);

  const resetFlow = () => {
    setMatchData(null);
    setLivenessTime(3);
    setFlowState('IDLE');
    confidenceAnim.setValue(0);
  };

  const logAttendance = () => {
    navigation.navigate('Home');
  };

  let borderColor = 'gray';
  if (flowState === 'LIVENESS') borderColor = '#fd7e14';
  if (flowState === 'SEARCHING') borderColor = '#007bff';
  if (flowState === 'MATCHED') borderColor = '#28a745';
  if (flowState === 'UNKNOWN') borderColor = '#dc3545';

  return (
    <View style={styles.container}>
      <View style={[styles.cameraWrapper, { borderColor, borderWidth: flowState !== 'IDLE' ? 6 : 0 }]}>
        <CameraView 
          isActive={flowState === 'LIVENESS' || flowState === 'SEARCHING'} 
          onFaceDetected={handleFaceDetected}
        />
        
        {/* Liveness UI Overlay */}
        {flowState === 'LIVENESS' && (
          <View style={styles.livenessOverlay}>
            <Text style={styles.livenessTitle}>Liveness Check</Text>
            <Text style={styles.livenessSubtitle}>Please blink your eyes</Text>
            <Text style={styles.livenessTimer}>{livenessTime}s</Text>
          </View>
        )}
      </View>

      <View style={styles.resultContainer}>
        {flowState === 'IDLE' && (
          <View style={styles.matchCard}>
            <Text style={[styles.searchingText, {marginBottom: 30}]}>Ready to Verify Identity</Text>
            <TouchableOpacity style={styles.logBtn} onPress={() => setFlowState('LIVENESS')}>
              <Text style={styles.logBtnText}>Start Pipeline</Text>
            </TouchableOpacity>
          </View>
        )}

        {flowState === 'LIVENESS' && (
          <Text style={[styles.searchingText, { color: '#fd7e14' }]}>Detecting Liveness...</Text>
        )}

        {flowState === 'SEARCHING' && (
          <Text style={[styles.searchingText, { color: '#007bff' }]}>Liveness Verified ✅{"\n"}Searching database...</Text>
        )}

        {flowState === 'MATCHED' && matchData && (
          <View style={styles.matchCard}>
            <Text style={styles.verifiedTitle}>VERIFIED</Text>
            <Text style={styles.nameText}>{matchData.name}</Text>
            <Text style={styles.idText}>ID: {matchData.employee_id}</Text>
            
            <View style={styles.confidenceWrapper}>
              <Text style={styles.confidenceLabel}>Match confidence: {matchData.confidence}%</Text>
              <View style={styles.barTrack}>
                <Animated.View style={[
                  styles.barFill, 
                  { width: confidenceAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }
                ]} />
              </View>
            </View>

            <Text style={styles.timestamp}>{new Date().toLocaleTimeString()}</Text>
            
            <TouchableOpacity style={styles.logBtn} onPress={logAttendance}>
              <Text style={styles.logBtnText}>Log Attendance</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.retryBtn, {backgroundColor: '#6c757d', marginTop: 10}]} onPress={resetFlow}>
              <Text style={styles.retryBtnText}>Verify Next</Text>
            </TouchableOpacity>

            <Text style={[styles.pipelineSpeed, {marginTop: 15}]}>Pipeline processed in {(matchData.time_ms / 1000).toFixed(2)}s</Text>
          </View>
        )}

        {flowState === 'UNKNOWN' && (
          <View style={styles.matchCard}>
            <Text style={styles.unknownTitle}>NOT RECOGNIZED</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={resetFlow}>
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
    flex: 1,
  },
  livenessOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  livenessTitle: {
    color: '#FFD700',
    fontSize: 28,
    fontWeight: 'bold',
  },
  livenessSubtitle: {
    color: '#FFF',
    fontSize: 20,
    marginTop: 10,
    marginBottom: 20,
  },
  livenessTimer: {
    color: '#FFF',
    fontSize: 48,
    fontWeight: 'bold',
  },
  resultContainer: {
    height: 400,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  searchingText: {
    fontSize: 20,
    color: '#6c757d',
    marginTop: 40,
    textAlign: 'center',
    fontWeight: '600'
  },
  matchCard: {
    width: '100%',
    alignItems: 'center',
  },
  verifiedTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 8,
  },
  unknownTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 24,
  },
  nameText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#003087',
  },
  idText: {
    fontSize: 18,
    color: '#6c757d',
    marginBottom: 16,
  },
  confidenceWrapper: {
    width: '100%',
    marginVertical: 12,
  },
  confidenceLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 8,
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
    backgroundColor: '#28a745',
  },
  timestamp: {
    color: '#6c757d',
    fontSize: 14,
    marginBottom: 15,
  },
  logBtn: {
    backgroundColor: '#003087',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  logBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  retryBtn: {
    backgroundColor: '#dc3545',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pipelineSpeed: {
    fontSize: 12,
    color: '#adb5bd',
  }
});
