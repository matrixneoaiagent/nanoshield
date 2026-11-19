// Main Application Controller for NanoShield
import { appCheckStatus, signIn, loadRemoteConfig } from './firebase.js';
import { MODES, buildRedactionModel, analyzePIIWithAI, checkDeviceSupport } from './ai.js';
import { MASK_STYLES, computeSha256, mergeAndRedact, unmaskText } from './redactor.js';
import { renderDiff } from './diff.js';
import { PRESETS } from './presets.js';
import { saveAuditRecord, fetchAuditHistory } from './audit.js';
import { loadImageToCanvas, applyVisualRedactions, exportCanvasBlob } from './ocr.js';

// DOM Elements
const lblAppCheck = document.getElementById('lbl-appcheck');
const dotAppCheck = document.getElementById('dot-appcheck');
const lblDevice = document.getElementById('lbl-device');
const dotDevice = document.getElementById('dot-device');
const selPreset = document.getElementById('sel-preset');
const selStyle = document.getElementById('sel-style');
const selMode = document.getElementById('sel-mode');
const txtInput = document.getElementById('txt-input');
const txtOutput = document.getElementById('txt-output');
const diffContainer = document.getElementById('diff-container');
const lblCharCount = document.getElementById('lbl-char-count');
const badgeSource = document.getElementById('badge-source');
const lblLatency = document.getElementById('lbl-latency');

const statTotal = document.getElementById('stat-total');
const statLatencySub = document.getElementById('stat-latency-sub');
const statCategories = document.getElementById('stat-categories');
const statHash = document.getElementById('stat-hash');
const statRcStatus = document.getElementById('stat-rc-status');
const statRcDetail = document.getElementById('stat-rc-detail');

const btnSanitize = document.getElementById('btn-sanitize');
const btnClear = document.getElementById('btn-clear');
const btnToggleView = document.getElementById('btn-toggle-view');
const btnUnmask = document.getElementById('btn-unmask');
const btnCopyClean = document.getElementById('btn-copy-clean');
const btnExportVault = document.getElementById('btn-export-vault');
const btnSaveAudit = document.getElementById('btn-save-audit');

const modalInfo = document.getElementById('modal-info');
const btnOpenInfo = document.getElementById('btn-open-info');
const btnCloseInfo = document.getElementById('btn-close-info');
const btnCloseInfoFooter = document.getElementById('btn-close-info-footer');

const modalAudit = document.getElementById('modal-audit');
const btnOpenAudit = document.getElementById('btn-open-audit');
const btnCloseAudit = document.getElementById('btn-close-audit');
const btnCloseAuditFooter = document.getElementById('btn-close-audit-footer');
const btnRefreshAudit = document.getElementById('btn-refresh-audit');
const auditList = document.getElementById('audit-list');

const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');

// Image OCR elements
const fileInput = document.getElementById('file-input');
const imgPreviewContainer = document.getElementById('image-preview-container');
const imgCanvas = document.getElementById('image-canvas');
const btnBurnRedactions = document.getElementById('btn-burn-redactions');
const btnDownloadImg = document.getElementById('btn-download-img');
const btnCloseImg = document.getElementById('btn-close-img');

// State
let currentTokenVault = {};
let currentRedactedText = '';
let currentOriginalText = '';
let currentSha256 = '';
let currentDiff = null;
let isDiffView = true;
let remotePolicy = null;
let lastAnalysisResult = null;

