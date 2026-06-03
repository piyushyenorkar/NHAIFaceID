import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated } from 'react-native';

export default function SyncBanner({ pendingCount = 0, isSyncing = false }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pendingCount > 0 && !isSyncing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0,
            duration: 650,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      pulseAnim.setValue(0);
    }
  }, [pendingCount, isSyncing]);

  const isSynced = pendingCount === 0;

  return (
    <View style={[styles.banner, isSynced ? styles.bannerSynced : styles.bannerOffline]}>
      <Animated.View style={[
        styles.pulse, 
        isSynced ? styles.pulseSynced : styles.pulseOffline,
        { 
          opacity: isSynced ? 1 : pulseAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.25, 1]
          })
        }
      ]} />
      
      <View style={styles.textContainer}>
        <Text style={[styles.title, isSynced ? styles.titleSynced : styles.titleOffline]}>
          {isSynced ? 'All records synced' : 'Offline Mode'}
        </Text>
        {!isSynced && (
          <Text style={styles.subtitle}>
            {isSyncing ? 'Syncing...' : `${pendingCount} records waiting to sync`}
          </Text>
        )}
      </View>
      
      {!isSynced && (
        <View style={styles.queuedBadge}>
          <Text style={styles.badgeText}>
            {isSyncing ? 'SYNCING' : `🔄 WAITING`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerOffline: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  bannerSynced: {
    backgroundColor: '#F0FDF4',
    borderColor: '#22C55E',
  },
  pulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  pulseOffline: {
    backgroundColor: '#D97706',
  },
  pulseSynced: {
    backgroundColor: '#16A34A',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  titleOffline: {
    color: '#92400E',
  },
  titleSynced: {
    color: '#166534',
  },
  subtitle: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#B45309',
    marginTop: 2,
  },
  queuedBadge: {
    backgroundColor: '#F59E0B',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  badgeText: {
    color: '#78350F',
    fontSize: 11,
    fontFamily: 'Rajdhani-Bold',
    letterSpacing: 0.5,
  }
});
