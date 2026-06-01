import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SyncBanner({ pendingCount = 0, isSyncing = false }) {
  let message = 'All synced';
  let bannerColor = '#28a745'; // Green for all synced

  if (isSyncing) {
    message = 'Syncing...';
    bannerColor = '#17a2b8'; // Blue for syncing
  } else if (pendingCount > 0) {
    message = `OFFLINE — ${pendingCount} records queued`;
    bannerColor = '#dc3545'; // Red for offline queue
  }

  return (
    <View style={[styles.container, { backgroundColor: bannerColor }]}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  }
});
