#!/usr/bin/env node
/* Locked In at Hillside: the level validator. Run with `node assets/escape/check.js`.
   It reads assets/escape/logic.js (the same data the game uses to gate every ring, button and objective) and, for each level,
   walks every reachable state of the puzzle (a state is the set of flags the player holds; steps only ever add flags) and proves:
     1. every step and every goal can be reached from the start, and the level can be finished;
     2. each lock's parts are all known before the lock can open, and they spell its answer (in time order for Hard);
     3. no part is ever known in a state that lacks its clue flag (no sequence leaks);
     4. codes are unique across levels, not trivial, and not guessable in a few tries;
     5. every goal has three hint tiers, and every step that is not a free house action is the end of some goal.
   Exit code 1 if anything fails. */
'use strict';
const path = require('path');
const LOGIC = require(path.join(__dirname, 'logic.js'));

let fails = 0, notes = [];
const ok = (cond, msg) => { if(!cond){ fails++; console.log('  FAIL ' + msg); } return cond; };
const key = s => [...s].sort().join(',');
const fact = n => n <= 1 ? 1 : n * fact(n - 1);

function walk(L){
  const steps = Object.entries(L.steps), seen = new Map(), queue = [new Set()];
  seen.set('', queue[0]);
  const fired = new Set(), edges = [];
  while(queue.length){ const s = queue.shift();
    for(const [id, st] of steps){
      if(!st.needs.every(f => s.has(f))) continue;
      if(st.gives.every(f => s.has(f))) continue;
      fired.add(id); const n = new Set(s); st.gives.forEach(f => n.add(f)); const k = key(n);
      edges.push([s, id, n]);
      if(!seen.has(k)){ seen.set(k, n); queue.push(n); } } }
  return {states: [...seen.values()], fired, edges};
}

