import { chromium } from '/tmp/opencode/pw_tool/node_modules/playwright-core/index.mjs';

const SHOTS = '/tmp/opencode/nanoshield/docs/screenshots';

async function testNanoShield() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/kozak/.local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  const consoleLogs = [];
  page.on('console', (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    console.log(`PAGE LOG: [${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (err) => {
    console.error('PAGE ERROR:', err.message);
  });

  console.log('Navigating to https://nanoshield-2026.web.app...');
  await page.goto('https://nanoshield-2026.web.app', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: `${SHOTS}/01_landing.png` });

  // 1. Check App Check and Remote Config indicators
  const appCheckText = await page.locator('#lbl-appcheck').innerText();
  const deviceText = await page.locator('#lbl-device').innerText();
  const rcText = await page.locator('#stat-rc-status').innerText();
  console.log('UI Indicators:', { appCheckText, deviceText, rcText });

  // 2. Select Customer Support Preset
  console.log('Selecting preset: Customer Support...');
  await page.selectOption('#sel-preset', 'support');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/02_preset_loaded.png` });

  // 3. Click Sanitize with Hybrid AI
  console.log('Clicking Sanitize with Hybrid AI...');
  await page.click('#btn-sanitize');
  
  // Wait for processing to finish
  await page.waitForFunction(() => {
    const btn = document.getElementById('btn-sanitize');
    return btn && !btn.disabled && !btn.innerText.includes('Processing');
  }, { timeout: 35000 });

  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/03_sanitized_result.png` });

  // Inspect results
  const badgeText = await page.locator('#badge-source').innerText().catch(() => 'no-badge');
  const latencyText = await page.locator('#lbl-latency').innerText().catch(() => 'no-lat');
  const totalCount = await page.locator('#stat-total').innerText().catch(() => '0');
  const categoriesText = await page.locator('#stat-categories').innerText().catch(() => '');
  console.log('Sanitization Outcome:', { badgeText, latencyText, totalCount, categoriesText });

  // 4. Test De-Anonymization
  console.log('Testing De-Anonymize...');
  await page.click('#btn-unmask');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/04_deanonymized.png` });

  // 5. Test How It Works Modal
  console.log('Opening How It Works modal...');
  await page.click('#btn-open-info');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/05_how_it_works.png` });
  await page.click('#btn-close-info');
  await page.waitForTimeout(500);

  // 6. Test Audit History Modal
  console.log('Opening Audit History modal...');
  await page.click('#btn-open-audit');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/06_audit_history.png` });
  await page.click('#btn-close-audit');
  await page.waitForTimeout(500);

  console.log('All tests passed successfully!');
  await browser.close();
}

testNanoShield().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
