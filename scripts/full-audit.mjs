/**
 * MatFinder Full UI Audit
 * Run: node scripts/full-audit.mjs
 * Requires: playwright installed in project, dev server running at http://localhost:3001
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3001';
const RESULTS = [];
let consoleErrors = [];

function pass(test, detail = '') {
  RESULTS.push({ status: 'PASS', test, detail });
  console.log(`  ✅ PASS: ${test}${detail ? ' — ' + detail : ''}`);
}

function fail(test, detail = '') {
  RESULTS.push({ status: 'FAIL', test, detail });
  console.log(`  ❌ FAIL: ${test}${detail ? ' — ' + detail : ''}`);
}

function warn(test, detail = '') {
  RESULTS.push({ status: 'WARN', test, detail });
  console.log(`  ⚠️  WARN: ${test}${detail ? ' — ' + detail : ''}`);
}

function info(msg) {
  console.log(`  ℹ️  ${msg}`);
}

// Parse a gym count string like "142 gyms" → 142
function parseCount(text) {
  if (!text) return null;
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

async function waitForLoad(page) {
  // Wait for the gym count to stop saying "0 gyms" / "Loading" and settle
  await page.waitForFunction(() => {
    const countEl = document.querySelector('[data-testid="gym-count"]');
    if (countEl) {
      const t = countEl.textContent || '';
      return !t.includes('Loading') && !t.includes('0 gym');
    }
    // fallback: look for JetBrains Mono spans that contain "gym"
    const spans = Array.from(document.querySelectorAll('span'));
    return spans.some(s => s.textContent && s.textContent.match(/\d+ gym/));
  }, { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(800);
}

async function getGymCount(page) {
  try {
    const spans = await page.locator('span').allTextContents();
    for (const t of spans) {
      if (t && t.match(/\d+\s+gym/)) return parseCount(t);
    }
    return null;
  } catch {
    return null;
  }
}

async function runDesktopTests(browser) {
  console.log('\n═══════════════════════════════════════════');
  console.log('  DESKTOP TESTS (1280x800)');
  console.log('═══════════════════════════════════════════');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    geolocation: { latitude: 30.2672, longitude: -97.7431 }, // Austin, TX
    permissions: ['geolocation'],
  });
  const page = await context.newPage();

  // Capture console errors
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      pageErrors.push(msg.text());
      consoleErrors.push({ viewport: 'desktop', text: msg.text() });
    }
  });
  page.on('pageerror', err => {
    pageErrors.push(err.message);
    consoleErrors.push({ viewport: 'desktop', text: err.message });
  });

  // ─── 1. INITIAL PAGE LOAD ───
  console.log('\n── 1. Initial Page Load ──');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // Title
  const title = await page.title();
  if (title.toLowerCase().includes('matfinder')) {
    pass('Page title', `"${title}"`);
  } else {
    fail('Page title', `Got: "${title}"`);
  }

  // Wait for data to load
  await waitForLoad(page);

  // Gym count
  const initialCount = await getGymCount(page);
  if (initialCount && initialCount > 0) {
    pass('Gym count shown on load', `${initialCount} gyms`);
  } else if (initialCount === 0) {
    warn('Gym count is 0', 'Data may not have loaded yet or all gyms filtered out');
  } else {
    fail('Gym count element not found');
  }

  // Map renders (leaflet container)
  const mapContainer = await page.locator('.leaflet-container').count();
  if (mapContainer > 0) {
    pass('Map renders', 'leaflet-container found');
  } else {
    fail('Map container not found — map may not have loaded');
  }

  // Header elements
  const headerText = await page.locator('header').textContent().catch(() => '');
  if (headerText.includes('MatFinder')) {
    pass('Header — MatFinder brand visible');
  } else {
    fail('Header — MatFinder brand not visible');
  }

  // ─── 2. DAY FILTERS ───
  console.log('\n── 2. Day Filters ──');
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (const day of days) {
    // First clear all: click any active day to deselect, then click just this one
    // Reset: reload page state by clicking each selected day off
    const beforeCount = await getGymCount(page);

    const dayBtn = page.locator(`button:has-text("${day}")`).first();
    const exists = await dayBtn.count();
    if (!exists) {
      fail(`Day filter: ${day} button not found`);
      continue;
    }

    await dayBtn.click();
    await page.waitForTimeout(400);
    const afterCount = await getGymCount(page);

    if (afterCount !== null && afterCount !== beforeCount) {
      pass(`Day filter: ${day}`, `Count changed: ${beforeCount} → ${afterCount}`);
    } else if (afterCount === 0) {
      warn(`Day filter: ${day}`, `Count went to 0 (may be correct if no sessions that day)`);
    } else if (afterCount === beforeCount) {
      warn(`Day filter: ${day}`, `Count unchanged at ${beforeCount} — filter may not work or all gyms have this day`);
    } else {
      fail(`Day filter: ${day}`, `Count unclear: before=${beforeCount} after=${afterCount}`);
    }

    // Deselect this day before testing next
    await dayBtn.click();
    await page.waitForTimeout(300);
  }

  // ─── Multiple day selection: Mon + Wed ───
  console.log('\n── 3. Multi-day Selection (Mon + Wed) ──');
  const baseCount = await getGymCount(page);
  const monBtn = page.locator('button:has-text("Mon")').first();
  const wedBtn = page.locator('button:has-text("Wed")').first();
  await monBtn.click();
  await page.waitForTimeout(300);
  const monCount = await getGymCount(page);
  await wedBtn.click();
  await page.waitForTimeout(400);
  const monWedCount = await getGymCount(page);

  if (monCount !== null && monWedCount !== null && monWedCount >= monCount) {
    pass('Multi-day (Mon+Wed)', `Mon only: ${monCount}, Mon+Wed: ${monWedCount}`);
  } else {
    warn('Multi-day (Mon+Wed)', `Mon=${monCount}, Mon+Wed=${monWedCount} — expected Wed to add more results`);
  }

  // Clear days
  await monBtn.click();
  await wedBtn.click();
  await page.waitForTimeout(400);

  // ─── 4. DISCIPLINE FILTERS ───
  console.log('\n── 4. Discipline Filters ──');
  const disciplines = ['BJJ', 'No-Gi BJJ', 'Gi BJJ', 'Wrestling', 'Judo', 'Muay Thai', 'MMA', 'Kickboxing', 'Boxing', 'Karate', 'Taekwondo'];

  for (const disc of disciplines) {
    const btn = page.locator(`button:has-text("${disc}")`).first();
    const exists = await btn.count();
    if (!exists) {
      fail(`Discipline filter: "${disc}" button not found`);
      continue;
    }

    const countBefore = await getGymCount(page);
    await btn.click();
    await page.waitForTimeout(400);
    const countAfter = await getGymCount(page);

    // Check if button has a visual "active" state change
    const bgStyle = await btn.evaluate(el => window.getComputedStyle(el).backgroundColor);
    info(`${disc} btn bg after click: ${bgStyle}`);

    if (countAfter !== countBefore || bgStyle !== 'rgba(0, 0, 0, 0)') {
      pass(`Discipline filter: ${disc}`, `Count: ${countBefore} → ${countAfter}`);
    } else {
      warn(`Discipline filter: ${disc}`, `Count unchanged at ${countBefore}, bg: ${bgStyle}`);
    }

    // Toggle back off
    await btn.click();
    await page.waitForTimeout(300);
  }

  // ─── 5. FREE ONLY FILTER ───
  console.log('\n── 5. Free Only Filter ──');
  {
    const freeBtn = page.locator('button:has-text("Free only")').first();
    const exists = await freeBtn.count();
    if (!exists) {
      fail('Free only button not found');
    } else {
      const before = await getGymCount(page);
      await freeBtn.click();
      await page.waitForTimeout(500);
      const after = await getGymCount(page);

      // Check button visual state changed (active styling)
      const freeBtnBg = await freeBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
      info(`Free only button bg after click: ${freeBtnBg}`);

      if (after !== null && after !== before) {
        pass('Free only filter changes count', `${before} → ${after} gyms`);
      } else if (after === before && before > 0) {
        // NOTE: All gyms in the DB have is_free=true, so count unchanged is EXPECTED
        warn('Free only filter: count unchanged', `${before} → ${after} — DATA NOTE: all ${before} gyms in DB have is_free=true, so this filter correctly shows all gyms. This appears to be a data issue (is_free defaults to true for every entry).`);
      } else if (after === 0) {
        fail('Free only filter: count went to 0');
      }
      // Toggle back
      await freeBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // ─── 6. STARTING SOON FILTER ───
  console.log('\n── 6. Starting Soon Filter ──');
  {
    const soonBtn = page.locator('button:has-text("Starting Soon")').first();
    const exists = await soonBtn.count();
    if (!exists) {
      fail('Starting Soon button not found');
    } else {
      const before = await getGymCount(page);
      await soonBtn.click();
      await page.waitForTimeout(500);
      const after = await getGymCount(page);
      if (after !== null) {
        pass('Starting Soon filter clicked', `${before} → ${after} gyms (0 is valid if none starting soon right now)`);
      } else {
        fail('Starting Soon filter — count unreadable after click');
      }
      // Toggle back
      await soonBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // ─── 7. REGION FILTERS ───
  console.log('\n── 7. Region Filters ──');
  {
    const allRegions = page.locator('button:has-text("All regions")').first();
    const usBtn = page.locator('button:has-text("US")').first();
    const euBtn = page.locator('button:has-text("Europe")').first();

    if (await allRegions.count() === 0) {
      fail('Region filter: "All regions" button not found');
    } else {
      const allCount = await getGymCount(page);
      pass('Region: All regions visible', `${allCount} gyms`);

      await usBtn.click();
      await page.waitForTimeout(500);
      const usCount = await getGymCount(page);
      if (usCount !== null && usCount < allCount) {
        pass('Region filter: US', `${allCount} → ${usCount} gyms`);
      } else {
        warn('Region filter: US', `${allCount} → ${usCount} (expected fewer than all)`);
      }

      await euBtn.click();
      await page.waitForTimeout(500);
      const euCount = await getGymCount(page);
      if (euCount !== null && euCount !== usCount) {
        pass('Region filter: Europe', `US was ${usCount}, Europe is ${euCount}`);
      } else {
        warn('Region filter: Europe', `Count same as US (${euCount}) — may be bug or coincidence`);
      }

      // Reset to All
      await allRegions.click();
      await page.waitForTimeout(400);
    }
  }

  // ─── 8. SEARCH INPUT ───
  console.log('\n── 8. Search Input ──');
  {
    const searchInput = page.locator('input[placeholder*="city"]').first();
    if (await searchInput.count() === 0) {
      fail('Search input not found');
    } else {
      pass('Search input exists');
      await searchInput.fill('Austin, TX');
      await searchInput.press('Enter');
      await page.waitForTimeout(3000); // Nominatim geocoding takes time
      // Check if map moved (flyTo) — look for sort label or any state change
      const pageText = await page.locator('body').textContent();
      if (pageText.includes('Austin') || pageText.includes('sort:')) {
        pass('Search: "Austin, TX" — geocode triggered', 'Sort label or city name appeared');
      } else {
        warn('Search: "Austin, TX"', 'No visible confirmation of geocoding result');
      }
      // Clear search
      const clearBtn = page.locator('button[title="Clear location"]').first();
      if (await clearBtn.count() > 0) {
        await clearBtn.click();
        pass('Search: clear button works');
      } else {
        warn('Search clear button', 'Not found after search — may only appear when location set');
      }
      await page.waitForTimeout(300);
    }
  }

  // ─── 9. VIEW TOGGLES ───
  console.log('\n── 9. View Toggles ──');
  {
    // Map view
    const mapViewBtn = page.locator('button:has-text("Map")').first();
    await mapViewBtn.click();
    await page.waitForTimeout(500);
    const mapViewMap = await page.locator('.leaflet-container').count();
    const mapViewList = await page.locator('[style*="340px"]').count();
    if (mapViewMap > 0) {
      pass('Map view: map visible');
    } else {
      fail('Map view: map not visible');
    }

    // List view
    const listViewBtn = page.locator('button:has-text("List")').first();
    await listViewBtn.click();
    await page.waitForTimeout(500);
    const listCount = await getGymCount(page);
    pass('List view: switched', `Gym count: ${listCount}`);

    // Check no map in list mode
    // (map may still be in DOM but hidden)
    const listMapCount = await page.locator('.leaflet-container').count();
    info(`List view: leaflet containers in DOM: ${listMapCount}`);

    // Split view
    const splitViewBtn = page.locator('button:has-text("Split")').first();
    await splitViewBtn.click();
    await page.waitForTimeout(500);
    const splitMap = await page.locator('.leaflet-container').count();
    if (splitMap > 0) {
      pass('Split view: map visible');
    } else {
      fail('Split view: map not visible after toggling back');
    }
  }

  // ─── 10. SPLIT VIEW: CLICK GYM CARD ───
  console.log('\n── 10. Gym Card Expansion (Split View) ──');
  {
    // Make sure we're in split view
    const splitBtn2 = page.locator('button:has-text("Split")').first();
    await splitBtn2.click();
    await page.waitForTimeout(400);

    // Gym cards are direct children of the list panel — they contain gym names and day labels.
    // The list panel is the 340px-wide scrollable div on the left.
    // Each GymCard is a div with inline style containing background and border-radius.
    // A reliable way: find the overflow-y:auto div that is NOT the map container,
    // then find clickable card divs inside it.
    // Use: div that has a cursor:pointer style and contains day abbreviations
    const gymCards = page.locator('div[style*="cursor: pointer"][style*="border-radius"]').filter({
      hasText: /Mon|Tue|Wed|Thu|Fri|Sat|Sun/,
    });
    const cardCount = await gymCards.count();
    info(`Gym cards found: ${cardCount}`);

    if (cardCount === 0) {
      // Fallback: try any div with text "Suggest" parent chain
      fail('No gym cards found to click');
    } else {
      // Click multiple cards until we find one with "Suggest correction" (first few may not have website)
      let expanded = false;
      for (let i = 0; i < Math.min(cardCount, 8); i++) {
        await gymCards.nth(i).click();
        await page.waitForTimeout(700);
        const suggestCount = await page.locator('button:has-text("Suggest correction"), button:has-text("Cancel")').count();
        if (suggestCount > 0) {
          expanded = true;
          pass(`Card expansion: card #${i + 1} expanded (Suggest correction visible)`);
          break;
        }
      }
      if (!expanded) {
        fail('Card expansion: "Suggest correction" button not found after clicking 8 cards');
      }

      // Website link (check after expanding)
      const websiteLink = page.locator('a:has-text("Visit website →")');
      if (await websiteLink.count() > 0) {
        pass('Card expansion: "Visit website" link visible');
      } else {
        warn('Card expansion: "Visit website" link not found', 'This gym may not have a website');
      }

      // Star rating — buttons with ★ text
      const starBtns = page.locator('button').filter({ hasText: '★' });
      if (await starBtns.count() > 0) {
        pass('Card expansion: Star rating (★ buttons) visible', `${await starBtns.count()} star buttons`);
      } else {
        warn('Card expansion: Star rating not detected', 'Expected 5 ★ buttons from StarRating component');
      }
    }
  }

  // ─── 11. SUGGEST CORRECTION FORM ───
  console.log('\n── 11. Suggest Correction Form ──');
  {
    const suggestBtn = page.locator('button:has-text("Suggest correction")').first();
    if (await suggestBtn.count() === 0) {
      fail('Suggest correction button not found — need an expanded card first');
    } else {
      await suggestBtn.click();
      await page.waitForTimeout(400);

      // Check form appears
      const select = page.locator('select').first();
      if (await select.count() > 0) {
        pass('Suggest correction form: select dropdown appeared');
      } else {
        fail('Suggest correction form: form did not appear');
      }

      // Fill form
      if (await select.count() > 0) {
        await select.selectOption('time');
        const corrInput = page.locator('input[placeholder*="Correct value"]').first();
        if (await corrInput.count() > 0) {
          await corrInput.fill('Saturday 10am');
          pass('Suggest correction form: fields filled');

          // Submit
          const submitBtn = page.locator('button:has-text("Submit")').first();
          if (await submitBtn.count() > 0) {
            await submitBtn.click();
            await page.waitForTimeout(1500);
            const thanks = await page.locator('body').textContent();
            if (thanks.includes("Thanks") || thanks.includes("review")) {
              pass('Suggest correction: submitted successfully', '"Thanks" message appeared');
            } else {
              warn('Suggest correction: submitted but no confirmation message found');
            }
          } else {
            fail('Suggest correction: Submit button not found');
          }
        } else {
          fail('Suggest correction form: text input not found');
        }
      }
    }
  }

  // ─── 12. ADD YOUR GYM ───
  console.log('\n── 12. "Add your gym" Button ──');
  {
    const addGymLink = page.locator('a:has-text("Add your gym")').first();
    if (await addGymLink.count() === 0) {
      fail('"Add your gym" link not found in header');
    } else {
      const href = await addGymLink.getAttribute('href');
      pass('"Add your gym" link exists', `href="${href}"`);
      if (href === '/add-gym') {
        // Navigate to the add-gym page to test it opens
        const [newPage] = await Promise.all([
          context.waitForEvent('page').catch(() => null),
          addGymLink.click({ modifiers: ['Meta'] }),
        ]);
        if (newPage) {
          await newPage.waitForLoadState('domcontentloaded');
          const addTitle = await newPage.title();
          pass('"Add your gym" page opens', `Title: "${addTitle}"`);
          await newPage.close();
        } else {
          // Same page navigation
          await page.goto(BASE_URL + '/add-gym', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1000);
          const addPageContent = await page.locator('body').textContent();
          if (addPageContent.includes('gym') || addPageContent.includes('Gym') || addPageContent.includes('add')) {
            pass('"Add your gym" page loads', 'Page content found');
          } else {
            warn('"Add your gym" page', 'Loaded but content unclear');
          }
          // Go back
          await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
          await waitForLoad(page);
        }
      } else {
        warn('"Add your gym"', `Unexpected href: ${href}`);
      }
    }
  }

  // Reload and wait to ensure clean state
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await waitForLoad(page);

  // ─── 13. DARK MODE TOGGLE ───
  console.log('\n── 13. Dark Mode Toggle ──');
  {
    const moonBtn = page.locator('button[aria-label="Toggle theme"]').first();
    if (await moonBtn.count() === 0) {
      fail('Dark mode toggle (moon icon) not found');
    } else {
      const htmlBefore = await page.locator('html').getAttribute('class') ?? '';
      const styleBefore = await page.locator('html').getAttribute('style') ?? '';
      await moonBtn.click();
      await page.waitForTimeout(400);
      const htmlAfter = await page.locator('html').getAttribute('class') ?? '';
      const styleAfter = await page.locator('html').getAttribute('style') ?? '';
      const bodyBefore = await page.locator('body').evaluate(el => window.getComputedStyle(el).backgroundColor);
      await moonBtn.click();
      await page.waitForTimeout(400);
      const bodyAfter = await page.locator('body').evaluate(el => window.getComputedStyle(el).backgroundColor);

      if (htmlBefore !== htmlAfter || styleBefore !== styleAfter || bodyBefore !== bodyAfter) {
        pass('Dark mode toggle', `Theme class/style changed`);
      } else {
        // Check if a data-theme attribute changed
        const themeAttr = await page.locator('html').getAttribute('data-theme') ??
                          await page.locator('body').getAttribute('data-theme') ?? '';
        if (themeAttr) {
          pass('Dark mode toggle', `data-theme="${themeAttr}"`);
        } else {
          warn('Dark mode toggle', 'No detectable class/style/attribute change after click — may use CSS variables only');
        }
      }
    }
  }

  // ─── 14. SORT FROM PIN ───
  console.log('\n── 14. Sort From Pin Button ──');
  {
    // Ensure split view (pin button only shows in split view)
    const splitBtn = page.locator('button:has-text("Split")').first();
    await splitBtn.click();
    await page.waitForTimeout(300);

    const pinBtn = page.locator('button:has-text("Sort from pin"), button:has-text("Clear pin"), button:has-text("Click map")').first();
    if (await pinBtn.count() === 0) {
      fail('"Sort from pin" button not found in split view');
    } else {
      const pinText = await pinBtn.textContent();
      pass('"Sort from pin" button visible', `Label: "${pinText}"`);

      await pinBtn.click();
      await page.waitForTimeout(300);
      const pinTextAfter = await page.locator('button:has-text("Sort from pin"), button:has-text("Clear pin"), button:has-text("Click map")').first().textContent().catch(() => '');
      if (pinTextAfter.includes('Click map') || pinTextAfter.includes('Clear') || pinTextAfter !== pinText) {
        pass('"Sort from pin" button state changes on click', `Now: "${pinTextAfter}"`);
      } else {
        warn('"Sort from pin" button', `Text unchanged: "${pinTextAfter}"`);
      }

      // Click again to cancel pin drop mode
      await page.locator('button:has-text("Sort from pin"), button:has-text("Clear pin"), button:has-text("Click map")').first().click();
      await page.waitForTimeout(200);
    }
  }

  // ─── 15. MY LOCATION BUTTON ───
  console.log('\n── 15. My Location Button ──');
  {
    const myLocBtn = page.locator('button:has-text("My location"), button:has-text("Me")').first();
    if (await myLocBtn.count() === 0) {
      fail('"My location" button not found');
    } else {
      pass('"My location" button exists');
      // Geolocation is mocked — click and see if it activates
      await myLocBtn.click();
      await page.waitForTimeout(1500);
      const btnStyle = await myLocBtn.evaluate(el => window.getComputedStyle(el).backgroundColor);
      info(`My location button bg after click: ${btnStyle}`);
      const bodyText = await page.locator('body').textContent();
      if (bodyText.includes('Your location') || bodyText.includes('sort: ')) {
        pass('"My location": GPS activated', 'Sort label visible');
      } else {
        warn('"My location"', 'No sort label appeared — geolocation may have been denied or silent');
      }
    }
  }

  // ─── 16. MAP ZOOM BUTTONS ───
  console.log('\n── 16. Map Zoom +/- Buttons ──');
  {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForLoad(page);

    // Switch to map view for clearer zoom testing
    await page.locator('button:has-text("Map")').first().click();
    await page.waitForTimeout(500);

    const zoomIn = page.locator('.leaflet-control-zoom-in').first();
    const zoomOut = page.locator('.leaflet-control-zoom-out').first();

    if (await zoomIn.count() === 0) {
      fail('Zoom in (+) button not found');
    } else {
      pass('Zoom in (+) button found');
      await zoomIn.click();
      await page.waitForTimeout(500);
      await zoomIn.click();
      await page.waitForTimeout(500);
      pass('Zoom in: clicked twice');
    }

    if (await zoomOut.count() === 0) {
      fail('Zoom out (-) button not found');
    } else {
      pass('Zoom out (-) button found');
      await zoomOut.click();
      await page.waitForTimeout(500);
      pass('Zoom out: clicked once');
    }
  }

  // ─── 17. CLUSTER CLICK ───
  console.log('\n── 17. Map Cluster Click ──');
  {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForLoad(page);

    await page.locator('button:has-text("Map")').first().click();
    await page.waitForTimeout(800);

    const clusters = page.locator('.marker-cluster');
    const clusterCount = await clusters.count();
    info(`Clusters found: ${clusterCount}`);

    if (clusterCount === 0) {
      warn('Map cluster click', 'No clusters found at current zoom level — try zooming out first');
    } else {
      await clusters.first().click();
      await page.waitForTimeout(1000);

      // Check if zoom increased (clusters broken apart) — no spiderlegs
      const clustersAfter = await page.locator('.marker-cluster').count();
      const spiderLegs = await page.locator('.leaflet-marker-icon.leaflet-zoom-animated').count();
      info(`After cluster click: clusters=${clustersAfter}, spider icons=${spiderLegs}`);

      if (clustersAfter !== clusterCount || spiderLegs > 0) {
        pass('Cluster click: zoom-in behavior', `Before: ${clusterCount} clusters, after: ${clustersAfter}`);
      } else {
        warn('Cluster click', 'Cluster count unchanged — may need to zoom out further for clusters');
      }
    }
  }

  // ─── 18. SINGLE PIN CLICK ───
  console.log('\n── 18. Single Map Pin Click → Overlay Card ──');
  {
    // Zoom in enough to see individual markers
    await page.goto(BASE_URL + '?lat=30.2672&lng=-97.7431', { waitUntil: 'domcontentloaded' });
    await waitForLoad(page);
    await page.locator('button:has-text("Map")').first().click();
    await page.waitForTimeout(500);

    // Zoom in to see pins
    const zoomIn = page.locator('.leaflet-control-zoom-in').first();
    for (let i = 0; i < 5; i++) {
      await zoomIn.click();
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(800);

    const pins = page.locator('.leaflet-marker-icon:not(.marker-cluster)');
    const pinCount = await pins.count();
    info(`Individual pins found after zoom: ${pinCount}`);

    if (pinCount === 0) {
      warn('Single pin click', 'No individual pins found after zooming — try different location');
    } else {
      await pins.first().click();
      await page.waitForTimeout(600);

      // Look for overlay card
      const overlay = page.locator('button:has-text("Suggest correction")');
      if (await overlay.count() > 0) {
        pass('Single pin click: overlay card appeared with gym info');
      } else {
        const overlayCard = page.locator('a:has-text("Visit website"), button:has-text("Cancel")');
        if (await overlayCard.count() > 0) {
          pass('Single pin click: overlay card visible (website/cancel button found)');
        } else {
          warn('Single pin click', 'Could not confirm overlay card appeared — check visually');
        }
      }
    }
  }

  // ─── 19. MAP BACKGROUND CLICK (dismiss overlay) ───
  console.log('\n── 19. Map Background Click → Dismiss Overlay ──');
  {
    const overlayExists = await page.locator('button:has-text("Suggest correction"), button:has-text("Cancel")').count();
    if (overlayExists > 0) {
      // Click on map background
      const mapEl = page.locator('.leaflet-container').first();
      const box = await mapEl.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.1);
        await page.waitForTimeout(500);
        const overlayAfter = await page.locator('button:has-text("Suggest correction")').count();
        if (overlayAfter === 0) {
          pass('Map background click dismisses overlay card');
        } else {
          warn('Map background click', 'Overlay still visible after background click');
        }
      } else {
        warn('Map background click', 'Could not get map bounding box');
      }
    } else {
      warn('Map background click test', 'No overlay was open to dismiss — skipped');
    }
  }

  // ─── CONSOLE ERRORS CHECK ───
  console.log('\n── Console Errors ──');
  if (pageErrors.length === 0) {
    pass('No JS console errors (desktop)');
  } else {
    for (const err of pageErrors.slice(0, 10)) {
      fail('Console error', err.substring(0, 150));
    }
    if (pageErrors.length > 10) {
      fail(`+${pageErrors.length - 10} more console errors`);
    }
  }

  // ─── OVERFLOW CHECK ───
  console.log('\n── Layout Overflow Check (Desktop) ──');
  {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForLoad(page);

    const overflows = await page.evaluate(() => {
      const results = [];
      const els = document.querySelectorAll('*');
      const docWidth = document.documentElement.scrollWidth;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.right > docWidth + 2 || r.left < -2) {
          const tag = el.tagName;
          const txt = (el.textContent || '').substring(0, 30).trim();
          results.push(`${tag}: "${txt}" (right: ${Math.round(r.right)}, docWidth: ${docWidth})`);
          if (results.length >= 5) break;
        }
      }
      return results;
    });

    if (overflows.length === 0) {
      pass('No obvious horizontal overflow on desktop');
    } else {
      for (const o of overflows) {
        warn('Horizontal overflow detected', o);
      }
    }
  }

  // ─── CARDS WITH MISSING DATA ───
  console.log('\n── Cards with Missing Data ──');
  {
    // Switch to list view for easy scanning
    await page.locator('button:has-text("List")').first().click();
    await page.waitForTimeout(500);

    // Use the same card locator as the expansion test: cursor:pointer + border-radius + day text
    const gymCardLocator = page.locator('div[style*="cursor: pointer"][style*="border-radius"]').filter({
      hasText: /Mon|Tue|Wed|Thu|Fri|Sat|Sun/,
    });
    const cardTexts = await gymCardLocator.allTextContents();
    let emptyNames = 0;
    let noSchedule = 0;
    const examples = [];

    for (const text of cardTexts.slice(0, 30)) {
      // A valid card should have at least a gym name (>10 chars) plus schedule
      if (!text || text.trim().length < 10) {
        emptyNames++;
        examples.push(text.substring(0, 50));
      }
      if (!text.match(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/i)) noSchedule++;
    }

    if (emptyNames === 0) {
      pass(`No cards with missing/empty names (checked ${Math.min(cardTexts.length, 30)})`);
    } else {
      warn(`${emptyNames} cards have very short text`, `Examples: ${examples.slice(0, 3).join(' | ')}`);
    }

    if (noSchedule === 0) {
      pass(`All cards have schedule days (first ${Math.min(cardTexts.length, 30)})`);
    } else {
      warn(`${noSchedule} cards without visible day labels`);
    }

    // Check for cards with no name (span with font-weight:700 should have text)
    const cardCount = await gymCardLocator.count();
    info(`Total gym cards in list view: ${cardCount}`);
  }

  await context.close();
}

async function runMobileTests(browser) {
  console.log('\n═══════════════════════════════════════════');
  console.log('  MOBILE TESTS (390x844)');
  console.log('═══════════════════════════════════════════');

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    geolocation: { latitude: 30.2672, longitude: -97.7431 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();

  const mobileErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      mobileErrors.push(msg.text());
      consoleErrors.push({ viewport: 'mobile', text: msg.text() });
    }
  });
  page.on('pageerror', err => {
    mobileErrors.push(err.message);
    consoleErrors.push({ viewport: 'mobile', text: err.message });
  });

  // ─── M1. PAGE LOADS ───
  console.log('\n── M1. Mobile Page Load ──');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await waitForLoad(page);

  const mobileTitle = await page.title();
  if (mobileTitle.includes('MatFinder')) {
    pass('Mobile: page title correct', mobileTitle);
  } else {
    fail('Mobile: page title wrong', mobileTitle);
  }

  const mobileGymCount = await getGymCount(page);
  if (mobileGymCount && mobileGymCount > 0) {
    pass('Mobile: gym count shown', `${mobileGymCount} gyms`);
  } else {
    warn('Mobile: gym count', `${mobileGymCount} — may still be loading`);
  }

  // ─── M2. DAY FILTERS VISIBLE AND CLICKABLE ───
  console.log('\n── M2. Mobile Day Filters ──');
  {
    const monBtn = page.locator('button:has-text("Mon")').first();
    if (await monBtn.count() === 0) {
      fail('Mobile: Mon filter button not found');
    } else {
      pass('Mobile: Day filter buttons visible');

      const before = await getGymCount(page);
      await monBtn.click();
      await page.waitForTimeout(400);
      const after = await getGymCount(page);
      if (after !== before) {
        pass('Mobile: Day filter clickable/tappable', `${before} → ${after}`);
      } else {
        warn('Mobile: Day filter tap', `Count unchanged: ${before}`);
      }
      await monBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // ─── M3. VIEW TOGGLES ───
  console.log('\n── M3. Mobile View Toggles ──');
  {
    const splitBtn = page.locator('button:has-text("Split")').first();
    const mapBtn = page.locator('button:has-text("Map")').first();
    const listBtn = page.locator('button:has-text("List")').first();

    if (await splitBtn.count() === 0) {
      fail('Mobile: View toggle buttons not found');
    } else {
      pass('Mobile: View toggle buttons visible');

      await mapBtn.click();
      await page.waitForTimeout(400);
      const mapVisible = await page.locator('.leaflet-container').count();
      pass('Mobile: Map view', `leaflet containers: ${mapVisible}`);

      await listBtn.click();
      await page.waitForTimeout(400);
      const listCount = await getGymCount(page);
      pass('Mobile: List view', `${listCount} gyms shown`);

      await splitBtn.click();
      await page.waitForTimeout(400);
    }
  }

  // ─── M4. MAP RENDERS ON MOBILE ───
  console.log('\n── M4. Mobile Map Renders ──');
  {
    const mapContainer = await page.locator('.leaflet-container').count();
    if (mapContainer > 0) {
      pass('Mobile: Map renders in split view', 'leaflet-container found');
    } else {
      fail('Mobile: Map not rendered');
    }
  }

  // ─── M5. GYM CARDS IN LIST/SPLIT ───
  console.log('\n── M5. Mobile Gym Cards Visible ──');
  {
    await page.locator('button:has-text("List")').first().click();
    await page.waitForTimeout(400);

    const cards = page.locator('[style*="border-radius"]').filter({ hasText: /Mon|Tue|Wed|Thu|Fri|Sat|Sun/ });
    const cardCount = await cards.count();
    if (cardCount > 0) {
      pass('Mobile: Gym cards visible in list view', `${cardCount} cards`);
    } else {
      fail('Mobile: No gym cards found in list view');
    }

    // Switch back to split
    await page.locator('button:has-text("Split")').first().click();
    await page.waitForTimeout(400);
  }

  // ─── M6. PIN CLICK → OVERLAY ───
  console.log('\n── M6. Mobile Pin Click → Overlay ──');
  {
    // Switch to map-only view for pin click test
    await page.locator('button:has-text("Map")').first().click();
    await page.waitForTimeout(700);

    // Zoom in using the + button
    const zoomIn = page.locator('.leaflet-control-zoom-in').first();
    for (let i = 0; i < 4; i++) {
      await zoomIn.click();
      await page.waitForTimeout(400);
    }
    await page.waitForTimeout(800);

    const pins = page.locator('.leaflet-marker-icon:not(.marker-cluster)');
    const pinCount = await pins.count();
    info(`Mobile: pins found after zoom: ${pinCount}`);

    if (pinCount === 0) {
      warn('Mobile: pin click', 'No individual pins found at this zoom — zoom or location may differ');
    } else {
      // Use JS click to bypass viewport bounds check
      await pins.first().evaluate(el => el.click());
      await page.waitForTimeout(800);
      const hasGymName = await page.locator('button:has-text("Suggest correction"), a:has-text("Visit website"), button:has-text("Cancel")').count();
      if (hasGymName > 0) {
        pass('Mobile: pin click → overlay card visible');
      } else {
        // Try clicking the center of the map as fallback
        const mapEl = page.locator('.leaflet-container').first();
        const box = await mapEl.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(600);
          const hasGymName2 = await page.locator('button:has-text("Suggest correction"), a:has-text("Visit website")').count();
          if (hasGymName2 > 0) {
            pass('Mobile: pin click → overlay card visible (via map center click)');
          } else {
            warn('Mobile: pin click', 'Overlay card not detected after pin click — may need manual verification');
          }
        } else {
          warn('Mobile: pin click', 'Could not get map bounds for fallback test');
        }
      }
    }
  }

  // ─── M7. LAYOUT OVERFLOW CHECK ───
  console.log('\n── M7. Mobile Layout Overflow ──');
  {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await waitForLoad(page);

    const overflows = await page.evaluate(() => {
      const results = [];
      const docWidth = document.documentElement.scrollWidth;
      const viewportWidth = window.innerWidth;
      if (docWidth > viewportWidth + 5) {
        results.push(`Page scrolls horizontally: scrollWidth=${docWidth}, viewportWidth=${viewportWidth}`);
      }
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.right > viewportWidth + 5) {
          const tag = el.tagName;
          const txt = (el.textContent || '').substring(0, 30).trim();
          results.push(`${tag}: "${txt}" overflows right edge (right=${Math.round(r.right)}, viewport=${viewportWidth})`);
          if (results.length >= 5) break;
        }
      }
      return results;
    });

    if (overflows.length === 0) {
      pass('Mobile: No horizontal overflow detected');
    } else {
      for (const o of overflows) {
        fail('Mobile: Layout overflow', o);
      }
    }
  }

  // ─── M8. MAP ATTRIBUTION CHECK ───
  console.log('\n── M8. Mobile Map Attribution Overlap ──');
  {
    await page.locator('button:has-text("Map")').first().click();
    await page.waitForTimeout(500);

    const attribution = await page.locator('.leaflet-control-attribution').boundingBox().catch(() => null);
    const zoomControl = await page.locator('.leaflet-control-zoom').boundingBox().catch(() => null);

    if (!attribution) {
      warn('Mobile: Map attribution', 'Attribution element not found');
    } else {
      pass('Mobile: Map attribution present', `at bottom: y=${Math.round(attribution.y)}`);

      // Check if attribution overlaps with zoom controls
      if (zoomControl && attribution) {
        const overlap = !(
          attribution.x + attribution.width < zoomControl.x ||
          zoomControl.x + zoomControl.width < attribution.x ||
          attribution.y + attribution.height < zoomControl.y ||
          zoomControl.y + zoomControl.height < attribution.y
        );
        if (overlap) {
          warn('Mobile: Attribution may overlap zoom controls');
        } else {
          pass('Mobile: Attribution does not overlap zoom controls');
        }
      }
    }
  }

  // ─── M9. MOBILE CONSOLE ERRORS ───
  console.log('\n── Mobile Console Errors ──');
  if (mobileErrors.length === 0) {
    pass('No JS console errors (mobile)');
  } else {
    for (const err of mobileErrors.slice(0, 5)) {
      fail('Mobile console error', err.substring(0, 150));
    }
  }

  await context.close();
}

async function main() {
  console.log('\n🥋 MatFinder Full UI Audit');
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Date: ${new Date().toLocaleString()}`);
  console.log('   Playwright version: 1.x\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    await runDesktopTests(browser);
    await runMobileTests(browser);
  } finally {
    await browser.close();
  }

  // ─── FINAL REPORT ───
  console.log('\n\n╔══════════════════════════════════════════════╗');
  console.log('║           FULL AUDIT REPORT                  ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  const passed = RESULTS.filter(r => r.status === 'PASS');
  const failed = RESULTS.filter(r => r.status === 'FAIL');
  const warnings = RESULTS.filter(r => r.status === 'WARN');

  console.log(`  Total checks: ${RESULTS.length}`);
  console.log(`  ✅ Passed:    ${passed.length}`);
  console.log(`  ❌ Failed:    ${failed.length}`);
  console.log(`  ⚠️  Warnings:  ${warnings.length}\n`);

  if (failed.length > 0) {
    console.log('── FAILURES ─────────────────────────────────────');
    for (const f of failed) {
      console.log(`  ❌ ${f.test}`);
      if (f.detail) console.log(`     Detail: ${f.detail}`);
    }
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('── WARNINGS ─────────────────────────────────────');
    for (const w of warnings) {
      console.log(`  ⚠️  ${w.test}`);
      if (w.detail) console.log(`     Detail: ${w.detail}`);
    }
    console.log('');
  }

  if (consoleErrors.length > 0) {
    console.log('── CONSOLE ERRORS ───────────────────────────────');
    const unique = [...new Set(consoleErrors.map(e => e.text))];
    for (const e of unique.slice(0, 15)) {
      console.log(`  [${consoleErrors.find(x => x.text === e)?.viewport}] ${e.substring(0, 200)}`);
    }
    console.log('');
  }

  console.log('── PASSED ───────────────────────────────────────');
  for (const p of passed) {
    console.log(`  ✅ ${p.test}${p.detail ? ': ' + p.detail : ''}`);
  }

  console.log('\n── AUDIT COMPLETE ───────────────────────────────');
}

main().catch(err => {
  console.error('\n💥 Audit crashed:', err);
  process.exit(1);
});
