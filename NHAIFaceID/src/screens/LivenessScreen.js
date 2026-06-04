import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, Switch } from 'react-native';
import CameraView from '../components/CameraView';
import { runPassiveLiveness, calculateLandmarksVariance, LIVENESS_THRESHOLD } from '../services/livenessDetection';

export default function LivenessScreen({ navigation }) {
  const [isScanning, setIsScanning] = useState(true);
  const [simulateSpoof, setSimulateSpoof] = useState(false);
  const [livenessData, setLivenessData] = useState({
    score: 0,
    details: { texture: 0, reflection: 0, depth: 0 }
  });

  const textureWidth = useRef(new Animated.Value(0)).current;
  const reflectionWidth = useRef(new Animated.Value(0)).current;
  const depthWidth = useRef(new Animated.Value(0)).current;
  const fusionWidth = useRef(new Animated.Value(0)).current;

  const landmarksHistoryRef = useRef([]);
  const latestLandmarksRef = useRef(null);
  const latestBboxRef = useRef(null);

  const handleFaceDetected = (bbox, landmarks, embedding) => {
    if (!isScanning) return;
    if (bbox && landmarks) {
      latestLandmarksRef.current = landmarks;
      latestBboxRef.current = bbox;
      
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
    } else {
      latestLandmarksRef.current = null;
      latestBboxRef.current = null;
    }
  };

  useEffect(() => {
    if (!isScanning) return;

    landmarksHistoryRef.current = [];
    latestLandmarksRef.current = null;
    latestBboxRef.current = null;

    const interval = setInterval(async () => {
      const currentLandmarks = latestLandmarksRef.current;
      const currentBbox = latestBboxRef.current;
      
      let isSpoof = simulateSpoof;
      if (currentLandmarks && currentBbox) {
        const hasSimulatedInHistory = landmarksHistoryRef.current.some(f => f.isSimulated === true);
        if (!hasSimulatedInHistory) {
          const avgVariance = calculateLandmarksVariance(landmarksHistoryRef.current);
          const isSpoofDetected = landmarksHistoryRef.current.length >= 10 && avgVariance < 0.00012;
          isSpoof = isSpoof || isSpoofDetected;
        } else {
          console.log('[LivenessScreen] Simulated landmarks in history — skipping variance spoof check.');
        }
      }

      // Create frame and landmarks structure for passive liveness check
      const mockFrame = { isSpoof };
      const mockLandmarks = currentLandmarks ? currentLandmarks : [];
      mockLandmarks.isSpoof = isSpoof;

      const result = await runPassiveLiveness(mockFrame, mockLandmarks, currentBbox);
      setLivenessData(result);

      // Animate the status bars in real time
      Animated.parallel([
        Animated.timing(textureWidth, {
          toValue: result.details.texture * 100,
          duration: 200,
          useNativeDriver: false
        }),
        Animated.timing(reflectionWidth, {
          toValue: result.details.reflection * 100,
          duration: 200,
          useNativeDriver: false
        }),
        Animated.timing(depthWidth, {
          toValue: result.details.depth * 100,
          duration: 200,
          useNativeDriver: false
        }),
        Animated.timing(fusionWidth, {
          toValue: result.score * 100,
          duration: 200,
          useNativeDriver: false
        })
      ]).start();

    }, 300); // Poll every 300ms to simulate live analysis

    return () => clearInterval(interval);
  }, [isScanning, simulateSpoof]);

  const toggleScan = () => {
    setIsScanning(!isScanning);
  };

  const getStatusColor = (val) => {
    if (val >= 75) return '#28a745'; // Green
    if (val >= 60) return '#ffc107'; // Yellow/Orange
    return '#dc3545'; // Red
  };

  const hasFace = latestLandmarksRef.current !== null;
  const statusColor = hasFace ? getStatusColor(livenessData.score * 100) : '#6c757d';
  const statusText = hasFace 
    ? (livenessData.score < LIVENESS_THRESHOLD ? '⚠️ SPOOF ATTACK SUSPECTED' : '✓ SECURE LIVE FACE')
    : 'ALIGN FACE INSIDE GUIDES...';

  return (
    <View style={styles.container}>
      {/* Top Banner: Simulator Switch */}
      <View style={styles.simulatorHeader}>
        <Text style={styles.simulatorLabel}>Developer Demo: Force Spoof Attack (Simulate Photo)</Text>
        <Switch
          value={simulateSpoof}
          onValueChange={setSimulateSpoof}
          trackColor={{ false: '#767577', true: '#dc3545' }}
          thumbColor={simulateSpoof ? '#fff' : '#f4f3f4'}
        />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView isActive={isScanning} onFaceDetected={handleFaceDetected} />
        
        {/* Real-time scanning grid overlay */}
        {isScanning && (
          <View style={[styles.gridOverlay, { borderColor: statusColor }]}>
            <Text style={[styles.statusIndicatorText, { color: statusColor }]}>
              {statusText}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.dashboardContainer}>
        <Text style={styles.dashboardTitle}>Security Telemetry (Passive Liveness)</Text>

        {/* Meter 1: Texture */}
        <View style={styles.meterContainer}>
          <View style={styles.meterLabelRow}>
            <Text style={styles.meterLabel}>Texture Analysis (LBP Moiré)</Text>
            <Text style={styles.meterValue}>{(livenessData.details.texture * 100).toFixed(0)}%</Text>
          </View>
          <View style={styles.barTrack}>
            <Animated.View style={[
              styles.barFill, 
              { 
                width: textureWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                backgroundColor: getStatusColor(livenessData.details.texture * 100)
              }
            ]} />
          </View>
        </View>

        {/* Meter 2: Reflection */}
        <View style={styles.meterContainer}>
          <View style={styles.meterLabelRow}>
            <Text style={styles.meterLabel}>Corneal Reflection (Specular)</Text>
            <Text style={styles.meterValue}>{(livenessData.details.reflection * 100).toFixed(0)}%</Text>
          </View>
          <View style={styles.barTrack}>
            <Animated.View style={[
              styles.barFill, 
              { 
                width: reflectionWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                backgroundColor: getStatusColor(livenessData.details.reflection * 100)
              }
            ]} />
          </View>
        </View>

        {/* Meter 3: Depth */}
        <View style={styles.meterContainer}>
          <View style={styles.meterLabelRow}>
            <Text style={styles.meterLabel}>3D Landmark Depth Variance</Text>
            <Text style={styles.meterValue}>{(livenessData.details.depth * 100).toFixed(0)}%</Text>
          </View>
          <View style={styles.barTrack}>
            <Animated.View style={[
              styles.barFill, 
              { 
                width: depthWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }),
                backgroundColor: getStatusColor(livenessData.details.depth * 100)
              }
            ]} />
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Integrated Fused Score */}
        <View style={styles.fusedScoreRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fusedLabel}>Fused Anti-Spoofing Index</Text>
            <Text style={[styles.fusedStatus, { color: statusColor }]}>
              {livenessData.score >= LIVENESS_THRESHOLD ? `PASSED (Target >= ${(LIVENESS_THRESHOLD * 100).toFixed(0)}%)` : 'BLOCKED (Low Score)'}
            </Text>
          </View>
          <Text style={[styles.fusedValue, { color: statusColor }]}>
            {(livenessData.score * 100).toFixed(1)}%
          </Text>
        </View>

        <TouchableOpacity 
          style={[styles.actionBtn, { backgroundColor: isScanning ? '#dc3545' : '#28a745' }]} 
          onPress={toggleScan}
        >
          <Text style={styles.actionBtnText}>
            {isScanning ? 'Pause Diagnostic Feed' : 'Resume Diagnostic Feed'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  simulatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderColor: '#333'
  },
  simulatorLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500'
  },
  cameraContainer: {
    flex: 1,
    position: 'relative'
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 4,
    margin: 20,
    borderRadius: 20,
    borderStyle: 'dashed',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'rgba(0,0,0,0.1)'
  },
  statusIndicatorText: {
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    textAlign: 'center'
  },
  dashboardContainer: {
    height: 410,
    backgroundColor: '#151515',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  dashboardTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center'
  },
  meterContainer: {
    marginBottom: 14,
  },
  meterLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  meterLabel: {
    color: '#aaa',
    fontSize: 13,
  },
  meterValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  barTrack: {
    height: 8,
    width: '100%',
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 14,
  },
  fusedScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  fusedLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },
  fusedStatus: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500'
  },
  fusedValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
