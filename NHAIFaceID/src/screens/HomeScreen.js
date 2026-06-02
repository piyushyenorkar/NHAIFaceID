import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import SyncBanner from '../components/SyncBanner';
import { EnrollIcon, LivenessIcon, VerifyIcon, BenchmarkIcon, SettingsIcon } from '../components/Icons';

export default function HomeScreen({ navigation }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  // Mock data for UI layout
  const stats = {
    enrolledCount: 142,
    verificationsToday: 89,
    pendingSync: 3
  };

  const systemStatus = {
    modelsLoaded: true,
    cameraReady: true,
    storageUsedMB: 12.4
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1A237E" />
      
      {/* App Bar / Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.logoText}>NHAI</Text>
          <Text style={styles.subtitle}>FaceID Security</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.clockContainer}>
            <Text style={styles.clockTime}>{formatTime(time)}</Text>
            <Text style={styles.clockDate}>{formatDate(time)}</Text>
          </View>
          <TouchableOpacity style={styles.settingsBtn} activeOpacity={0.7}>
            <SettingsIcon size={20} color="#F0F6FC" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Sync Status Banner */}
      <SyncBanner pendingCount={stats.pendingSync} isSyncing={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} scrollEnabled={false}>
        
        {/* Swapped M3 Grid Layout */}
        <View style={styles.gridContainer}>
          
          {/* HERO CARD: Enroll Personnel */}
          <TouchableOpacity 
            style={styles.heroCard} 
            onPress={() => navigation.navigate('Enroll')}
            activeOpacity={0.8}
          >
            <View style={styles.heroIconWrapper}>
              <EnrollIcon size={32} color="#E8B84B" />
            </View>
            <View style={styles.heroTextContainer}>
              <Text style={styles.heroTitle}>Enroll Personnel</Text>
              <Text style={styles.heroDesc}>Register new employee facial biometrics to local database</Text>
            </View>
          </TouchableOpacity>

          {/* TWO COLUMN GRID: Liveness and Verify */}
          <View style={styles.cardRow}>
            {/* LEFT COLUMN: Liveness */}
            <TouchableOpacity 
              style={styles.gridCard} 
              onPress={() => navigation.navigate('Liveness')}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeaderRow}>
                <LivenessIcon size={26} color="#E8B84B" />
              </View>
              <View>
                <Text style={styles.gridCardTitle}>Liveness Check</Text>
                <Text style={styles.gridCardDesc}>Run active anti-spoof checks</Text>
              </View>
            </TouchableOpacity>

            {/* RIGHT COLUMN: Verify */}
            <TouchableOpacity 
              style={styles.gridCard} 
              onPress={() => navigation.navigate('Verify')}
              activeOpacity={0.8}
            >
              <View style={styles.cardHeaderRow}>
                <VerifyIcon size={26} color="#E8B84B" />
              </View>
              <View>
                <Text style={styles.gridCardTitle}>Verify Identity</Text>
                <Text style={styles.gridCardDesc}>Identify personnel offline</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Stats Row */}
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

        {/* Compact System Diagnostics */}
        <View style={styles.diagnosticsCompact}>
          <View style={styles.diagItem}>
            <Text style={styles.diagLabel}>AI Models</Text>
            <Text style={[styles.diagValue, { color: '#238636' }]}>LOADED</Text>
          </View>
          <View style={styles.diagDivider} />
          <View style={styles.diagItem}>
            <Text style={styles.diagLabel}>Camera</Text>
            <Text style={[styles.diagValue, { color: '#238636' }]}>READY</Text>
          </View>
          <View style={styles.diagDivider} />
          <View style={styles.diagItem}>
            <Text style={styles.diagLabel}>DB Storage</Text>
            <Text style={styles.diagValue}>{systemStatus.storageUsedMB} MB</Text>
          </View>
        </View>

        {/* Compact System Benchmark Button */}
        <TouchableOpacity 
          style={styles.benchmarkBtnCompact}
          onPress={() => navigation.navigate('Benchmark')}
          activeOpacity={0.8}
        >
          <BenchmarkIcon size={14} color="#E8B84B" />
          <Text style={styles.benchmarkTextCompact}>Run System Benchmark</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1117', // Dark background
  },
  header: {
    height: 64,
    backgroundColor: '#1A237E', // NHAI Official Navy Darkened
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#30363D',
  },
  headerLeft: {
    flexDirection: 'column',
  },
  logoText: {
    color: '#E8B84B', // NHAI gold
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#F0F6FC',
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clockContainer: {
    alignItems: 'flex-end',
    marginRight: 12,
  },
  clockTime: {
    color: '#F0F6FC',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  clockDate: {
    color: '#8B949E',
    fontSize: 9,
    fontWeight: '500',
  },
  settingsBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#161B22',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363D',
  },
  scrollContent: {
    padding: 16,
    flex: 1,
    justifyContent: 'space-between',
  },
  gridContainer: {
    marginBottom: 8,
  },
  heroCard: {
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363D',
    borderLeftWidth: 4,
    borderLeftColor: '#E8B84B',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: '#30363D',
  },
  heroTextContainer: {
    flex: 1,
  },
  heroTitle: {
    color: '#F0F6FC',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  heroDesc: {
    color: '#8B949E',
    fontSize: 12,
    lineHeight: 16,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#30363D',
    padding: 14,
    marginHorizontal: 4,
    minHeight: 115,
    justifyContent: 'space-between',
  },
  cardHeaderRow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363D',
  },
  gridCardTitle: {
    color: '#F0F6FC',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 2,
  },
  gridCardDesc: {
    color: '#8B949E',
    fontSize: 10,
    lineHeight: 13,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#161B22',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#30363D',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#E8B84B',
  },
  statLabel: {
    fontSize: 10,
    color: '#8B949E',
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  diagnosticsCompact: {
    flexDirection: 'row',
    backgroundColor: '#161B22',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#30363D',
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  diagItem: {
    flex: 1,
    alignItems: 'center',
  },
  diagLabel: {
    fontSize: 9,
    color: '#8B949E',
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  diagValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F0F6FC',
  },
  diagDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#30363D',
  },
  benchmarkBtnCompact: {
    flexDirection: 'row',
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: '#30363D',
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  benchmarkTextCompact: {
    color: '#E8B84B',
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 6,
  }
});
