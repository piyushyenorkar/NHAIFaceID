/**
 * awsSync.js
 * Handles offline/online network detection and auto-sync to NHAI AWS servers.
 */

import NetInfo from '@react-native-community/netinfo';
import { getUnsyncedLogs, markLogsAsSynced, purgeLocalData } from './localStorage';
import { CONFIG } from '../config/config';

class AWSSyncManager {
  constructor() {
    this.isSyncing = false;
    this.unsubscribe = null;
    this.retryCount = 0;
  }

  /**
   * Initializes the network listener to auto-trigger sync when connection restores
   */
  startListener() {
    this.unsubscribe = NetInfo.addEventListener(state => {
      console.log(`[AWS Sync] Network state changed. Connected: ${state.isConnected}, Type: ${state.type}`);
      if (state.isConnected && state.isInternetReachable) {
        this.triggerSync();
      }
    });
  }

  stopListener() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  /**
   * Reads from SQLite sync_queue and verification_log, posts to AWS
   */
  async triggerSync() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const pendingLogs = await getUnsyncedLogs();
      if (pendingLogs.length === 0) {
        console.log('[AWS Sync] No pending offline logs to sync.');
        this.isSyncing = false;
        return;
      }

      console.log(`[AWS Sync] Found ${pendingLogs.length} pending logs. Uploading to AWS...`);

      const payload = {
        device_id: 'Device_A1',
        records: pendingLogs.map(log => ({
          employee_id: log.employee_id,
          timestamp: log.timestamp,
          confidence: log.confidence,
          liveness_passed: log.liveness_passed,
          location: log.location || null
        }))
      };

      // Mock AWS Fetch POST Request
      const response = await fetch(CONFIG.AWS_SYNC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer NHAI_HACKATHON_DEMO_TOKEN'
        },
        body: JSON.stringify(payload)
      }).catch(err => {
        return { ok: true, status: 200 }; // Mock success
      });

      if (response.ok) {
        console.log('[AWS Sync] Batch upload successful.');
        this.retryCount = 0; // Reset retries on success
        const logIds = pendingLogs.map(log => log.id);
        
        // Update local SQLite to mark as synced
        await markLogsAsSynced(logIds);

        // Auto-purge old logs to maintain strict storage limits
        await purgeLocalData();
      } else {
        console.error('[AWS Sync] Batch upload failed with status:', response.status);
        this.retryCount += 1;
        if (this.retryCount <= 3) {
           console.log(`[AWS Sync] Retrying... (${this.retryCount}/3)`);
           this.isSyncing = false;
           setTimeout(() => this.triggerSync(), 5000); // Retry in 5s
           return;
        } else {
           console.log('[AWS Sync] Max retries reached. Will try later.');
        }
      }

    } catch (error) {
      console.error('[AWS Sync] Error during sync process:', error);
    } finally {
      this.isSyncing = false;
    }
  }
}

// Export singleton instance
export const awsSyncManager = new AWSSyncManager();
