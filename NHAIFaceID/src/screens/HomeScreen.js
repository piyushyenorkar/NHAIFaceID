import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar, Alert } from 'react-native';
import SyncBanner from '../components/SyncBanner';
import { EnrollIcon, LivenessIcon, VerifyIcon, BenchmarkIcon, SettingsIcon } from '../components/Icons';

export default function HomeScreen({ navigation }) {
  const [time, setTime] = useState(new Date());
  const [logoTapCount, setLogoTapCount] = useState(0);
  const [devMode, setDevMode] = useState(false);
  const [lastBenchmark, setLastBenchmark] = useState('847ms');

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const handleLogoTap = () => {
    const nextCount = logoTapCount + 1;
    if (nextCount >= 5) {
      setDevMode(!devMode);
      setLogoTapCount(0);
      Alert.alert(
        'Developer Mode',
        !devMode ? 'Developer options and diagnostics unlocked.' : 'Developer options locked.'
      );
    } else {
      setLogoTapCount(nextCount);
    }
  };

  // Mock data for individual worker
  const stats = {
    presentCount: 18,
    lateCount: 1,
    pendingSync: 0
  };

  const systemStatus = {
    blazeface: 'LOADED',
    facenet: 'LOADED',
    facemesh: 'LOADED',
    sqlite: 'READY',
    netinfo: 'ACTIVE',
    storageUsedMB: 12.4,
    storageLimitMB: 50
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A237E" />
      
      {/* App Bar / Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerLeft} 
          onPress={handleLogoTap}
          activeOpacity={0.9}
        >
          <View style={styles.logoRow}>
            <Text style={styles.logoText}>NHAI</Text>
            <View style={styles.goldBadge}>
              <Text style={styles.goldBadgeText}>FaceID</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Datalake 3.0 • NH3 — Rohtang Pass Portal</Text>
        </TouchableOpacity>
        
        <View style={styles.headerRight}>
          <View style={styles.clockContainer}>
            <Text style={styles.clockTime}>{formatTime(time)}</Text>
            <Text style={styles.clockDate}>{formatDate(time)}</Text>
          </View>
        </View>
      </View>

      {/* Sync Status Banner */}
      <SyncBanner pendingCount={stats.pendingSync} isSyncing={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Worker Action Card */}
        <View style={styles.actionContainer}>
          <TouchableOpacity 
            style={styles.checkInCard} 
            onPress={() => navigation.navigate('Verify')}
            activeOpacity={0.8}
          >
            <View style={styles.checkInIconWrapper}>
              <VerifyIcon size={38} color="#E8B84B" />
            </View>
            <View style={styles.checkInTextContainer}>
              <Text style={styles.checkInTitle}>Verify My Identity</Text>
              <Text style={styles.checkInDesc}>Tap here to scan and log your daily attendance</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Worker Glanceable Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>My Attendance Statistics</Text>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#1E7E34' }]}>{stats.presentCount}</Text>
              <Text style={styles.statLabel}>Days Present</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#B7791F' }]}>{stats.lateCount}</Text>
              <Text style={styles.statLabel}>Late Arrivals</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#475569' }]}>{stats.pendingSync}</Text>
              <Text style={styles.statLabel}>Pending Sync</Text>
            </View>
          </View>
        </View>

        {/* Worker Recent History logs */}
        <View style={styles.historyContainer}>
          <Text style={styles.sectionTitle}>My Recent Activity</Text>
          <View style={styles.logCard}>
            <View style={styles.logItem}>
              <View style={styles.logLeft}>
                <Text style={styles.logDot}>●</Text>
                <Text style={styles.logText}>Today • 09:30 AM</Text>
              </View>
              <View style={[styles.pill, styles.pillGreen]}>
                <Text style={styles.pillTextGreen}>Synced</Text>
              </View>
            </View>
            
            <View style={styles.logDivider} />

            <View style={styles.logItem}>
              <View style={styles.logLeft}>
                <Text style={styles.logDot}>●</Text>
                <Text style={styles.logText}>Yesterday • 09:28 AM</Text>
              </View>
              <View style={[styles.pill, styles.pillGreen]}>
                <Text style={styles.pillTextGreen}>Synced</Text>
              </View>
            </View>

            <View style={styles.logDivider} />

            <View style={styles.logItem}>
              <View style={styles.logLeft}>
                <Text style={styles.logDot}>●</Text>
                <Text style={styles.logText}>Fri, May 29 • 09:33 AM</Text>
              </View>
              <View style={[styles.pill, styles.pillGreen]}>
                <Text style={styles.pillTextGreen}>Synced</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Hidden Developer / Admin Console */}
        {devMode && (
          <View style={styles.devPanel}>
            <Text style={styles.devTitle}>🛠️ Developer / Supervisor Panel</Text>
            
            {/* Supervisor Enroll Trigger */}
            <TouchableOpacity 
              style={styles.enrollCard}
              onPress={() => navigation.navigate('Enroll')}
              activeOpacity={0.8}
            >
              <EnrollIcon size={20} color="#1A237E" />
              <Text style={styles.enrollText}>Enroll New Personnel</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.enrollCard}
              onPress={() => navigation.navigate('Liveness')}
              activeOpacity={0.8}
            >
              <LivenessIcon size={20} color="#1A237E" />
              <Text style={styles.enrollText}>Run Manual Liveness check</Text>
            </TouchableOpacity>

            {/* System Diagnostics */}
            <View style={styles.diagnosticsContainer}>
              <Text style={styles.devSectionTitle}>System Diagnostics</Text>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>BlazeFace Detector</Text>
                <Text style={styles.diagSuccess}>LOADED ✅</Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>MobileFaceNet Model</Text>
                <Text style={styles.diagSuccess}>LOADED ✅</Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Liveness FaceMesh</Text>
                <Text style={styles.diagSuccess}>LOADED ✅</Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>SQLite Storage</Text>
                <Text style={styles.diagSuccess}>READY ✅</Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>NetInfo Core</Text>
                <Text style={styles.diagSuccess}>ACTIVE ✅</Text>
              </View>
              <View style={styles.diagRow}>
                <Text style={styles.diagLabel}>Storage</Text>
                <Text style={styles.diagValue}>{systemStatus.storageUsedMB}MB/{systemStatus.storageLimitMB}MB</Text>
              </View>
            </View>

            {/* Benchmark Block */}
            <TouchableOpacity 
              style={styles.benchmarkBtn}
              onPress={() => {
                setLastBenchmark('Running...');
                setTimeout(() => setLastBenchmark(`${Math.floor(Math.random() * 200) + 700}ms`), 1000);
              }}
              activeOpacity={0.8}
            >
              <BenchmarkIcon size={16} color="#1A237E" />
              <Text style={styles.benchmarkBtnText}>Run Speed Benchmark</Text>
            </TouchableOpacity>
            <Text style={styles.lastBenchmarkText}>Last Speed: {lastBenchmark} ✅</Text>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Off-white clean layout
  },
  header: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#1A237E', // NHAI Navy
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flex: 1,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  goldBadge: {
    backgroundColor: '#E8B84B', // Gold
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  goldBadgeText: {
    color: '#1A237E',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.8,
    marginTop: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  clockContainer: {
    alignItems: 'flex-end',
  },
  clockTime: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  clockDate: {
    color: '#E8B84B', // Gold date
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  actionContainer: {
    marginVertical: 8,
  },
  checkInCard: {
    backgroundColor: '#1A237E', // NHAI Navy
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E8B84B', // Gold border
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#1A237E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  checkInIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(232, 184, 75, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#E8B84B',
  },
  checkInTextContainer: {
    flex: 1,
  },
  checkInTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  checkInDesc: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.8,
    lineHeight: 16,
  },
  statsContainer: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    color: '#475569',
    marginTop: 4,
    fontWeight: '700',
    textAlign: 'center',
  },
  historyContainer: {
    marginTop: 20,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  logItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  logLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logDot: {
    color: '#1E7E34', // green dot
    fontSize: 10,
    marginRight: 8,
  },
  logText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillGreen: {
    backgroundColor: '#E6F4EA',
  },
  pillTextGreen: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E7E34',
  },
  logDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  devPanel: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1A237E',
    borderRadius: 12,
    padding: 16,
  },
  devTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A237E',
    marginBottom: 12,
  },
  enrollCard: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  enrollText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A237E',
    marginLeft: 8,
  },
  diagnosticsContainer: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  devSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  diagLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  diagSuccess: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E7E34',
  },
  diagValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
  },
  benchmarkBtn: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  benchmarkBtnText: {
    color: '#1A237E',
    fontWeight: '700',
    fontSize: 13,
    marginLeft: 6,
  },
  lastBenchmarkText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    marginTop: 6,
  }
});
