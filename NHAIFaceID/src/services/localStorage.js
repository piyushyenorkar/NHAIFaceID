/**
 * databaseService.js
 * Handles all local SQLite CRUD operations for NHAIFaceID.
 * Tables: enrolled_faces, verification_log, sync_queue
 */

import SQLite from 'react-native-sqlite-storage';

// Ensure promises are enabled for sqlite
SQLite.enablePromise(true);

const DB_NAME = 'nhai_faceid.db';

export async function getDBConnection() {
  return SQLite.openDatabase({ name: DB_NAME, location: 'default' });
}

export async function initDB() {
  const db = await getDBConnection();
  
  await db.transaction(async (tx) => {
    // Table 1: enrolled_faces
    await tx.executeSql(`
      CREATE TABLE IF NOT EXISTS enrolled_faces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        embedding TEXT NOT NULL,
        thumbnail_path TEXT,
        enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        enrolled_by TEXT,
        synced BOOLEAN DEFAULT 0
      );
    `);

    // Table 2: verification_log
    await tx.executeSql(`
      CREATE TABLE IF NOT EXISTS verification_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT,
        matched BOOLEAN,
        confidence REAL,
        liveness_passed BOOLEAN,
        liveness_score REAL,
        pipeline_ms INTEGER,
        device_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced BOOLEAN DEFAULT 0
      );
    `);

    // Table 3: sync_queue
    await tx.executeSql(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_type TEXT,
        record_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT
      );
    `);
  });

  console.log('[SQLite] Database and tables initialized successfully');
  return db;
}

export async function insertEnrolledFace(employeeId, name, embeddingArray) {
  const db = await getDBConnection();
  const embeddingStr = JSON.stringify(embeddingArray);
  
  await db.executeSql(
    `INSERT INTO enrolled_faces (employee_id, name, embedding) VALUES (?, ?, ?)`,
    [employeeId, name, embeddingStr]
  );
}

export async function insertVerificationLog(logData) {
  const db = await getDBConnection();
  const { employee_id, matched, confidence, liveness_passed, liveness_score, pipeline_ms, device_id } = logData;
  
  await db.executeSql(
    `INSERT INTO verification_log (employee_id, matched, confidence, liveness_passed, liveness_score, pipeline_ms, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [employee_id, matched, confidence, liveness_passed, liveness_score, pipeline_ms, device_id]
  );
}

export async function getUnsyncedLogs() {
  const db = await getDBConnection();
  const [results] = await db.executeSql(`SELECT * FROM verification_log WHERE synced = 0`);
  
  const logs = [];
  for (let i = 0; i < results.rows.length; i++) {
    logs.push(results.rows.item(i));
  }
  return logs;
}

export async function markLogsAsSynced(logIds) {
  if (!logIds || logIds.length === 0) return;
  const db = await getDBConnection();
  const idsStr = logIds.join(',');
  await db.executeSql(`UPDATE verification_log SET synced = 1 WHERE id IN (${idsStr})`);
}

export async function purgeLocalData() {
  const db = await getDBConnection();
  // Delete logs older than 24 hours that are synced
  // SQLite DATE('now', '-1 day') syntax
  await db.executeSql(`
    DELETE FROM verification_log 
    WHERE synced = 1 AND timestamp < datetime('now', '-1 day')
  `);
  console.log('[SQLite] Purged old synced logs');
}
