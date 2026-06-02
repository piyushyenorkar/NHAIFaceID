import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Rect, Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import SyncBanner from '../components/SyncBanner';
import { EnrollIcon, LivenessIcon, VerifyIcon, BenchmarkIcon } from '../components/Icons';
import { getDBConnection } from '../services/localStorage';

// Custom header background using SVG for gradient and road graphics
function HeaderBackground() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#0B3C95" />
          <Stop offset="100%" stopColor="#041E50" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#headerGrad)" />

      {/* Highway curve lines */}
      <Path
        d="M-20,110 C100,85 180,45 340,55 C420,60 480,85 600,75"
        fill="none"
        stroke="#F59E0B"
        strokeWidth="3.5"
        opacity="0.35"
      />
      <Path
        d="M-20,118 C100,93 180,53 340,63 C420,68 480,93 600,83"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeDasharray="6,6"
        opacity="0.6"
      />
    </Svg>
  );
}

function ChevronRight({ size = 18, color = '#94A3B8' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

export default function HomeScreen({ navigation }) {
  const [stats, setStats] = useState({
    enrolledCount: 0,
    verificationsToday: 0,
    pendingSync: 0
  });

  const loadStats = async () => {
    try {
      const db = await getDBConnection();
      
      const [enrollRes] = await db.executeSql('SELECT COUNT(*) as count FROM enrolled_faces');
      const enrolledCount = enrollRes.rows.item(0).count;

      const [syncRes] = await db.executeSql('SELECT COUNT(*) as count FROM verification_log WHERE synced = 0');
      const pendingSync = syncRes.rows.item(0).count;

      // Verifications today
      const [todayRes] = await db.executeSql("SELECT COUNT(*) as count FROM verification_log WHERE timestamp >= date('now')");
      const verificationsToday = todayRes.rows.item(0).count;

      setStats({ enrolledCount, verificationsToday, pendingSync });
    } catch (e) {
      console.log('[HomeScreen] Failed to load stats:', e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadStats();
      // Optional: Polling every 5s while focused to update sync status automatically
      const interval = setInterval(loadStats, 5000);
      return () => clearInterval(interval);
    }, [])
  );

  const systemStatus = {
    modelsLoaded: true,
    cameraReady: true,
    storageUsedMB: 12.4,
    storageLimitMB: 50.0
  };

  const storagePercentage = `${(systemStatus.storageUsedMB / systemStatus.storageLimitMB) * 100}%`;

  return (
    <View style={styles.container}>
      {/* Redesigned Premium Header */}
      <View style={styles.header}>
        <HeaderBackground />
        <View style={styles.headerContent}>
          <Text style={styles.logoText}>NHAI</Text>
          <Text style={styles.subtitle}>Datalake 3.0 — Field Authentication</Text>
        </View>
      </View>

      <SyncBanner pendingCount={stats.pendingSync} isSyncing={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Action Cards */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Enroll')}
            activeOpacity={0.7}
          >
            <View style={styles.goldBar} />
            <View style={styles.cardIconWrapper}>
              <EnrollIcon size={26} color="#0B3C95" />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Enroll New Personnel</Text>
              <Text style={styles.cardDesc}>Register a new biometric face profile</Text>
            </View>
            <ChevronRight />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Liveness')}
            activeOpacity={0.7}
          >
            <View style={styles.goldBar} />
            <View style={styles.cardIconWrapper}>
              <LivenessIcon size={26} color="#0B3C95" />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Run Liveness Check</Text>
              <Text style={styles.cardDesc}>Perform randomized anti-spoof challenge</Text>
            </View>
            <ChevronRight />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Verify')}
            activeOpacity={0.7}
          >
            <View style={styles.goldBar} />
            <View style={styles.cardIconWrapper}>
              <VerifyIcon size={26} color="#0B3C95" />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Verify Identity</Text>
              <Text style={styles.cardDesc}>Identify personnel using offline database</Text>
            </View>
            <ChevronRight />
          </TouchableOpacity>
        </View>

        {/* Live Stats Row */}
        <TouchableOpacity onPress={() => navigation.navigate('UserList')} activeOpacity={0.7}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.enrolledCount}</Text>
              <Text style={styles.statLabel}>Enrolled</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.verificationsToday}</Text>
              <Text style={styles.statLabel}>Verified Today</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.pendingSync}</Text>
              <Text style={styles.statLabel}>Pending Sync</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Redesigned System Status & Storage Panel */}
        <View style={styles.panelContainer}>
          <Text style={styles.sectionTitle}>System Diagnostics</Text>

          {/* Models Status */}
          <View style={styles.statusRowItem}>
            <Text style={styles.statusLabel}>AI Models (TFLite)</Text>
            <View style={[styles.pill, styles.pillGreen]}>
              <Text style={styles.pillTextGreen}>LOADED</Text>
            </View>
          </View>

          {/* Camera Status */}
          <View style={styles.statusRowItem}>
            <Text style={styles.statusLabel}>Vision Camera</Text>
            <View style={[styles.pill, styles.pillGreen]}>
              <Text style={styles.pillTextGreen}>READY</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Storage Gauge */}
          <View style={styles.storageContainer}>
            <View style={styles.storageLabelRow}>
              <Text style={styles.statusLabel}>Local DB Storage</Text>
              <Text style={styles.storageValue}>{systemStatus.storageUsedMB} MB / {systemStatus.storageLimitMB} MB</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: storagePercentage }]} />
            </View>
          </View>
        </View>

        {/* Benchmark Button */}
        <TouchableOpacity
          style={styles.benchmarkBtn}
          onPress={() => navigation.navigate('Benchmark')}
          activeOpacity={0.8}
        >
          <BenchmarkIcon size={18} color="#0B3C95" />
          <Text style={styles.benchmarkText}>Run System Benchmark</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Sleek off-white background
  },
  header: {
    height: 120,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  headerContent: {
    paddingHorizontal: 24,
    zIndex: 1,
  },
  logoText: {
    color: '#FFD700', // Gold logo
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    marginTop: 2,
    fontWeight: '500',
    opacity: 0.9,
  },
  scrollContent: {
    padding: 20,
  },
  actionsContainer: {
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  goldBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#F59E0B', // Premium gold strip
  },
  cardIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF', // Light blue circle accent
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginLeft: 4,
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    color: '#0F172A', // Slate 900
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardDesc: {
    color: '#64748B', // Slate 500
    fontSize: 12,
    fontWeight: '400',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
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
    color: '#0B3C95',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  panelContainer: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 16,
  },
  statusRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155', // Slate 700
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pillGreen: {
    backgroundColor: '#DCFCE7', // Light green
  },
  pillTextGreen: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D', // Deep green text
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  storageContainer: {
    marginTop: 2,
  },
  storageLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  storageValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0B3C95', // Primary blue fill
    borderRadius: 3,
  },
  benchmarkBtn: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 24,
  },
  benchmarkText: {
    color: '#0B3C95',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 8,
  }
});