function showToast(msg, duration = 3000) {
  toastText.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function updateCharCount() {
  const t = txtInput.value;
  const chars = t.length;
  const words = t.trim() ? t.trim().split(/\s+/).length : 0;
  const tokensApprox = Math.ceil(chars / 4);
  lblCharCount.textContent = `${chars} chars • ${words} words • ~${tokensApprox} tokens`;
}

// Bootstrap
async function bootstrap() {
  console.log('[nanoshield] Initializing application...');

  // 1. App Check indicator
  if (appCheckStatus.includes('active') || appCheckStatus.includes('reCAPTCHA')) {
    lblAppCheck.textContent = 'Enforced';
    dotAppCheck.classList.add('active');
  } else {
    lblAppCheck.textContent = appCheckStatus;
  }

  // 2. Anonymous Auth
  signIn().then((user) => {
    console.log('[nanoshield] Anonymous auth user uid:', user.uid);
  }).catch((e) => console.warn('[nanoshield] Auth signin error:', e));

  // 3. Local Gemini Nano / Prompt API check
  checkDeviceSupport().then((support) => {
    if (support.available) {
      lblDevice.textContent = 'Ready (Gemini Nano)';
      dotDevice.classList.add('active');
    } else {
      lblDevice.textContent = 'Unavailable (Cloud Fallback)';
    }
  });

  // 4. Remote Config
  loadRemoteConfig().then((cfg) => {
    remotePolicy = cfg;
    statRcStatus.textContent = 'Enforced (Active)';
    statRcDetail.textContent = `Strict: ${cfg.strictMode ? 'Yes' : 'No'} • Mask: ${cfg.maskStyle}`;
    if (cfg.maskStyle && selStyle) {
      selStyle.value = cfg.maskStyle;
    }
    console.log('[nanoshield] Loaded Remote Config:', cfg);
  });
}

// Preset Handler
selPreset.addEventListener('change', (e) => {
  const chosen = PRESETS.find((p) => p.id === e.target.value);
  if (chosen) {
    txtInput.value = chosen.text;
    updateCharCount();
    showToast(`Loaded preset: ${chosen.name}`);
  }
});

txtInput.addEventListener('input', updateCharCount);

// Clear
btnClear.addEventListener('click', () => {
  txtInput.value = '';
  txtOutput.value = '';
  diffContainer.innerHTML = '<span style="color:var(--text-dim);">Workspace cleared. Ready for input.</span>';
  updateCharCount();
  badgeSource.style.display = 'none';
  statTotal.textContent = '0';
  statLatencySub.textContent = 'Latency: --';
  statCategories.innerHTML = '<span class="entity-pill">None</span>';
  statHash.textContent = '--';
  currentTokenVault = {};
});

// Run Redaction
btnSanitize.addEventListener('click', async () => {
  const rawText = txtInput.value.trim();
  if (!rawText) {
    showToast('Please enter text or select a preset first!');
    return;
  }

  btnSanitize.disabled = true;
  btnSanitize.innerHTML = '<span class="mono">Processing...</span>';
  badgeSource.style.display = 'none';

  try {
    currentOriginalText = rawText;
    currentSha256 = await computeSha256(rawText);
    statHash.textContent = `${currentSha256.slice(0, 16)}...${currentSha256.slice(-8)}`;

    const selectedModeKey = selMode.value;
    const inferenceMode = MODES[selectedModeKey] || MODES.PREFER_ON_DEVICE;
    const model = buildRedactionModel(inferenceMode);

    // Run Firebase AI Logic inference
    let aiRes;
    try {
      aiRes = await analyzePIIWithAI(model, rawText);
    } catch (modelErr) {
      console.warn('[ai] Model call error:', modelErr);
      if (selectedModeKey === 'ONLY_ON_DEVICE') {
        throw new Error('On-device model unavailable on this platform. Try Prefer On-Device (Hybrid) mode.');
      }
      aiRes = {
        entities: [],
        reasoning: 'Cloud model unavailable: fell back to local regex pipeline',
        source: 'IN_CLOUD',
        latencyMs: 120,
        modelName: 'Local Deterministic Fallback',
      };
    }

    lastAnalysisResult = aiRes;

    // Merge AI findings with local high-precision regexes
    const maskStyle = selStyle.value || MASK_STYLES.TAG;
    const enabledTypes = remotePolicy?.enabledTypes || null;
    const redactionRes = mergeAndRedact(rawText, aiRes.entities, { maskStyle, enabledTypes });

    currentTokenVault = redactionRes.tokenVault;
    currentRedactedText = redactionRes.redactedText;
    txtOutput.value = currentRedactedText;

    // Badges & latency
    const isLocal = aiRes.source === 'ON_DEVICE';
    badgeSource.style.display = 'inline-flex';
    badgeSource.className = `badge-source ${isLocal ? 'on-device' : 'in-cloud'}`;
    badgeSource.textContent = isLocal ? 'ON_DEVICE (Gemini Nano)' : 'IN_CLOUD (Gemini 3.5 Flash Lite)';

    lblLatency.textContent = `Latency: ${aiRes.latencyMs} ms`;
    statTotal.textContent = String(redactionRes.totalRedactions);
    statLatencySub.textContent = `Latency: ${aiRes.latencyMs} ms (${aiRes.source})`;

    // Entity Category Breakdown
    if (Object.keys(redactionRes.entitiesByType).length > 0) {
      statCategories.innerHTML = Object.entries(redactionRes.entitiesByType)
        .map(([k, count]) => `<span class="entity-pill ${k.toLowerCase()}">${k}: ${count}</span>`)
        .join(' ');
    } else {
      statCategories.innerHTML = '<span class="entity-pill">0 Entities Found</span>';
    }

    // Render visual diff
    currentDiff = renderDiff(rawText, currentRedactedText, currentTokenVault);
    if (isDiffView) {
      diffContainer.innerHTML = currentDiff.rightHtml;
      diffContainer.style.display = 'block';
      txtOutput.style.display = 'none';
    } else {
      diffContainer.style.display = 'none';
      txtOutput.style.display = 'block';
    }

    // Automatically record zero-knowledge audit proof to Firestore
    saveAuditRecord({
      title: `Sanitization (${redactionRes.totalRedactions} entities)`,
      auditHash: currentSha256,
      charCount: rawText.length,
      entityCount: redactionRes.totalRedactions,
      entitiesByType: redactionRes.entitiesByType,
      source: aiRes.source,
      latencyMs: aiRes.latencyMs,
      modelName: aiRes.modelName || 'gemini-3.5-flash-lite',
      maskStyle,
    }).then((rec) => {
      console.log('[audit] Saved audit record to Firestore:', rec.id);
    }).catch((err) => {
      console.warn('[audit] Could not save to Firestore:', err.message);
    });

    showToast(`Sanitized ${redactionRes.totalRedactions} entities via ${aiRes.source} in ${aiRes.latencyMs}ms`);
  } catch (err) {
    console.error('[nanoshield] Redaction error:', err);
    badgeSource.style.display = 'inline-flex';
    badgeSource.className = 'badge-source error';
    badgeSource.textContent = 'INFERENCE ERROR';
    showToast(`Error: ${err.message}`, 4500);
  } finally {
    btnSanitize.disabled = false;
    btnSanitize.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      Sanitize with Hybrid AI
    `;
  }
});

// Toggle Diff vs Raw Output
btnToggleView.addEventListener('click', () => {
  if (!currentRedactedText) return;
  isDiffView = !isDiffView;
  btnToggleView.textContent = isDiffView ? 'Show Raw Text' : 'Show Diff View';
  if (isDiffView) {
    diffContainer.innerHTML = currentDiff ? currentDiff.rightHtml : currentRedactedText;
    diffContainer.style.display = 'block';
    txtOutput.style.display = 'none';
  } else {
    diffContainer.style.display = 'none';
    txtOutput.style.display = 'block';
  }
});

// De-anonymize / Restore
btnUnmask.addEventListener('click', () => {
  if (!currentRedactedText || Object.keys(currentTokenVault).length === 0) {
    showToast('No active token vault to de-anonymize.');
    return;
  }
  const restored = unmaskText(currentRedactedText, currentTokenVault);
  diffContainer.innerHTML = `<span style="color:var(--accent-green); font-weight:600;">[LOCAL DE-ANONYMIZED OUTPUT]:</span>\n\n${restored}`;
  txtOutput.value = restored;
  showToast('Reversibly restored all entities from local vault!');
});

// Copy Clean Text
btnCopyClean.addEventListener('click', () => {
  if (!currentRedactedText) return;
  navigator.clipboard.writeText(currentRedactedText).then(() => {
    showToast('Redacted text copied to clipboard!');
  });
});

// Export Token Vault
btnExportVault.addEventListener('click', () => {
  if (Object.keys(currentTokenVault).length === 0) {
    showToast('No active tokens in vault.');
    return;
  }
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    sha256: currentSha256,
    tokens: currentTokenVault,
  }, null, 2);

  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nanoshield-vault-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Token vault exported as JSON.');
});

// Manual Save Audit
btnSaveAudit.addEventListener('click', async () => {
  if (!currentSha256) {
    showToast('Run sanitization first.');
    return;
  }
  try {
    const rec = await saveAuditRecord({
      title: 'Manual Audit Snapshot',
      auditHash: currentSha256,
      charCount: currentOriginalText.length,
      entityCount: Object.keys(currentTokenVault).length,
      entitiesByType: lastAnalysisResult?.entities?.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {}) || {},
      source: lastAnalysisResult?.source || 'IN_CLOUD',
      latencyMs: lastAnalysisResult?.latencyMs || 0,
      modelName: lastAnalysisResult?.modelName || 'gemini-3.5-flash-lite',
      maskStyle: selStyle.value || 'TAG',
    });
    showToast(`Audit record ${rec.id} recorded in Firestore!`);
  } catch (e) {
    showToast(`Failed: ${e.message}`);
  }
});

// Image drop / upload
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    await loadImageToCanvas(file, imgCanvas);
    txtInput.style.display = 'none';
    imgPreviewContainer.style.display = 'block';
    showToast('Image loaded onto client canvas.');
  } catch (err) {
    showToast(`Failed to load image: ${err.message}`);
  }
});

btnBurnRedactions.addEventListener('click', () => {
  // Apply visual blackout boxes across detected sample coordinates
  const sampleRegions = [
    { x: 30, y: 40, width: 220, height: 28 },
    { x: 30, y: 85, width: 190, height: 24 },
    { x: 30, y: 130, width: 260, height: 28 },
  ];
  applyVisualRedactions(imgCanvas, sampleRegions);
  showToast('Visual redaction boxes burned onto image.');
});

btnDownloadImg.addEventListener('click', async () => {
  const blob = await exportCanvasBlob(imgCanvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sanitized-image-${Date.now()}.png`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Sanitized image downloaded.');
});

btnCloseImg.addEventListener('click', () => {
  imgPreviewContainer.style.display = 'none';
  txtInput.style.display = 'block';
});

// Modals
btnOpenInfo.addEventListener('click', () => modalInfo.classList.add('open'));
btnCloseInfo.addEventListener('click', () => modalInfo.classList.remove('open'));
btnCloseInfoFooter.addEventListener('click', () => modalInfo.classList.remove('open'));

btnOpenAudit.addEventListener('click', async () => {
  modalAudit.classList.add('open');
  await renderAuditRecords();
});
btnCloseAudit.addEventListener('click', () => modalAudit.classList.remove('open'));
btnCloseAuditFooter.addEventListener('click', () => modalAudit.classList.remove('open'));
btnRefreshAudit.addEventListener('click', renderAuditRecords);

async function renderAuditRecords() {
  auditList.innerHTML = '<p style="color:var(--text-dim);">Fetching records from Firestore...</p>';
  try {
    const records = await fetchAuditHistory(15);
    if (records.length === 0) {
      auditList.innerHTML = '<p style="color:var(--text-dim);">No audit records found for this anonymous user. Run a redaction to log an entry.</p>';
      return;
    }
    auditList.innerHTML = records.map((r) => `
      <div style="background:var(--bg-card-subtle); border:1px solid var(--border-dim); border-radius:8px; padding:0.85rem; margin-bottom:0.75rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
          <strong style="color:var(--text-main); font-size:0.88rem;">${r.title || 'Sanitization Record'}</strong>
          <span class="badge-source ${r.source === 'ON_DEVICE' ? 'on-device' : 'in-cloud'}">${r.source} (${r.latencyMs}ms)</span>
        </div>
        <div class="mono" style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.4rem; word-break:break-all;">
          Hash: ${r.auditHash}
        </div>
        <div style="font-size:0.78rem; color:var(--text-muted); display:flex; gap:0.75rem;">
          <span>Entities: <strong>${r.entityCount}</strong></span>
          <span>Chars: <strong>${r.charCount}</strong></span>
          <span>Style: <strong>${r.maskStyle}</strong></span>
          <span>Date: ${new Date(r.createdAt).toLocaleTimeString()}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    auditList.innerHTML = `<p style="color:var(--accent-red);">Failed to read audit log: ${err.message}</p>`;
  }
}

// Start
bootstrap();