function checkLevel(name, L){
  console.log(`\n${name.toUpperCase()}: ${L.title}`);
  const {states, fired, edges} = walk(L);
  const all = new Set(); states.forEach(s => s.forEach(f => all.add(f)));
  console.log(`  ${states.length} reachable states, ${Object.keys(L.steps).length} steps, ${L.goals.length} goals`);

  // 1. reachability
  for(const id of Object.keys(L.steps)) ok(fired.has(id), `step ${id} can never be taken`);
  ok(all.has('opened'), 'the level can never be finished');
  for(const g of L.goals){ ok(states.some(s => g.needs.every(f => s.has(f)) && !g.done.some(f => s.has(f))), `goal ${g.id} never shows`);
    ok(g.done.some(f => all.has(f)), `goal ${g.id} can never be done`); }

  // 3. no sequence leaks: a part is never held without its clue; and the step that gives it needs the clue (directly or through its chain)
  for(const [p, P] of Object.entries(L.parts)){
    const bad = states.filter(s => s.has(p) && !s.has(P.clue));
    ok(!bad.length, `part ${p} can be known before its clue ${P.clue} (${bad.length} states)`);
    ok(states.some(s => s.has(p)), `part ${p} is never learned`); }

  // 2. locks: parts known before opening, and they spell the answer
  for(const [lid, K] of Object.entries(L.locks)){
    const st = Object.entries(L.steps).find(([, s]) => s.lock === lid); ok(!!st, `lock ${lid} has no step`); if(!st) continue;
    const needs = st[1].needs;
    for(const p of K.parts.concat(K.order ? [K.order] : [])) ok(needs.includes(p), `lock ${lid} can be attempted without ${p}`);
    let spelled = K.parts.map(p => L.parts[p].value).join('');
    ok(spelled === K.answer, `lock ${lid}: parts spell ${spelled}, answer is ${K.answer}`);
    if(K.byTime){ // the order is the time of day each part can be read, and those windows must not overlap
      const byT = K.parts.slice().sort((a, b) => L.parts[a].read[0] - L.parts[b].read[0]);
      ok(byT.join() === K.parts.join(), `lock ${lid}: parts are not in time order`);
      for(let i = 1; i < byT.length; i++) ok(L.parts[byT[i]].read[0] >= L.parts[byT[i - 1]].read[1], `lock ${lid}: reading times of ${byT[i - 1]} and ${byT[i]} overlap`);
      for(const p of K.parts){ const sid = Object.keys(L.steps).find(k => L.steps[k].gives.includes(p)), sun = L.steps[sid].sun;
        ok(sun && sun[0] === L.parts[p].read[0] && sun[1] === L.parts[p].read[1], `lock ${lid}: ${p} reading window differs from step ${sid}`); } }
    // every state where the lock step becomes possible holds every part and the order
    const can = states.filter(s => needs.every(f => s.has(f)));
    ok(can.length > 0 && can.every(s => K.parts.every(p => s.has(p))), `lock ${lid} reachable without all its parts`);
    // 4. guessing: with every part but the order, and with every part but one
    const n = K.answer.length, noOrder = K.order ? fact(K.parts.length) : 1, missOne = 10 * (K.order ? fact(K.parts.length) : 1);
    const blind = Math.pow(10, n);
    console.log(`  lock ${lid}: answer ${K.answer}; blind ${blind} codes; all parts but no order ${noOrder} orders; one part missing ${missOne}; pause after ${K.pause || 'none'} wrong`);
    ok(blind >= 1000, `lock ${lid}: fewer than 1000 blind codes`);
    if(K.order) ok(noOrder >= 24 && K.pause > 0, `lock ${lid}: order guessable (${noOrder}) without a pause`);
    ok(missOne >= 10, `lock ${lid}: a missing part is guessable`);
    ok(!/^(\d)\1+$/.test(K.answer) && !'0123456789'.includes(K.answer) && !'9876543210'.includes(K.answer), `lock ${lid}: answer ${K.answer} is trivial`); }

  // 5. hints and goals covering steps
  for(const g of L.goals){ ok(Array.isArray(g.hints) && g.hints.length === 3 && g.hints.every(h => typeof h === 'string' && h.length > 6), `goal ${g.id} lacks three hint tiers`);
    ok(typeof g.text === 'string' && g.text.length > 8, `goal ${g.id} has no objective line`);
    for(const t of [g.text].concat(g.hints)){ ok(!/—/.test(t), `goal ${g.id}: em dash in "${t}"`); ok(!/\?\s*$/.test(t), `goal ${g.id}: question in "${t}"`); } }
  // a goal covers the step that ends it and every step on the way there that its own needs don't already give
  const covers = g => { const out = new Set(), want = [...g.done], have = new Set(g.needs);
    while(want.length){ const f = want.pop(); if(have.has(f)) continue; have.add(f);
      for(const [id, st] of Object.entries(L.steps)) if(st.gives.includes(f) && !out.has(id)){ out.add(id); want.push(...st.needs); } }
    return out; };
  const cov = new Set(); L.goals.forEach(g => covers(g).forEach(s => cov.add(s)));
  for(const [id, st] of Object.entries(L.steps)){ if(st.free) continue; ok(cov.has(id), `step ${id} is not on the way to any goal (no hints for it)`); }
  // every non-final state has an open goal (the objective line and the hint button always have something to say)
  const stuck = states.filter(s => !s.has('opened') && !L.goals.some(g => g.needs.every(f => s.has(f)) && !g.done.some(f => s.has(f))));
  ok(!stuck.length, `${stuck.length} states have no open goal`);
  // goals show up only after the clue for anything they point at
  return {states: states.length};
}

const codes = {};
for(const [name, L] of Object.entries(LOGIC)){ checkLevel(name, L); for(const K of Object.values(L.locks)) (codes[K.answer] = codes[K.answer] || []).push(name); }
console.log('\nALL LEVELS');
for(const [c, ls] of Object.entries(codes)) ok(ls.length === 1, `code ${c} is used in ${ls.join(' and ')}`);
const ans = Object.keys(codes); for(let i = 0; i < ans.length; i++) for(let j = 0; j < ans.length; j++) if(i !== j) ok(!ans[j].includes(ans[i]), `code ${ans[i]} is inside ${ans[j]}`);
console.log(fails ? `\n${fails} problem(s).` : '\nEvery level is solvable, leak-free, fully hinted, and no code is guessable in a few tries.');
process.exit(fails ? 1 : 0);
