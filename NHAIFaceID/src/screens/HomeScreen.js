import React, { useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, TextInput, Animated, Easing } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import SyncBanner from '../components/SyncBanner';
import { getDBConnection } from '../services/localStorage';

export default function HomeScreen({ navigation }) {
  const [stats, setStats] = useState({
    enrolledCount: 142,
    verificationsToday: 89,
    pendingSync: 3
  });

  const [searchQuery, setSearchQuery] = useState('');

  const loadStats = async () => {
    try {
      const db = await getDBConnection();

      const [enrollRes] = await db.executeSql('SELECT COUNT(*) as count FROM enrolled_faces');
      const enrolledCount = enrollRes.rows.item(0).count;

      const [syncRes] = await db.executeSql('SELECT COUNT(*) as count FROM verification_log WHERE synced = 0');
      const pendingSync = syncRes.rows.item(0).count;

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
      const interval = setInterval(loadStats, 5000);
      return () => clearInterval(interval);
    }, [])
  );

  // Animated Progress Bar
  const verificationGoal = 100;
  const targetPercent = Math.min((stats.verificationsToday / verificationGoal) * 100, 100);
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: targetPercent,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [targetPercent]);

  const widthInterpolation = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // Animated HUD Pulse
  const hudPulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(hudPulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(hudPulseAnim, { toValue: 0, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, []);

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.appContainer}>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.logo}>NHAI</Text>
              <Text style={styles.logoSub}>DATALAKE 3.0 — FIELD AUTH</Text>
            </View>
          </View>

          {/* Body */}
          <View style={styles.body}>
            <SyncBanner pendingCount={stats.pendingSync} isSyncing={false} />

            <View>
              <Text style={styles.sectionLabel}>FIELD ACTIONS</Text>
              <View style={styles.cardsRow}>

                {/* Enroll Card (Gradient) */}
                <TouchableOpacity
                  style={[styles.actionCard]}
                  onPress={() => navigation.navigate('Enroll')}
                  activeOpacity={0.8}
                >
                  <View style={StyleSheet.absoluteFill}>
                    <Svg width="100%" height="100%">
                      <Defs>
                        <LinearGradient id="gradEnroll" x1="0%" y1="0%" x2="100%" y2="100%">
                          <Stop offset="0%" stopColor="#1E3A8A" />
                          <Stop offset="100%" stopColor="#3B82F6" />
                        </LinearGradient>
                      </Defs>
                      <Rect width="100%" height="100%" fill="url(#gradEnroll)" />
                    </Svg>
                  </View>
                  <View style={styles.glow} />
                  <View>
                    <View style={[styles.iconCircle, styles.iconCircleEnroll]}>
                      <Svg width="28" height="28" viewBox="0 0 24 24" strokeWidth="2" stroke="#1E3A8A" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <Path d="M10 9a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
                        <Path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
                        <Path d="M4 16v2a2 2 0 0 0 2 2h2" />
                        <Path d="M16 4h2a2 2 0 0 1 2 2v2" />
                        <Path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
                        <Path d="M8 16a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2" />
                      </Svg>
                    </View>
                    <Text style={styles.cardLabel}>Enroll</Text>
                    <View style={{ height: 23 }} />
                  </View>
                  <View style={styles.cardFooter}>
                    <View style={styles.actionPill}>
                      <Text style={styles.actionPillText}>TAP TO ENROLL</Text>
                      <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#fff" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
                        <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <Path d="M5 12l14 0" />
                        <Path d="M13 18l6 -6" />
                        <Path d="M13 6l6 6" />
                      </Svg>
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Verify Card (Gradient) */}
                <TouchableOpacity
                  style={[styles.actionCard]}
                  onPress={() => navigation.navigate('Verify')}
                  activeOpacity={0.8}
                >
                  <View style={StyleSheet.absoluteFill}>
                    <Svg width="100%" height="100%">
                      <Defs>
                        <LinearGradient id="gradVerify" x1="0%" y1="0%" x2="100%" y2="100%">
                          <Stop offset="0%" stopColor="#064E3B" />
                          <Stop offset="100%" stopColor="#10B981" />
                        </LinearGradient>
                      </Defs>
                      <Rect width="100%" height="100%" fill="url(#gradVerify)" />
                    </Svg>
                  </View>
                  <View style={styles.glow} />
                  <View>
                    <View style={[styles.iconCircle, styles.iconCircleVerify]}>
                      <Svg width="34" height="34" viewBox="0 0 24 24" strokeWidth="2" stroke="#ffffff" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <Path d="M18.9 7a8 8 0 0 1 1.1 5v1a6 6 0 0 0 .8 3" />
                        <Path d="M8 11a4 4 0 0 1 8 0v1a10 10 0 0 0 2 6" />
                        <Path d="M12 11v2a14 14 0 0 0 2.5 8" />
                        <Path d="M8 15a18 18 0 0 0 1.8 6" />
                        <Path d="M4.9 19a22 22 0 0 1 -.9 -7v-1a8 8 0 0 1 12 -6.95" />
                      </Svg>
                    </View>
                    <Text style={styles.cardLabel}>Verify</Text>
                    <View style={{ height: 23 }} />
                  </View>
                  <View style={styles.cardFooter}>
                    <View style={styles.actionPill}>
                      <Text style={styles.actionPillText}>TAP TO VERIFY</Text>
                      <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#fff" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}>
                        <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <Path d="M5 12l14 0" />
                        <Path d="M13 18l6 -6" />
                        <Path d="M13 6l6 6" />
                      </Svg>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Metrics Grid */}
            <View>
              <Text style={styles.sectionLabel}>QUICK METRICS</Text>
              <View style={styles.metricsGrid}>

                <TouchableOpacity style={[styles.metricBox, { backgroundColor: '#F0F4FF', borderColor: '#D1DDFB' }]} onPress={() => navigation.navigate('UserList')} activeOpacity={0.7}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricNum, { color: '#0A1F44' }]}>{stats.enrolledCount} / 100</Text>
                    <Text style={[styles.metricArrow, { color: '#8BA6DF' }]}>↗</Text>
                  </View>
                  <Text style={styles.metricLabel}>Total Enrolled</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.metricBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]} onPress={() => navigation.navigate('UserList')} activeOpacity={0.7}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricNum, { color: '#059669' }]}>{stats.verificationsToday} / {verificationGoal}</Text>
                    <Text style={[styles.metricArrow, { color: '#6EE7B7' }]}>↗</Text>
                  </View>
                  <Text style={styles.metricLabel}>Verified Today</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.metricBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]} onPress={() => navigation.navigate('UserList')} activeOpacity={0.7}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricNum, { color: '#D97706' }]}>{stats.pendingSync} / 100</Text>
                    <Text style={[styles.metricArrow, { color: '#FCD34D' }]}>↗</Text>
                  </View>
                  <Text style={styles.metricLabel}>Awaiting Sync</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.metricBox, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]} activeOpacity={0.7}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricNum, { color: '#7C3AED' }]}>98%</Text>
                  </View>
                  <Text style={styles.metricLabel}>Success Rate</Text>
                </TouchableOpacity>

              </View>
            </View>



            {/* Cyber-HUD System Health */}
            <View style={styles.diagBox}>
              <View style={styles.diagHeaderRow}>
                <Animated.View style={[styles.hudDot, { opacity: hudPulseAnim }]} />
                <Text style={styles.diagHead}>SYSTEM CORE: OPTIMAL</Text>
              </View>

              <View style={styles.hudRowContainer}>
                <View style={styles.hudBadge}>
                  <View style={styles.hudBadgeIcon}>
                    <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#10B981" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <Path d="M5 5m0 1a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z" />
                      <Path d="M9 9h6v6h-6z" />
                      <Path d="M3 10h2" />
                      <Path d="M3 14h2" />
                      <Path d="M10 3v2" />
                      <Path d="M14 3v2" />
                      <Path d="M21 10h-2" />
                      <Path d="M21 14h-2" />
                      <Path d="M14 21v-2" />
                      <Path d="M10 21v-2" />
                    </Svg>
                  </View>
                  <Text style={styles.hudBadgeText}>AI READY</Text>
                </View>
                <View style={styles.hudBadge}>
                  <View style={styles.hudBadgeIcon}>
                    <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#10B981" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <Path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
                      <Path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
                    </Svg>
                  </View>
                  <Text style={styles.hudBadgeText}>CAM ON</Text>
                </View>
                <View style={styles.hudBadge}>
                  <View style={styles.hudBadgeIcon}>
                    <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#10B981" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                      <Path d="M12 6m-8 0a8 3 0 1 0 16 0a8 3 0 1 0 -16 0" />
                      <Path d="M4 6v6a8 3 0 0 0 16 0v-6" />
                      <Path d="M4 12v6a8 3 0 0 0 16 0v-6" />
                    </Svg>
                  </View>
                  <Text style={styles.hudBadgeText}>DB SYNC</Text>
                </View>
              </View>
            </View>

            {/* Benchmark Button */}
            <TouchableOpacity style={styles.benchBtn} onPress={() => navigation.navigate('Benchmark')} activeOpacity={0.8}>
              <Svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#0A1F44" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
                <Path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <Path d="M3 12h4l3 -9l5 18l3 -9h6" />
              </Svg>
              <Text style={styles.benchBtnText}>RUN DIAGNOSTIC BENCHMARK</Text>
            </TouchableOpacity>

          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#0A1F44', // changed safe area back to navy for seamless look
  },
  appContainer: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    paddingBottom: 0,
  },
  header: {
    backgroundColor: '#0A1F44',
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontSize: 28,
    fontFamily: 'Rajdhani-Bold',
    fontWeight: 'bold',
    color: '#F5C40A',
    letterSpacing: 1.5,
    lineHeight: 28,
  },
  logoSub: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  workerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  workerTextContainer: {
    marginRight: 10,
    alignItems: 'flex-end',
  },
  workerName: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#fff',
  },
  workerSite: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5C40A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F5C40A',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  avatarText: {
    fontFamily: 'Rajdhani-Bold',
    fontSize: 16,
    color: '#0A1F44',
  },
  searchContainer: {
    backgroundColor: '#0A1F44',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchBar: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 44,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    height: '100%',
  },
  body: {
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flex: 1,
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  cardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionCard: {
    flex: 1,
    borderRadius: 18,
    paddingTop: 22,
    paddingHorizontal: 12,
    paddingBottom: 22,
    justifyContent: 'space-between',
    minHeight: 180,
    marginHorizontal: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircleEnroll: {
    backgroundColor: '#F5C40A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  iconCircleVerify: {
    // Transparent to merge with gradient
  },
  cardLabel: {
    fontSize: 26,
    fontFamily: 'Rajdhani-Bold',
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 0.5,
    lineHeight: 26,
  },
  cardSub: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 5,
    lineHeight: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 12,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionPillText: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    color: '#fff',
    letterSpacing: 1,
  },
  glow: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  metricBox: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 28,
    paddingHorizontal: 12,
    minHeight: 100,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  metricNum: {
    fontSize: 22,
    fontFamily: 'Rajdhani-Bold',
    lineHeight: 24,
  },
  metricArrow: {
    color: '#9CA3AF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  metricLabel: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
    flexShrink: 1,
  },
  progressContainer: {
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E0F2FE',
    flexShrink: 0, // Ensure it never gets crushed on small screens
    marginBottom: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  progressTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#1E3A8A',
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#3B82F6',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#BFDBFE',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },
  diagBox: {
    backgroundColor: '#FFFFFF', // Crisp clean white
    borderRadius: 14,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0', // Clean gray border
    marginBottom: 8,
  },
  diagHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  hudDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981', // Neon Green
    marginRight: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  diagHead: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#10B981',
    letterSpacing: 1.5,
  },
  hudRowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hudBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC', // Light slate background
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0', // Clean gray border
  },
  hudBadgeIcon: {
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hudBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    color: '#475569', // Dark slate text for light background
    letterSpacing: 0.5,
  },
  benchBtn: {
    width: '100%',
    marginTop: -8,
    backgroundColor: '#DBE2EB', // Slightly darker slate grey
    borderRadius: 12,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0', // Clean gray border
  },
  benchBtnText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: '#0A1F44', // Dark text for contrast against beige
    letterSpacing: 1,
  }
});
