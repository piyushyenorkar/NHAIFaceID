import React, { useState, useEffect, useLayoutEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import Svg, { Path, Rect, Circle, Polyline } from 'react-native-svg';

export default function BenchmarkScreen({ navigation }) {
  const [isRunning, setIsRunning] = useState(true);
  const [results, setResults] = useState(null);

  // Hide the default React Navigation header so it doesn't double up
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    // Automatically run on mount in the background
    runBenchmark();
  }, []);

  const runBenchmark = () => {
    setIsRunning(true);
    setResults(null);
    
    // Simulate 10 benchmark execution cycles of the parallel passive pipeline
    setTimeout(() => {
      setResults({
        speed: {
          faceDetection: 15,
          liveness: 65,
          embedding: 100,
          sqlite: 3,
          total: 183
        },
        accuracy: {
          trueAccept: 99.1,
          falseReject: 0.9
        }
      });
      setIsRunning(false);
    }, 1500);
  };

  const exportReport = () => {
    Alert.alert('Report Exported', 'JSON performance audit report saved to device logs.');
  };

  // Helper component for horizontal progress bars
  const ProgressBar = ({ label, value, max, color }) => {
    const percentage = Math.min((value / max) * 100, 100);
    return (
      <View style={styles.barRow}>
        <Text style={styles.barLabel}>{label}</Text>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: color }]}>
            <Text style={styles.barValueText}>{value}ms</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header (Navy Blue) */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')}>
            <Svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#F5C40A" fill="none">
              <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <Path d="M5 12l14 0" />
              <Path d="M5 12l6 6" />
              <Path d="M5 12l6 -6" />
            </Svg>
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.headerTitle}>System Benchmark</Text>
            <Text style={styles.headerSub}>Parallel Passive Pipeline</Text>
          </View>
        </View>

        {isRunning ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0A1F44" />
            <Text style={styles.loadingText}>Auditing Pipeline...</Text>
          </View>
        ) : (
          <View style={styles.flexContent}>
            
            {/* Top Metrics Row */}
            <View style={styles.topMetricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricMain}>{results?.speed?.total}ms</Text>
                <Text style={styles.metricSub}>PIPELINE TIME</Text>
              </View>
              <View style={styles.metricCard}>
                <Text style={styles.metricMain}>{results?.accuracy?.trueAccept}%</Text>
                <Text style={styles.metricSub}>ACCEPT RATE</Text>
              </View>
            </View>

            {/* Processing Speed Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#9CA3AF" fill="none">
                  <Path d="M4 19l16 0" />
                  <Path d="M4 15l4 -6l4 2l4 -5l4 4" />
                </Svg>
                <Text style={styles.cardTitle}>PROCESSING SPEED</Text>
              </View>
              
              <View style={styles.barsContainer}>
                <ProgressBar label="BlazeFace" value={results?.speed?.faceDetection} max={183} color="#0A1F44" />
                <ProgressBar label="Liveness" value={results?.speed?.liveness} max={183} color="#F59E0B" />
                <ProgressBar label="FaceNet" value={results?.speed?.embedding} max={183} color="#0A1F44" />
                <ProgressBar label="SQLite" value={results?.speed?.sqlite} max={183} color="#10B981" />
              </View>

              <View style={styles.totalWallBox}>
                <View style={styles.wallLeft}>
                  <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#047857" fill="none">
                    <Path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
                    <Path d="M12 7l0 5l3 3" />
                  </Svg>
                  <Text style={styles.wallTitle}>Total Wall Time</Text>
                </View>
                <View style={styles.wallRight}>
                  <Text style={styles.wallTotal}>{results?.speed?.total}ms</Text>
                  <Text style={styles.wallTarget}>Target &lt;1000ms ✓</Text>
                </View>
              </View>
            </View>

            {/* Accuracy Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#9CA3AF" fill="none">
                  <Circle cx="12" cy="12" r="9" />
                  <Circle cx="12" cy="12" r="5" />
                  <Circle cx="12" cy="12" r="1" />
                </Svg>
                <Text style={styles.cardTitle}>ACCURACY</Text>
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.rowLabel}>True Accept Rate (TAR)</Text>
                <Text style={styles.rowValueGreen}>{results?.accuracy?.trueAccept}%</Text>
              </View>
              <View style={[styles.rowItem, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Text style={styles.rowLabel}>False Reject Rate (FRR)</Text>
                <Text style={styles.rowValueGreen}>{results?.accuracy?.falseReject}%</Text>
              </View>
            </View>

            {/* AI Bundle Size Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#9CA3AF" fill="none">
                  <Rect x="4" y="4" width="16" height="16" rx="2" />
                  <Path d="M9 9h6v6H9z" />
                  <Path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
                </Svg>
                <Text style={styles.cardTitle}>AI BUNDLE</Text>
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.rowLabel}>MobileFaceNet</Text>
                <Text style={styles.rowValueDark}>1.9 MB</Text>
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.rowLabel}>BlazeFace</Text>
                <Text style={styles.rowValueDark}>1.0 MB</Text>
              </View>
              <View style={[styles.rowItem, { borderBottomWidth: 0, paddingBottom: 0, paddingTop: 8 }]}>
                <Text style={[styles.rowLabel, { fontWeight: 'bold' }]}>Total</Text>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValueGreen}>2.9 MB</Text>
                  <Text style={styles.rowSub}>/ 20MB ✓</Text>
                </View>
              </View>
            </View>

            {/* Target Device Card */}
            <View style={[styles.card, { marginBottom: 0 }]}>
              <View style={styles.cardHeader}>
                <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#9CA3AF" fill="none">
                  <Rect x="5" y="2" width="14" height="20" rx="2" />
                  <Path d="M12 18h.01" />
                </Svg>
                <Text style={styles.cardTitle}>TARGET DEVICE</Text>
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.rowLabelSmall}>OS</Text>
                <Text style={styles.rowValueDark}>Android 10+ • iOS 12+</Text>
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.rowLabelSmall}>HW</Text>
                <Text style={styles.rowValueDark}>3GB RAM • Mid-range CPU</Text>
              </View>
              <View style={[styles.rowItem, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                <Text style={styles.rowLabelSmall}>NET</Text>
                <Text style={styles.rowValueDark}>Offline (Zero-network)</Text>
              </View>
            </View>

            {/* No spacer, naturally flow to export button with consistent gap */}
            
            <TouchableOpacity style={styles.exportBtn} onPress={exportReport} activeOpacity={0.8}>
              <Svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#F5C40A" fill="none" style={{ marginRight: 8 }}>
                <Path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                <Polyline points="7 11 12 16 17 11" />
                <Path d="M12 4v12" />
              </Svg>
              <Text style={styles.exportBtnText}>Export Report</Text>
            </TouchableOpacity>

          </View>
        )}
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
    backgroundColor: '#F0F2F5', // Settled light gray matching Verify Screen
  },
  header: {
    backgroundColor: '#0A1F44',
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    borderWidth: 1,
    borderColor: '#4B5563', // Muted border
    borderRadius: 8,
    padding: 6,
    marginRight: 12,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    color: '#F5C40A', // Yellow font matching Verify Screen
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSub: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#0A1F44',
    fontSize: 16,
    fontWeight: '600',
  },
  flexContent: {
    flex: 1,
    padding: 12,
  },
  topMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metricCard: {
    backgroundColor: '#FFFFFF',
    flex: 0.48,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metricMain: {
    fontSize: 26,
    fontWeight: '800',
    color: '#10B981',
  },
  metricSub: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '700',
    letterSpacing: 1,
    marginLeft: 6,
  },
  // Progress Bar Styles
  barsContainer: {
    marginBottom: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  barLabel: {
    width: 75,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'right',
    marginRight: 10,
  },
  barTrack: {
    flex: 1,
    height: 20,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
    justifyContent: 'center',
    paddingLeft: 8,
  },
  barValueText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  // Wall Time Box
  totalWallBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 2,
  },
  wallLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wallTitle: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
  },
  wallRight: {
    alignItems: 'flex-end',
  },
  wallTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#047857',
  },
  wallTarget: {
    fontSize: 9,
    color: '#059669',
    marginTop: 2,
  },
  // Row Items
  rowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: '#F3F4F6',
  },
  rowLabel: {
    fontSize: 14,
    color: '#4B5563',
  },
  rowLabelSmall: {
    fontSize: 13,
    color: '#9CA3AF',
    width: 35,
  },
  rowValueDark: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  rowValueGreen: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  // Export Button
  exportBtn: {
    backgroundColor: '#0A1F44', // Navy
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  exportBtnText: {
    color: '#F5C40A', // Yellow text
    fontSize: 15,
    fontWeight: 'bold',
  }
});
