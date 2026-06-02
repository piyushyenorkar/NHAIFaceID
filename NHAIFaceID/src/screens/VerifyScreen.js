import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import CameraView from '../components/CameraView';
// import { generateEmbedding } from '../services/faceRecognition';
import { getLatestEnrolledFace } from '../services/localStorage';

export default function VerifyScreen({ navigation }) {
  const [matchStatus, setMatchStatus] = useState('IDLE'); // IDLE, SEARCHING, MATCHED, UNKNOWN
  const [matchData, setMatchData] = useState(null);
  
  const confidenceAnim = useRef(new Animated.Value(0)).current;

  const handleFaceDetected = async (bbox, landmarks) => {
    if (matchStatus !== 'SEARCHING') return;

    // Simulate embedding extraction and sqlite cosine similarity lookup
    // In production:
    // const embedding = await generateEmbedding(frameTensor);
    // const result = await verifyMatch(embedding);
    
    // Mocking an authentication hit after 1.5s
    setTimeout(async () => {
      const latestFace = await getLatestEnrolledFace();
      
      // Mock result pulling the REAL latest enrolled user from SQLite
      const mockResult = {
        matched: latestFace ? true : false,
        employee_id: latestFace ? latestFace.employee_id : 'Unknown',
        name: latestFace ? latestFace.name : 'No Personnel Found',
        confidence: 94.7,
        time_ms: 680
      };

      if (mockResult.matched) {
        setMatchData(mockResult);
        setMatchStatus('MATCHED');
        
        // Animate confidence bar
        Animated.timing(confidenceAnim, {
          toValue: mockResult.confidence,
          duration: 1000,
          useNativeDriver: false
        }).start();

      } else {
        setMatchStatus('UNKNOWN');
      }
    }, 1500);
  };

  const resetSearch = () => {
    setMatchData(null);
    setMatchStatus('IDLE');
    confidenceAnim.setValue(0);
  };

  const logAttendance = () => {
    // Save to verification_log SQLite table
    navigation.navigate('Home');
  };

  // Border color based on status
  let borderColor = 'gray';
  if (matchStatus === 'MATCHED') borderColor = '#28a745';
  if (matchStatus === 'UNKNOWN') borderColor = '#dc3545';

  return (
    <View style={styles.container}>
      <View style={[styles.cameraWrapper, { borderColor, borderWidth: matchStatus !== 'SEARCHING' ? 6 : 0 }]}>
        <CameraView isActive={matchStatus === 'SEARCHING'} onFaceDetected={handleFaceDetected} />
      </View>

      <View style={styles.resultContainer}>
        {matchStatus === 'IDLE' && (
          <View style={styles.matchCard}>
            <Text style={[styles.searchingText, {marginBottom: 30}]}>Ready to Verify</Text>
            <TouchableOpacity style={styles.logBtn} onPress={() => setMatchStatus('SEARCHING')}>
              <Text style={styles.logBtnText}>Scan My Face</Text>
            </TouchableOpacity>
          </View>
        )}

        {matchStatus === 'SEARCHING' && (
          <Text style={styles.searchingText}>Searching database...</Text>
        )}

        {matchStatus === 'MATCHED' && matchData && (
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

            <Text style={styles.pipelineSpeed}>Processed in {(matchData.time_ms / 1000).toFixed(2)}s</Text>
          </View>
        )}

        {matchStatus === 'UNKNOWN' && (
          <View style={styles.matchCard}>
            <Text style={styles.unknownTitle}>NOT RECOGNIZED</Text>
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
    flex: 1,
  },
  resultContainer: {
    height: 350,
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
    marginVertical: 16,
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
    marginBottom: 24,
  },
  logBtn: {
    backgroundColor: '#003087',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  logBtnText: {
    color: '#FFD700',
    fontSize: 18,
    fontWeight: 'bold',
  },
  retryBtn: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
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
