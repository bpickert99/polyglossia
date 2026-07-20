#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
// Transit Tournament — DC Map Seed Script
// Run once: node seed-dc.js
//
// This pushes the built-in Washington DC (WMATA) map to your
// Firebase Realtime Database at /maps/map_dc_wmata so it appears
// in the Community Maps browser.
//
// Requirements: Node.js, internet access, Firebase URL below.
// ─────────────────────────────────────────────────────────────────

const FB_URL = 'https://battle-for-washington-default-rtdb.firebaseio.com';
const MAP_ID = 'map_dc_wmata';

// ── DC Zone polygons (abbreviated centroid list for zone lookup) ──
// Full polygons are in the app; this seed uses them directly.
// We pull them from the running app's constants via a small extract.

// Since this script needs the full ZONE_POLYS, ZONES, METRO_STATIONS,
// MLINES, LINE_BONUSES, and LANDMARKS arrays, we import them from
// the app file rather than duplicating thousands of lines here.

const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'index.html');
if (!fs.existsSync(appFile)) {
  console.error('Error: index.html not found in the same directory as this script.');
  process.exit(1);
}

const html = fs.readFileSync(appFile, 'utf8');

// Extract the script content
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) {
  console.error('Error: Could not find <script> block in index.html');
  process.exit(1);
}

// We need to eval the relevant constants from the app
// Extract just the data we need
function extractConst(name, src) {
  const idx = src.indexOf(name);
  if (idx < 0) throw new Error(`${name} not found`);
  // Find matching bracket/brace
  let start = src.indexOf('[', idx);
  if (start < 0 || start > idx + 200) start = src.indexOf('{', idx);
  let depth = 0, i = start, open = src[start], close = open === '[' ? ']' : '}';
  while (i < src.length) {
    if (src[i] === open) depth++;
    else if (src[i] === close) { depth--; if (depth === 0) return src.slice(start, i+1); }
    i++;
  }
  throw new Error(`Could not extract ${name}`);
}

let ZONE_POLYS, ZONES, METRO_STATIONS, MLINES, LINE_BONUSES, LANDMARKS;

try {
  const scriptSrc = scriptMatch[1];
  ZONE_POLYS   = eval('(' + extractConst('const ZONE_POLYS =', scriptSrc) + ')');
  ZONES        = eval('(' + extractConst('const ZONES=[', scriptSrc) + ')');
  METRO_STATIONS = eval('(' + extractConst('const METRO_STATIONS =', scriptSrc) + ')');
  // MLINES references MLINE_PATHS, so build a flat version
  const MLINE_PATHS = eval('(' + extractConst('const MLINE_PATHS =', scriptSrc) + ')');
  const rawMlines  = eval('(' + extractConst('const MLINES=', scriptSrc)
    .replace(/MLINE_PATHS\["([^"]+)"\]/g, (_, k) => JSON.stringify(MLINE_PATHS[k])) + ')');
  MLINES       = rawMlines;
  LINE_BONUSES = eval('(' + extractConst('const LINE_BONUSES=', scriptSrc) + ')');
  LANDMARKS    = eval('(' + extractConst('const LANDMARKS =', scriptSrc) + ')');
  console.log(`✓ Extracted: ${ZONES.length} zones, ${METRO_STATIONS.length} stations, ${LANDMARKS.length} landmarks`);
} catch(e) {
  console.error('Error extracting data from index.html:', e.message);
  process.exit(1);
}

const mapObj = {
  id: MAP_ID,
  name: 'Washington DC (WMATA)',
  cityName: 'Washington, DC',
  cityTag: 'washington-dc',
  desc: 'Full DC metro area — all 8 wards plus Northern Virginia and Maryland suburbs. Built-in WMATA transit map.',
  creator: 'Transit Tournament',
  createdAt: Date.now(),
  playCount: 0,
  config: {
    cityName: 'Washington DC',
    cityCenter: { lat: 38.8895, lng: -77.0353 },
    transitMode: 'transit',
    transitTypes: ['metro'],
    zones: ZONES,
    landmarks: LANDMARKS,
    transitStops: METRO_STATIONS,
    transitLines: MLINES,
    lineBonuses: LINE_BONUSES
  }
};

const url = `${FB_URL}/maps/${MAP_ID}.json`;
console.log(`\nPosting to: ${url}`);
console.log('Payload size:', (JSON.stringify(mapObj).length / 1024).toFixed(1), 'KB');

fetch(url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(mapObj)
}).then(async r => {
  if (r.ok) {
    console.log('\n✓ DC map successfully seeded to Firebase!');
    console.log('  Map ID:', MAP_ID);
    console.log('  It will now appear in Community Maps when hosts search "Washington".');
  } else {
    const text = await r.text();
    console.error('\n✗ Firebase returned an error:', r.status, text);
    console.error('\nYou may need to update your Firebase Realtime Database rules to allow writes.');
    console.error('In the Firebase console, set your rules to:');
    console.error(JSON.stringify({ rules: { '.read': true, '.write': true } }, null, 2));
    console.error('\n(Remember to tighten rules again after seeding.)');
  }
}).catch(e => {
  console.error('\n✗ Fetch failed:', e.message);
  console.error('Check your internet connection and Firebase URL.');
});
