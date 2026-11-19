// Local Redaction & Tokenization Engine for NanoShield
// Defense-in-depth: fuses Firebase AI Logic semantic extraction with client-side pattern matchers.

export const MASK_STYLES = {
  TAG: 'TAG',             // [REDACTED_NAME_1]
  BRACKET: 'BRACKET',     // <PERSON_NAME>
  ASTERISK: 'ASTERISK',   // J*** D**
  BLACKOUT: 'BLACKOUT',   // ██████████
  SYNTHETIC: 'SYNTHETIC', // Realistic pseudonyms
};

// Deterministic fallback regexes for high-precision PII detection
const PATTERNS = {
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  PHONE: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3}[-.\s]?\d{3,4}\b/g,
  CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  SSN: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
  SECRET: /(?:api[_-]?key|bearer|token|secret|password)[\s:=]+['"]?([a-zA-Z0-9_\-]{16,64})['"]?/gi,
  ADDRESS: /\b\d{1,5}\s+(?:[A-Za-z0-9.-]+\s+){1,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Lane|Ln|Terrace|Way)\b(?:[,\s]+(?:Apt|Suite|Floor|Unit)\s+[A-Za-z0-9-]+)?(?:[,\s]+[A-Za-z\s]+[,\s]+[A-Z]{2}\s+\d{5})?/gi,
  NAME: /(?:From:|Patient Name:|Emergency Contact:|Director|Physician|Operator:|Disclosing Party:|Attention:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g,
};

const SYNTHETIC_REPLACEMENTS = {
  NAME: ['Alex Mercer', 'Jordan Blake', 'Morgan Reed', 'Taylor Casey', 'Devon Vance'],
  EMAIL: ['user1@anonymized.org', 'client.safe@secure.net', 'member@privacyshield.io'],
  PHONE: ['+1 (555) 019-2834', '+1 (555) 014-9921', '+1 (555) 018-7320'],
  CARD: ['4000 1234 5678 9010', '5105 1051 0510 5105', '3782 822463 10005'],
  SSN: ['987-65-4320', '987-65-4321', '987-65-4322'],
  ADDRESS: ['1042 Industrial Blvd, Suite 400', '742 Evergreen Terrace, Springfield', '221B Baker St'],
  SECRET: ['sec_live_9999999999999999999', 'ghp_xxxxxxxxxxxxxxxxxxxxxx', 'Bearer_SAFE_TOKEN_PLACEHOLDER'],
};

export async function computeSha256(text) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function maskEntity(type, originalText, index, style = MASK_STYLES.TAG) {
  let cleanType = String(type).toUpperCase().replace(/S$/, '');
  switch (style) {
    case MASK_STYLES.BRACKET:
      return `<${cleanType}>`;
    case MASK_STYLES.ASTERISK: {
      if (cleanType === 'EMAIL') {
        const parts = originalText.split('@');
        return `${parts[0][0]}***@${parts[1][0]}***.***`;
      }
      if (originalText.length <= 4) return '****';
      return `${originalText[0]}${'*'.repeat(Math.max(2, originalText.length - 2))}${originalText.slice(-1)}`;
    }
    case MASK_STYLES.BLACKOUT:
      return '█'.repeat(Math.min(16, Math.max(6, originalText.length)));
    case MASK_STYLES.SYNTHETIC: {
      const pool = SYNTHETIC_REPLACEMENTS[cleanType] || SYNTHETIC_REPLACEMENTS.NAME;
      return pool[(index - 1) % pool.length];
    }
    case MASK_STYLES.TAG:
    default:
      return `[REDACTED_${cleanType}_${index}]`;
  }
}

export function mergeAndRedact(rawText, aiEntities = [], { maskStyle = MASK_STYLES.TAG, enabledTypes = null } = {}) {
  const detected = [];

  const isAllowed = (t) => {
    if (!enabledTypes || enabledTypes.length === 0) return true;
    const norm = String(t).toUpperCase().replace(/S$/, '');
    return enabledTypes.some((et) => {
      const eNorm = String(et).toUpperCase().replace(/S$/, '');
      return eNorm === norm;
    });
  };

  // 1. Ingest AI-detected entities
  if (Array.isArray(aiEntities)) {
    for (const item of aiEntities) {
      if (!item || !item.text || typeof item.text !== 'string') continue;
      const t = String(item.type || 'PII').toUpperCase().replace(/S$/, '');
      if (!isAllowed(t)) continue;
      const trimmed = item.text.trim();
      if (!trimmed || trimmed.length < 2) continue;
      detected.push({
        type: t,
        rawText: trimmed,
        confidence: item.confidence || 0.95,
        source: 'AI',
      });
    }
  }

  // 2. Deterministic Regex scan for guaranteed coverage
  for (const [type, rx] of Object.entries(PATTERNS)) {
    if (!isAllowed(type)) continue;
    let match;
    const regex = new RegExp(rx.source, rx.flags);
    while ((match = regex.exec(rawText)) !== null) {
      const val = (match[1] || match[0]).trim();
      if (val && !detected.some((d) => d.rawText === val || d.rawText.includes(val))) {
        detected.push({
          type: type.replace(/S$/, ''),
          rawText: val,
          confidence: 0.99,
          source: 'REGEX',
        });
      }
    }
  }

  // Sort by length descending so longer phrases get replaced first
  detected.sort((a, b) => b.rawText.length - a.rawText.length);

  const typeCounters = {};
  const tokenVault = {}; // { replacementToken: originalValue }
  const reverseVault = {}; // { originalValue: replacementToken }
  let redactedText = rawText;
  const entitiesByType = {};
  const entityList = [];

  for (const item of detected) {
    if (!typeCounters[item.type]) typeCounters[item.type] = 0;

    let token = reverseVault[item.rawText];
    if (!token) {
      typeCounters[item.type]++;
      token = maskEntity(item.type, item.rawText, typeCounters[item.type], maskStyle);
      tokenVault[token] = item.rawText;
      reverseVault[item.rawText] = token;

      entitiesByType[item.type] = (entitiesByType[item.type] || 0) + 1;
      entityList.push({
        type: item.type,
        original: item.rawText,
        replacement: token,
        confidence: item.confidence,
        detector: item.source,
      });
    }

    // Replace all exact occurrences in text using split/join to avoid regex escape issues
    redactedText = redactedText.split(item.rawText).join(token);
  }

  const totalRedactions = Object.values(entitiesByType).reduce((a, b) => a + b, 0);

  return {
    redactedText,
    tokenVault,
    entitiesByType,
    entityList,
    totalRedactions,
  };
}

// Reversible unmasking
export function unmaskText(maskedText, tokenVault) {
  let restored = maskedText;
  for (const [token, original] of Object.entries(tokenVault)) {
    restored = restored.split(token).join(original);
  }
  return restored;
}
