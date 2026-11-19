// Zero-Knowledge Audit Log for NanoShield
// Persists redaction telemetry & cryptographic SHA-256 integrity proofs to Cloud Firestore.
// NEVER stores plain sensitive text or extracted PII values.

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, auth } from './firebase.js';

export async function saveAuditRecord({
  title = 'Sanitized Document',
  auditHash,
  charCount,
  entityCount,
  entitiesByType = {},
  source = 'IN_CLOUD',
  latencyMs = 0,
  modelName = 'gemini-2.5-flash',
  maskStyle = 'TAG',
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('User is not authenticated (anonymous session required)');
  }

  const recordId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ref = doc(db, 'users', uid, 'redactions', recordId);

  const cleanTypes = {};
  for (const [k, v] of Object.entries(entitiesByType)) {
    if (typeof v === 'number' && v > 0) cleanTypes[k] = v;
  }

  const recordData = {
    title: String(title).slice(0, 150),
    auditHash: String(auditHash),
    charCount: Number(charCount) || 0,
    entityCount: Number(entityCount) || 0,
    entitiesByType: cleanTypes,
    source: String(source),
    latencyMs: Number(latencyMs) || 0,
    modelName: String(modelName),
    maskStyle: String(maskStyle),
    createdAt: Date.now(),
  };

  await setDoc(ref, recordData);
  return { id: recordId, ...recordData };
}

export async function fetchAuditHistory(maxRecords = 20) {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];

  const q = query(
    collection(db, 'users', uid, 'redactions'),
    orderBy('createdAt', 'desc'),
    limit(maxRecords),
  );

  const snapshot = await getDocs(q);
  const records = [];
  snapshot.forEach((d) => {
    records.push({ id: d.id, ...d.data() });
  });
  return records;
}
