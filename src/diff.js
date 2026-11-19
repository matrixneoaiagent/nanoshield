// Visual Diff Generator for NanoShield
// Highlights original sensitive text alongside sanitized replacement tokens.

export function renderDiff(originalText, redactedText, tokenVault = {}) {
  // Simple word-level token diff
  const originalTokens = originalText.split(/(\s+|[.,;!?()[\]{}'"])/);
  const tokenKeys = new Set(Object.keys(tokenVault));

  const reverseMap = {};
  for (const [k, v] of Object.entries(tokenVault)) {
    reverseMap[v] = k;
  }

  // Build original side with highlights on redacted items
  let leftHtml = '';
  for (const t of originalTokens) {
    if (!t) continue;
    if (reverseMap[t.trim()]) {
      leftHtml += `<span class="diff-highlight-orig" title="Redacted: ${reverseMap[t.trim()]}">${escapeHtml(t)}</span>`;
    } else {
      leftHtml += escapeHtml(t);
    }
  }

  // Build redacted side with badges on replacement tokens
  const redactedTokens = redactedText.split(/(\s+|[.,;!?()[\]{}'"])/);
  let rightHtml = '';
  for (const t of redactedTokens) {
    if (!t) continue;
    const clean = t.trim();
    if (tokenKeys.has(clean)) {
      const orig = tokenVault[clean] || 'Sensitive Value';
      rightHtml += `<span class="diff-badge-token" data-token="${escapeHtml(clean)}" title="Original: ${escapeHtml(orig)}">${escapeHtml(t)}</span>`;
    } else {
      rightHtml += escapeHtml(t);
    }
  }

  return { leftHtml, rightHtml };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
