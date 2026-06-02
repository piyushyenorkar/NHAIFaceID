import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SyncBanner({ pendingCount = 0, isSyncing = false }) {
  let statusText = 'Online';
  let message = 'All database records synced to Datalake 3.0';
  let estimateText = 'Database is up to date';
  
  let dotColor = '#1E7E34'; // Success Green (Light Mode)
  let statusTextColor = '#1E7E34';

  if (isSyncing) {
    statusText = 'Syncing';
    message = 'Syncing offline records to AWS cloud...';
    estimateText = 'Connection active';
    dotColor = '#1A237E'; // Navy
    statusTextColor = '#1A237E';
  } else if (pendingCount > 0) {
    statusText = 'Offline';
    message = `${pendingCount} records pending sync`;
    estimateText = 'Est. sync in ~2hrs (low coverage)';
    dotColor = '#B7791F'; // Warning Amber
    statusTextColor = '#B7791F';
  }

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={[styles.statusText, { color: statusTextColor }]}>{statusText}</Text>
        </View>
        <Text style={styles.messageText}>{message}</Text>
        {pendingCount > 0 && <Text style={styles.estimateText}>{estimateText}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    width: '100%',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 13,
  },
  estimateText: {
    color: '#475569',
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  }
});
