import { gapi } from '/tmp/opencode/hybridai/gapi.mjs';

const P = '536180717621';

async function updateRemoteConfig() {
  const current = await gapi(`https://firebaseremoteconfig.googleapis.com/v1/projects/${P}/remoteConfig`);
  console.log('Current RC status:', current.status);
  
  const parameters = current.body.parameters || {};

  // Add NanoShield parameters
  parameters['nanoshield_strict_mode'] = {
    defaultValue: { value: 'true' },
    valueType: 'BOOLEAN',
    description: 'Enforce aggressive multi-stage PII detection in NanoShield'
  };
  parameters['nanoshield_mask_style'] = {
    defaultValue: { value: 'TAG' },
    valueType: 'STRING',
    description: 'Default masking format: TAG | BRACKET | ASTERISK | SYNTHETIC'
  };
  parameters['nanoshield_enabled_types'] = {
    defaultValue: { value: 'NAMES,EMAILS,PHONES,CARDS,SSN,ADDRESSES,SECRETS' },
    valueType: 'STRING',
    description: 'Comma-separated PII categories active for redaction'
  };
  parameters['nanoshield_hybrid_policy'] = {
    defaultValue: { value: 'prefer_on_device' },
    valueType: 'STRING',
    description: 'prefer_on_device | prefer_in_cloud | only_on_device | only_in_cloud'
  };
  parameters['nanoshield_confidence_threshold'] = {
    defaultValue: { value: '0.85' },
    valueType: 'NUMBER',
    description: 'Minimum confidence score for redaction replacement'
  };

  const payload = {
    conditions: current.body.conditions || [],
    parameters,
  };

  const putRes = await gapi(`https://firebaseremoteconfig.googleapis.com/v1/projects/${P}/remoteConfig`, {
    method: 'PUT',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(payload),
  });

  console.log('PUT Remote Config status:', putRes.status);
  const verify = await gapi(`https://firebaseremoteconfig.googleapis.com/v1/projects/${P}/remoteConfig`);
  console.log('Updated parameter keys:', Object.keys(verify.body.parameters || {}));
}

updateRemoteConfig().catch(console.error);
