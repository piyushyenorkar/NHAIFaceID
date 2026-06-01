import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import SyncBanner from '../components/SyncBanner';

export default function HomeScreen({ navigation }) {
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logoText}>NHAI</Text>
        <Text style={styles.subtitle}>Datalake 3.0 — Field Authentication</Text>
      </View>

      <SyncBanner pendingCount={stats.pendingSync} isSyncing={false} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Action Cards */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={styles.card} 
            onPress={() => navigation.navigate('Verify')}
          >
            <Text style={styles.cardIcon}>🔍</Text>
            <Text style={styles.cardText}>Verify My Identity</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.card} 
            onPress={() => navigation.navigate('Enroll')}
          >
            <Text style={styles.cardIcon}>📝</Text>
            <Text style={styles.cardText}>Enroll New Personnel</Text>
          </TouchableOpacity>
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

        {/* System Status */}
        <View style={styles.systemStatusContainer}>
          <Text style={styles.sectionTitle}>System Status</Text>
          <Text style={styles.statusText}>Models Loaded: {systemStatus.modelsLoaded ? '✅' : '❌'}</Text>
          <Text style={styles.statusText}>Camera Ready: {systemStatus.cameraReady ? '✅' : '❌'}</Text>
          <Text style={styles.statusText}>Storage: {systemStatus.storageUsedMB} MB</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    backgroundColor: '#003087',
    paddingVertical: 20,
    alignItems: 'center',
  },
  logoText: {
    color: '#FFD700',
    fontSize: 32,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 4,
  },
  scrollContent: {
    padding: 16,
  },
  actionsContainer: {
    marginVertical: 16,
  },
  card: {
    backgroundColor: '#003087',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  cardText: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#003087',
  },
  statLabel: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 4,
    textAlign: 'center',
  },
  systemStatusContainer: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#003087',
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
  },
  benchmarkBtn: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  benchmarkText: {
    color: '#333',
    fontWeight: 'bold',
  }
});
