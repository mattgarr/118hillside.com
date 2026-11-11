/* Proof for Room for Everyone: run with `node assets/room3d/solve.js [days]`.
   For every hand-made puzzle and for the next [days] daily puzzles (default 120) it enumerates every possible way to give every
   guest a room and checks that exactly one satisfies every clue, in all four readings of the two facts the model leaves unsure
   (whether the two lower bedrooms count as sharing a wall, and whether the garage counts as part of the lower level).
   It also checks the stored hints point at the real answer. Not loaded by the site. */
const R = require('./room-logic.js');
const days = +(process.argv[2] || 120), verbose = process.argv.indexOf('-v') >= 0;
const fmt = at => Object.entries(at).map(([g, s]) => R.GUESTS[g].short || R.GUESTS[g].name + ' > ' + R.SLOTS[s].name).map((x, i) => x.indexOf('>') < 0 ? x + ' > ' + R.SLOTS[Object.values(at)[i]].name : x).join(' | ');
let bad = 0;
console.log('Hand-made puzzles');
R.LEVELS.forEach((L, i) => { const p = R.prove(L), d = R.depth(L), total = R.WORLDS.map(w => R.solutions(Object.assign({}, L, {clues: []}), w).length)[0];
  const okOrder = L.order.length === L.guests.length && L.guests.every(g => L.order.indexOf(g) >= 0 && (L.hints[g] || []).length === 2);
  console.log(`\n${i + 1}. ${L.title}: ${L.guests.length} to place, ${L.clues.length} clues, ${total} possible arrangements`);
  L.clues.forEach((c, j) => console.log(`     ${j + 1}. ${c.t}`));
  console.log(`   answers found in the four readings: ${p.counts.join(', ')}  ->  ${p.ok ? 'exactly one, the same in all' : 'NOT UNIQUE'}`);
  console.log(`   answer: ${fmt(p.answer || {})}`);
  console.log(`   placed by their own clues alone: ${d.alone} of ${d.total}; clues it could do without: ${R.spare(L).join(', ') || 'none'}; hints complete: ${okOrder ? 'yes' : 'NO'}`);
  if(!p.ok || !okOrder) bad++; });
console.log(`\nDaily puzzles, ${days} days from today`);
const day0 = R.dayNumber(new Date()); let n = 0, clues = 0, rel = 0, minC = 99, maxC = 0, pinned = 0, t0 = Date.now(); const seen = new Set(), guests = {};
for(let d = day0; d < day0 + days; d++){ const L = R.daily(d); if(!L){ console.log('  day', d, 'NO PUZZLE'); bad++; continue; }
  const p = R.prove(L); if(!p.ok){ console.log('  day', d, 'NOT UNIQUE', p.counts.join(',')); bad++; continue; }
  n++; clues += L.clues.length; rel += L.clues.filter(R.isRel).length; minC = Math.min(minC, L.clues.length); maxC = Math.max(maxC, L.clues.length); pinned += R.depth(L).alone / L.guests.length;
  seen.add(L.guests.slice().sort().join(',') + '>' + JSON.stringify(p.answer)); for(const g of L.guests) guests[g] = (guests[g] || 0) + 1;
  if(verbose || d < day0 + 3){ console.log(`\n  day ${d}: ${L.guests.map(g => R.GUESTS[g].short || R.GUESTS[g].name).join(', ')}`); L.clues.forEach((c, j) => console.log(`     ${j + 1}. ${c.t}`)); console.log(`     answer: ${fmt(p.answer)}`); } }
console.log(`\n  ${n} of ${days} proven unique in all four readings; ${seen.size} different puzzles; clues per puzzle ${minC} to ${maxC} (mean ${(clues / n).toFixed(1)}), of which ${(rel / n).toFixed(1)} compare one guest with another; share of guests placed by their own clues alone ${(pinned / n * 100).toFixed(0)}%; ${Date.now() - t0} ms`);
console.log('  appearances: ' + Object.entries(guests).sort((a, b) => b[1] - a[1]).map(([g, k]) => g + ' ' + k).join(', '));
console.log(bad ? `\nFAILED: ${bad} problem(s)` : '\nAll puzzles proven.');
process.exit(bad ? 1 : 0);
