import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import CameraView from '../components/CameraView';
import { getLatestEnrolledFace } from '../services/localStorage';
import Svg, { Path, Circle, Line } from 'react-native-svg';

function BiometricComparisonPanel({ matchPercent = 94.7 }) {
  return (
    <View style={styles.comparisonContainer}>
      {/* Left side: Live Scan */}
      <View style={styles.comparisonFrame}>
        <Text style={styles.frameLabel}>LIVE SCAN</Text>
        <View style={styles.frameContent}>
          <Svg width="80" height="90" viewBox="0 0 80 90">
            {/* Silhouette face */}
            <Path
              d="M40,10 C25,10 15,22 15,40 C15,62 30,78 40,80 C50,78 65,62 65,40 C65,22 55,10 40,10 Z"
              fill="#1A237E"
              opacity="0.3"
              stroke="#238636"
              strokeWidth="1.5"
            />
            {/* Scanner lines */}
            <Path
              d="M10,25 L70,25 M10,40 L70,40 M10,55 L70,55 M10,70 L70,70"
              stroke="#238636"
              strokeWidth="0.5"
              opacity="0.2"
            />
            {/* Biometric dots (mesh points) */}
            <Circle cx="40" cy="25" r="2" fill="#238636" />
            <Circle cx="30" cy="35" r="2" fill="#238636" />
            <Circle cx="50" cy="35" r="2" fill="#238636" />
            <Circle cx="40" cy="45" r="2" fill="#238636" />
            <Circle cx="26" cy="48" r="2" fill="#238636" />
            <Circle cx="54" cy="48" r="2" fill="#238636" />
            <Circle cx="32" cy="62" r="2" fill="#238636" />
            <Circle cx="48" cy="62" r="2" fill="#238636" />
            <Circle cx="40" cy="70" r="2" fill="#238636" />
            
            {/* Connecting lines for the mesh */}
            <Path
              d="M40,25 L30,35 M40,25 L50,35 M30,35 L40,45 M50,35 L40,45 M30,35 L26,48 M50,35 L54,48 M26,48 L32,62 M54,48 L48,62 M32,62 L40,70 M48,62 L40,70 M40,45 L32,62 M40,45 L48,62"
              stroke="#238636"
              strokeWidth="0.8"
              opacity="0.6"
            />
          </Svg>
        </View>
      </View>

      {/* Middle: Connection Bridge with Percent */}
      <View style={styles.bridgeContainer}>
        <View style={styles.bridgeLine} />
        <View style={styles.percentBadge}>
          <Text style={styles.percentText}>{matchPercent}%</Text>
          <Text style={styles.percentLabel}>MATCH</Text>
        </View>
        <View style={styles.bridgeLine} />
      </View>

      {/* Right side: Database Record */}
      <View style={styles.comparisonFrame}>
        <Text style={styles.frameLabel}>ENROLLED DB</Text>
        <View style={styles.frameContent}>
          <Svg width="80" height="90" viewBox="0 0 80 90">
            {/* Reference Silhouette face */}
            <Path
              d="M40,10 C25,10 15,22 15,40 C15,62 30,78 40,80 C50,78 65,62 65,40 C65,22 55,10 40,10 Z"
              fill="#1A237E"
              opacity="0.3"
              stroke="#E8B84B"
              strokeWidth="1.5"
            />
            {/* Profile Avatar elements inside the silhouette */}
            <Circle cx="40" cy="33" r="10" fill="#E8B84B" opacity="0.6" />
            <Path
              d="M23,65 C23,53 30,48 40,48 C50,48 57,53 57,65"
              fill="none"
              stroke="#E8B84B"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.8"
            />
          </Svg>
        </View>
      </View>
    </View>
  );
}

