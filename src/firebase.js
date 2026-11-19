// Firebase Bootstrap & Core Services for NanoShield
//
// Stack:
//   • Firebase App Check: Attestation token check before any AI Logic call
//   • Firebase AI Logic: Hybrid Gemini Nano (on-device) + Gemini 2.5 Flash (cloud)
//   • Firebase Authentication: Anonymous zero-friction session
//   • Cloud Firestore: Zero-knowledge offline-first audit log (no PII stored)
//   • Firebase Remote Config: Dynamic redaction policies & confidence thresholds

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';
import { firebaseConfig } from './firebase-config.js';

// Debug token injected at build/runtime from .env.local
const debugToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

if (debugToken) {
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
}

export const app = initializeApp(firebaseConfig);

// Initialize App Check immediately so AI Logic and Firestore requests are signed
function initAppCheck() {
  try {
    if (siteKey) {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
      return 'reCAPTCHA v3';
    }
    // Debug provider for registered tokens
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('debug-provider-placeholder'),
      isTokenAutoRefreshEnabled: true,
    });
    return debugToken ? 'debug token active' : 'unconfigured';
  } catch (err) {
    return `error: ${err.message}`;
  }
}

export const appCheckStatus = initAppCheck();

export const auth = getAuth(app);

// Firestore instance with persistent offline cache
export const db = initializeFirestore(
  app,
  { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }) },
  'default',
);

export function signIn() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) resolve(user);
    });
    signInAnonymously(auth).catch((err) => {
      console.warn('[auth] anonymous sign-in error:', err?.code, err?.message);
    });
  });
}

// Remote Config
const remoteConfig = getRemoteConfig(app);
remoteConfig.settings.minimumFetchIntervalMillis = 60 * 1000;
remoteConfig.defaultConfig = {
  nanoshield_strict_mode: 'true',
  nanoshield_mask_style: 'TAG',
  nanoshield_enabled_types: 'NAMES,EMAILS,PHONES,CARDS,SSN,ADDRESSES,SECRETS',
  nanoshield_hybrid_policy: 'prefer_on_device',
  nanoshield_confidence_threshold: '0.85',
};

export async function loadRemoteConfig() {
  let status = 'defaults';
  try {
    const activated = await fetchAndActivate(remoteConfig);
    status = activated ? 'fetched & activated' : 'cached';
  } catch (err) {
    status = `fallback (${err?.code || 'offline'})`;
  }

  const str = (k) => getValue(remoteConfig, k).asString();
  const bool = (k) => getValue(remoteConfig, k).asBoolean();
  const num = (k) => getValue(remoteConfig, k).asNumber();

  return {
    status,
    strictMode: bool('nanoshield_strict_mode'),
    maskStyle: str('nanoshield_mask_style'),
    enabledTypes: str('nanoshield_enabled_types').split(',').map((s) => s.trim()),
    hybridPolicy: str('nanoshield_hybrid_policy'),
    confidenceThreshold: num('nanoshield_confidence_threshold'),
  };
}
