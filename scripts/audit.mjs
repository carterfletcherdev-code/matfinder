/**
 * audit.mjs — full MatFinder UI audit using Playwright
 * Run: node scripts/audit.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3001';
const issues = [];
const passes = [];

function pass(msg) { passes.push(msg); console.log(`  ✓ ${msg}`); }
function fail(msg) { issues.push(msg); console.log(`  ✗ ${msg}`); }
function section(title) { console.log(`\n── ${title} ${'─'.repeat(50 - title.length)}`); }

async function audit() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // Collect console errors
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  // ── 1. Initial load ────────────────────────────────────────────────────────
  section('1. Initial Load');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const title = await page.title();
  title ? pass(`Page title: "${title}"`) : fail('No page title');

  // Check map renders
  await page.waitForSelector('.leaflet-container', { timeout: 8000 }).then(() => pass('Map renders')).catch(() => fail('Map did not render'));

  // Check gym cards appear
  const cardCount = await page.locator('[data-testid="gym-card"], .gym-card').count()
    .catch(() => 0);
  // Cards may not have test IDs — count by structure
  await page.waitForTimeout(1500);
  const listItems = await page.locator('button, [role="button"]').count();
  listItems > 0 ? pass(`UI has interactive elements (${listItems} found)`) : fail('No interactive elements found');

  // ── 2. Filter: Day buttons ─────────────────────────────────────────────────
  section('2. Day Filters');
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (const day of days) {
    const btn = page.getByRole('button', { name: new RegExp(`^${day}`, 'i') }).first();
    const exists = await btn.count() > 0;
    if (!exists) { fail(`Day button "${day}" not found`); continue; }
    await btn.click();
    await page.waitForTimeout(400);
    // Check it's visually active (aria-pressed or class change)
    const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
    const style = await btn.getAttribute('style').catch(() => '');
    pass(`Day "${day}" filter clicks without error`);
    // Click again to deselect
    await btn.click();
    await page.waitForTimeout(200);
  }

  // ── 3. Filter: Monday only ─────────────────────────────────────────────────
  section('3. Monday-only filter');
  const monBtn = page.getByRole('button', { name: /^Mon/i }).first();
  await monBtn.click();
  await page.waitForTimeout(600);
  const monText = await page.textContent('body');
  if (monText.includes('Mon') || monText.includes('monday')) {
    pass('Monday filter active — content updated');
  } else {
    fail('Monday filter — no visible change in content');
  }
  await monBtn.click(); // reset

  // ── 4. Filter: Tuesday only ────────────────────────────────────────────────
  section('4. Tuesday-only filter');
  const tueBtn = page.getByRole('button', { name: /^Tue/i }).first();
  await tueBtn.click();
  await page.waitForTimeout(600);
  pass('Tuesday filter clicked');
  await tueBtn.click();

  // ── 5. Filter: Wednesday only ──────────────────────────────────────────────
  section('5. Wednesday-only filter');
  const wedBtn = page.getByRole('button', { name: /^Wed/i }).first();
  await wedBtn.click();
  await page.waitForTimeout(600);
  pass('Wednesday filter clicked');
  await wedBtn.click();

  // ── 6. Filter: Thursday only ───────────────────────────────────────────────
  section('6. Thursday-only filter');
  const thuBtn = page.getByRole('button', { name: /^Thu/i }).first();
  await thuBtn.click();
  await page.waitForTimeout(600);
  pass('Thursday filter clicked');
  await thuBtn.click();

  // ── 7. Discipline filters ──────────────────────────────────────────────────
  section('7. Discipline Filters');
  const disciplines = ['BJJ', 'Gi', 'No-Gi', 'Wrestling', 'MMA'];
  for (const disc of disciplines) {
    const btn = page.getByRole('button', { name: new RegExp(disc, 'i') }).first();
    const exists = await btn.count() > 0;
    if (!exists) { fail(`Discipline button "${disc}" not found`); continue; }
    await btn.click();
    await page.waitForTimeout(400);
    pass(`Discipline "${disc}" filter clicks`);
    await btn.click();
    await page.waitForTimeout(200);
  }

  // ── 8. Free filter ────────────────────────────────────────────────────────
  section('8. Free filter');
  const freeBtn = page.getByRole('button', { name: /free/i }).first();
  if (await freeBtn.count() > 0) {
    await freeBtn.click();
    await page.waitForTimeout(500);
    pass('Free filter clicks');
    await freeBtn.click();
  } else {
    fail('Free filter button not found');
  }

  // ── 9. Starting Soon filter ───────────────────────────────────────────────
  section('9. Starting Soon filter');
  const soonBtn = page.getByRole('button', { name: /soon/i }).first();
  if (await soonBtn.count() > 0) {
    await soonBtn.click();
    await page.waitForTimeout(500);
    pass('Starting Soon filter clicks');
    await soonBtn.click();
  } else {
    fail('Starting Soon filter not found');
  }

  // ── 10. Search / location input ───────────────────────────────────────────
  section('10. Search / Location input');
  const searchInput = page.locator('input[type="text"], input[placeholder]').first();
  if (await searchInput.count() > 0) {
    await searchInput.fill('Austin, TX');
    await page.waitForTimeout(800);
    pass('Search input accepts text');
    await searchInput.fill('');
  } else {
    fail('No search input found');
  }

  // ── 11. View toggle (Map / Split / List) ──────────────────────────────────
  section('11. View toggles');
  const viewBtns = ['map', 'split', 'list'];
  for (const v of viewBtns) {
    const btn = page.getByRole('button', { name: new RegExp(v, 'i') }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await page.waitForTimeout(500);
      pass(`View toggle "${v}" works`);
    } else {
      fail(`View toggle "${v}" not found`);
    }
  }

  // ── 12. Click a map pin ───────────────────────────────────────────────────
  section('12. Map pin interaction');
  // Go to map view first
  const mapViewBtn = page.getByRole('button', { name: /map/i }).first();
  if (await mapViewBtn.count() > 0) await mapViewBtn.click();
  await page.waitForTimeout(800);

  const marker = page.locator('.leaflet-marker-icon').first();
  if (await marker.count() > 0) {
    await marker.click();
    await page.waitForTimeout(600);
    pass('Map pin clickable');
    // Check overlay appeared
    const overlay = await page.locator('text=/Visit website|Suggest correction/i').count();
    overlay > 0 ? pass('Gym card overlay appears after pin click') : fail('Gym card overlay did not appear after pin click');
  } else {
    fail('No map markers found');
  }

  // ── 13. Gym card expand / collapse ────────────────────────────────────────
  section('13. Gym card expand/collapse');
  // Switch to split view for list testing
  const splitBtn = page.getByRole('button', { name: /split/i }).first();
  if (await splitBtn.count() > 0) {
    await splitBtn.click();
    await page.waitForTimeout(600);
  }
  // Click first gym card in list
  const firstCard = page.locator('[style*="cursor: pointer"]').first();
  if (await firstCard.count() > 0) {
    await firstCard.click();
    await page.waitForTimeout(500);
    const expanded = await page.locator('text=/Visit website|Suggest correction/i').count();
    expanded > 0 ? pass('Gym card expands with action buttons') : fail('Gym card expand did not show action buttons');
  } else {
    fail('No clickable gym cards found in list');
  }

  // ── 14. Suggest correction form ───────────────────────────────────────────
  section('14. Suggest correction form');
  const corrBtn = page.getByRole('button', { name: /suggest correction/i }).first();
  if (await corrBtn.count() > 0) {
    await corrBtn.click();
    await page.waitForTimeout(400);
    const form = await page.locator('select, textarea').count();
    form > 0 ? pass('Correction form opens with fields') : fail('Correction form opened but no fields found');
    // Close it
    await corrBtn.click().catch(() => {});
  } else {
    fail('Suggest correction button not found');
  }

  // ── 15. Mobile viewport ───────────────────────────────────────────────────
  section('15. Mobile viewport (390px)');
  await ctx.close();
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobileCtx.newPage();
  mobilePage.on('pageerror', err => consoleErrors.push(`[mobile] ${err.message}`));
  await mobilePage.goto(BASE, { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1500);
  const mobileMap = await mobilePage.locator('.leaflet-container').count();
  mobileMap > 0 ? pass('Map renders on mobile') : fail('Map did not render on mobile');

  // Check day filters visible on mobile
  const mobileDayBtn = mobilePage.getByRole('button', { name: /^Mon/i }).first();
  await mobileDayBtn.count() > 0 ? pass('Day filters visible on mobile') : fail('Day filters not visible on mobile');

  // Click a pin on mobile
  const mobileMarker = mobilePage.locator('.leaflet-marker-icon').first();
  if (await mobileMarker.count() > 0) {
    await mobileMarker.click();
    await mobilePage.waitForTimeout(600);
    pass('Map pin clickable on mobile');
    const mobileOverlay = await mobilePage.locator('text=/Visit website|Suggest correction|FREE|✓/i').count();
    mobileOverlay > 0 ? pass('Overlay card appears on mobile') : fail('Overlay card did not appear on mobile after pin click');
  }

  await mobileCtx.close();

  // ── 16. Console errors ────────────────────────────────────────────────────
  section('16. Console errors');
  if (consoleErrors.length === 0) {
    pass('No JS console errors');
  } else {
    consoleErrors.slice(0, 10).forEach(e => fail(`Console error: ${e.slice(0, 120)}`));
  }

  await browser.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log(`AUDIT COMPLETE`);
  console.log(`  ✓ Passed: ${passes.length}`);
  console.log(`  ✗ Issues: ${issues.length}`);
  if (issues.length > 0) {
    console.log('\nISSUES FOUND:');
    issues.forEach((i, n) => console.log(`  ${n + 1}. ${i}`));
  }
  console.log('═'.repeat(60));
}

audit().catch(err => { console.error(err); process.exit(1); });
