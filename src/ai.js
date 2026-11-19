// Firebase AI Logic - Hybrid Inference Layer for NanoShield
//
// NanoShield prioritizes on-device Gemini Nano inference through Firebase AI Logic.
// When running in Chrome Desktop with Prompt API support (NPU/GPU/CPU enabled),
// inference executes locally with zero outbound data transmission.
// On unsupported browsers or systems (e.g. Linux Chromium), the SDK transparently
// falls back to Google's cloud-hosted Gemini (gemini-2.5-flash) via Firebase AI Logic
// backed by Firebase App Check attestation.

import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { app } from './firebase.js';

const ai = getAI(app, { backend: new GoogleAIBackend() });

export const MODES = {
  PREFER_ON_DEVICE: InferenceMode.PREFER_ON_DEVICE,
  ONLY_ON_DEVICE: InferenceMode.ONLY_ON_DEVICE,
  PREFER_IN_CLOUD: InferenceMode.PREFER_IN_CLOUD,
  ONLY_IN_CLOUD: InferenceMode.ONLY_IN_CLOUD,
};

const CLOUD_MODEL = 'gemini-3.5-flash-lite';

export async function checkDeviceSupport() {
  if (typeof window === 'undefined') return { available: false, reason: 'SSR' };
  try {
    if (window.ai?.languageModel?.availability) {
      const avail = await window.ai.languageModel.availability();
      return { available: avail === 'readily' || avail === 'after-download', status: avail };
    }
    if (window.ai?.languageModel?.capabilities) {
      const caps = await window.ai.languageModel.capabilities();
      return { available: caps.available === 'readily' || caps.available === 'after-download', status: caps.available };
    }
    return { available: false, status: 'unavailable (requires Chrome 128+ with Prompt API enabled)' };
  } catch (e) {
    return { available: false, status: `error: ${e.message}` };
  }
}

export function buildRedactionModel(mode = InferenceMode.PREFER_ON_DEVICE) {
  return getGenerativeModel(ai, {
    mode,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 800,
      },
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }],
        initialPrompts: [
          {
            role: 'system',
            content: [
              {
                type: 'text',
                value:
                  'You are NanoShield, an ultra-precise PII entity detection and sanitization engine. Identify all PII entities (names, emails, phones, credit cards, SSNs, addresses, api keys) and output valid JSON.',
              },
            ],
          },
        ],
      },
    },
  });
}

const REDACTION_SYSTEM_PROMPT = `You are NanoShield, an advanced cybersecurity privacy guard.
Analyze the following input text and extract all Personally Identifiable Information (PII) entities.
Target Categories:
- NAME: full or partial names of real individuals
- EMAIL: email addresses
- PHONE: phone numbers (international, US, mobile, landline)
- CARD: credit card, debit card, or payment card numbers
- SSN: social security numbers, national IDs, tax numbers, passport numbers
- ADDRESS: physical street addresses, apartment numbers, postal addresses
- SECRET: passwords, bearer tokens, API keys, private keys, database credentials

Output strictly a JSON object with this exact schema:
{
  "entities": [
    {
      "type": "NAME|EMAIL|PHONE|CARD|SSN|ADDRESS|SECRET",
      "text": "exact raw text found in the input",
      "replacementTag": "[REDACTED_TYPE_N]",
      "confidence": 0.95
    }
  ],
  "reasoning": "brief description of items detected"
}

Do not include any conversational filler. Only output raw valid JSON.`;

export async function analyzePIIWithAI(model, rawText) {
  const started = performance.now();
  const prompt = `${REDACTION_SYSTEM_PROMPT}\n\nINPUT TEXT:\n${rawText}`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const latencyMs = Math.round(performance.now() - started);
  const source = String(response.inferenceSource || 'IN_CLOUD').toUpperCase();
  const rawOutput = response.text().trim();

  let parsed = null;
  try {
    const cleanJson = rawOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      parsed = JSON.parse(cleanJson.slice(firstBrace, lastBrace + 1));
    } else {
      parsed = JSON.parse(cleanJson);
    }
  } catch (err) {
    console.warn('[ai] Failed to parse model JSON output:', rawOutput);
    parsed = { entities: [], reasoning: 'Model produced text format: augmented with heuristic pattern scanner' };
  }

  return {
    entities: parsed.entities || [],
    reasoning: parsed.reasoning || '',
    source,
    latencyMs,
    modelName: source === 'ON_DEVICE' ? 'Gemini Nano (on-device)' : CLOUD_MODEL,
  };
}
