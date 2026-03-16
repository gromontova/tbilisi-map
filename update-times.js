#!/usr/bin/env node
'use strict';

const https  = require('https');
const fs     = require('fs');

const HTML_FILE = '/Users/Anastasia.Gromontova/tbilisi-map-en.html';
const HOTEL     = { lat: 41.6981, lng: 44.7930 };

// OSRM public API — OpenStreetMap routing, no key needed
function osrmGet(mode, from, to) {
  // OSRM uses lng,lat order; separate servers for foot vs car
  const host = mode === 'foot' ? 'routing.openstreetmap.de' : 'routing.openstreetmap.de';
  const svc  = mode === 'foot' ? 'routed-foot' : 'routed-car';
  const path = `/${svc}/route/v1/${mode}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
  return new Promise((resolve, reject) => {
    https.get({ hostname: host, path }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.routes && j.routes.length > 0) {
            resolve(Math.round(j.routes[0].duration / 60));
          } else {
            resolve(null); // no route
          }
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getETAs(place) {
  const [walk, drive] = await Promise.all([
    osrmGet('foot',       HOTEL, place),
    osrmGet('driving',    HOTEL, place),
  ]);
  return { walk, drive };
}

async function main() {
  const html = fs.readFileSync(HTML_FILE, 'utf8');

  // Extract places from PLACES array
  const re = /\{ name:'([^']+)'[\s\S]*?lat:([\d.]+),lng:([\d.]+),\s*walk:(\d+|null),taxi:(\d+)/g;
  // Note: walk can also be written as null for far places
  const places = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    places.push({
      name:    m[1],
      lat:     parseFloat(m[2]),
      lng:     parseFloat(m[3]),
      oldWalk: m[4] === 'null' ? null : parseInt(m[4]),
      oldTaxi: parseInt(m[5])
    });
  }
  console.log(`Found ${places.length} places\n`);

  let updated = html;
  for (const p of places) {
    const { walk, drive } = await getETAs(p);
    const newWalk = p.oldWalk === null ? null : walk;
    const newTaxi = drive ?? p.oldTaxi;

    console.log(`${p.name}: walk ${p.oldWalk}→${newWalk ?? 'null'}, taxi ${p.oldTaxi}→${newTaxi}`);

    const oldStr = `walk:${p.oldWalk === null ? 'null' : p.oldWalk},taxi:${p.oldTaxi}`;
    const newStr = `walk:${newWalk === null ? 'null' : newWalk},taxi:${newTaxi}`;
    updated = updated.replace(oldStr, newStr);

    // Small delay to be polite to the free server
    await new Promise(r => setTimeout(r, 300));
  }

  fs.writeFileSync(HTML_FILE, updated, 'utf8');
  console.log('\n✓ HTML updated with real routing times!');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