export default function VerifyScreen({ navigation }) {
  const [matchStatus, setMatchStatus] = useState('IDLE'); // IDLE, SEARCHING, MATCHED, UNKNOWN
  const [matchData, setMatchData] = useState(null);

  const confidenceAnim = useRef(new Animated.Value(0)).current;

  const handleFaceDetected = async (bbox, landmarks) => {
    if (matchStatus !== 'SEARCHING') return;

    // Simulate embedding extraction and sqlite cosine similarity lookup
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
  let borderColor = '#30363D'; // Default dark mode border
  if (matchStatus === 'MATCHED') borderColor = '#238636'; // Success green
  if (matchStatus === 'UNKNOWN') borderColor = '#DA3633'; // Danger red

  return (
    <View style={styles.container}>
      <View style={[styles.cameraWrapper, { borderColor, borderWidth: matchStatus !== 'SEARCHING' ? 6 : 0 }]}>
        <CameraView isActive={matchStatus === 'SEARCHING'} onFaceDetected={handleFaceDetected} />
      </View>

      <View style={styles.resultContainer}>
        {matchStatus === 'IDLE' && (
          <View style={styles.matchCard}>
            <Text style={[styles.searchingText, { marginBottom: 30 }]}>Ready to Verify</Text>
            <TouchableOpacity style={styles.startBtn} onPress={() => setMatchStatus('SEARCHING')}>
              <Text style={styles.startBtnText}>Scan My Face</Text>
            </TouchableOpacity>
          </View>
        )}

        {matchStatus === 'SEARCHING' && (
          <View style={styles.searchingBox}>
            <Text style={styles.searchingText}>Searching local database...</Text>
          </View>
        )}

        {matchStatus === 'MATCHED' && matchData && (
          <View style={styles.matchCard}>
            <View style={styles.matchHeader}>
              <Text style={styles.verifiedTitle}>VERIFIED</Text>
              <Text style={styles.timestamp}>{new Date().toLocaleTimeString()}</Text>
            </View>

            {/* Side-by-Side Biometric Comparison */}
            <BiometricComparisonPanel matchPercent={matchData.confidence} />

            <Text style={styles.nameText}>{matchData.name}</Text>
            <Text style={styles.idText}>ID: {matchData.employee_id}</Text>

            <View style={styles.confidenceWrapper}>
              <View style={styles.confidenceLabelRow}>
                <Text style={styles.confidenceLabel}>Match confidence</Text>
                <Text style={styles.confidenceValue}>{matchData.confidence}%</Text>
              </View>
              <View style={styles.barTrack}>
                <Animated.View style={[
                  styles.barFill,
                  { width: confidenceAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }
                ]} />
              </View>
            </View>

            <TouchableOpacity style={styles.logBtn} onPress={logAttendance}>
              <Text style={styles.logBtnText}>Log Attendance</Text>
            </TouchableOpacity>

            <Text style={styles.pipelineSpeed}>Processed in {(matchData.time_ms / 1000).toFixed(2)}s</Text>
          </View>
        )}

        {matchStatus === 'UNKNOWN' && (
          <View style={styles.matchCard}>
            <Text style={styles.unknownTitle}>NOT RECOGNIZED</Text>
            <Text style={styles.unknownSubtitle}>No matching record found in local SQLite database.</Text>
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
    backgroundColor: '#0D1117',
  },
  cameraWrapper: {
    flex: 1,
  },
  resultContainer: {
    minHeight: 380,
    backgroundColor: '#161B22',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: '#30363D',
    padding: 20,
    alignItems: 'center',
  },
  searchingBox: {
    marginTop: 40,
    alignItems: 'center',
  },
  searchingText: {
    fontSize: 18,
    color: '#8B949E',
    fontWeight: '600',
  },
  matchCard: {
    width: '100%',
    alignItems: 'center',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  verifiedTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#238636',
    letterSpacing: 1,
  },
  timestamp: {
    color: '#8B949E',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  
  // Side-by-Side Biometric UI Styles
  comparisonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#0D1117',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363D',
    padding: 12,
    marginBottom: 12,
  },
  comparisonFrame: {
    alignItems: 'center',
    flex: 1,
  },
  frameLabel: {
    fontSize: 9,
    color: '#8B949E',
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  frameContent: {
    width: 80,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#30363D',
    overflow: 'hidden',
  },
  bridgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 60,
    justifyContent: 'center',
  },
  bridgeLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#30363D',
  },
  percentBadge: {
    backgroundColor: '#238636',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  percentText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#F0F6FC',
  },
  percentLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: '#F0F6FC',
    opacity: 0.8,
  },

  nameText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F0F6FC',
    marginTop: 4,
  },
  idText: {
    fontSize: 14,
    color: '#8B949E',
    marginBottom: 10,
    fontWeight: '500',
  },
  confidenceWrapper: {
    width: '100%',
    marginBottom: 16,
  },
  confidenceLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  confidenceLabel: {
    fontSize: 12,
    color: '#8B949E',
    fontWeight: '600',
  },
  confidenceValue: {
    fontSize: 12,
    color: '#F0F6FC',
    fontWeight: '700',
  },
  barTrack: {
    height: 8,
    width: '100%',
    backgroundColor: '#30363D',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#238636',
  },
  startBtn: {
    backgroundColor: '#E8B84B', // NHAI Gold
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363D',
  },
  startBtnText: {
    color: '#0D1117',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  logBtn: {
    backgroundColor: '#238636',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  logBtnText: {
    color: '#F0F6FC',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  retryBtn: {
    backgroundColor: '#DA3633',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  retryBtnText: {
    color: '#F0F6FC',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  unknownTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#DA3633',
    marginBottom: 8,
    letterSpacing: 1,
  },
  unknownSubtitle: {
    fontSize: 13,
    color: '#8B949E',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  pipelineSpeed: {
    fontSize: 11,
    color: '#8B949E',
    fontStyle: 'italic',
  }
});
