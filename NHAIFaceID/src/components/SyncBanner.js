import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SyncBanner({ pendingCount = 0, isSyncing = false }) {
  let message = 'All database records synced to Datalake 3.0';
  let theme = {
    bg: '#F0FDF4',       // Soft green
    text: '#166534',     // Deep green
    border: '#DCFCE7',   // Light green border
    dot: '#22C55E',      // Bright green dot
  };

  if (isSyncing) {
    message = 'Syncing offline records to AWS cloud...';
    theme = {
      bg: '#EFF6FF',     // Soft blue
      text: '#1E40AF',     // Deep blue
      border: '#DBEAFE',   // Light blue border
      dot: '#3B82F6',      // Bright blue dot
    };
  } else if (pendingCount > 0) {
    message = `Offline — ${pendingCount} checks pending sync`;
    theme = {
      bg: '#FFF1F2',     // Soft red/pink
      text: '#9F1239',     // Deep red
      border: '#FFE4E6',   // Light red border
      dot: '#F43F5E',      // Bright red dot
    };
  }

  return (
    <View style={styles.outerContainer}>
      <View style={[styles.container, { backgroundColor: theme.bg, borderColor: theme.border }]}>
        <View style={[styles.dot, { backgroundColor: theme.dot }]} />
        <Text style={[styles.text, { color: theme.text }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
    alignItems: 'center',
    width: '100%',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  text: {
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.3,
  }
});

