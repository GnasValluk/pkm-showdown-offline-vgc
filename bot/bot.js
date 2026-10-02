'use strict';
/**
 * OfflineBot - Bot VGC offline cho Pokemon Showdown local
 * Format mac dinh: [Gen 9 Champions] VGC 2026 Reg M-C (doubles, bring 6 pick 4)
 * Chay: node bot.js (yeu cau server local port 8000 dang chay)
 */
const fs = require('fs');
const path = require('path');

const SERVER_URL = process.env.PS_URL || 'ws://localhost:8000/showdown/websocket';
const BOT_NAME = process.env.PS_BOT_NAME || 'OfflineBot';
const FORMAT = '[Gen 9 Champions] VGC 2026 Reg M-C';
const TEAM_FILE = process.env.PS_BOT_TEAM ||
  path.join(__dirname, '..', 'teams', 'BOT-VGC-Reg-MC-Mega-Salamence.txt');

let Dex;
let Teams;
try {
  Dex = require('../showdown/dist/sim/dex.js').Dex.mod('champions');
  Teams = require('../showdown/dist/sim/teams.js').Teams;
} catch (e) {
  console.error('[Bot] Khong load duoc Dex/Teams tu showdown/dist. Hay chay `node build` trong thu muc showdown truoc.');
  console.error(String(e).slice(0, 500));
  process.exit(1);
}

function loadTeamPool() {
  const dir = path.join(__dirname, '..', 'teams');
  const files = fs.readdirSync(dir).filter(f => /^BOT-.*\.txt$/.test(f)).sort();
  if (!files.length) throw new Error('Khong thay team BOT-*.txt trong teams/');
  const pool = files.map(f => {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const team = Teams.import(txt);
    return { file: f, packed: Teams.pack(team), count: team.length };
  });
  console.log(`[Bot] Da load ${pool.length} team: ${pool.map(t => t.file.replace('BOT-', '').replace('.txt', '')).join(' | ')}`);
  return pool;
}
let TEAM_POOL = [];
try {
  TEAM_POOL = loadTeamPool();
} catch (e) {
  console.error('[Bot] Loi doc team:', e.message);
  process.exit(1);
}
let PACKED_TEAM = TEAM_POOL[0].packed;
let CURRENT_TEAM_FILE = TEAM_POOL[0].file;
let MEGA_SLOT = 1;
detectMegaSlot();

function normId(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// Slot (1-based) cua con cam Mega Stone trong team hien tai - tinh 1 lan moi tran
function detectMegaSlot() {
  MEGA_SLOT = 1;
  try {
    const sets = Teams.unpack(PACKED_TEAM);
    for (let i = 0; i < sets.length; i++) {
      const it = Dex.items.get(sets[i].item || '');
      if (it && it.exists && it.megaStone) { MEGA_SLOT = i + 1; break; }
    }
  } catch {}
}
function pickRandomTeam() {
  const t = TEAM_POOL[Math.floor(Math.random() * TEAM_POOL.length)];
  PACKED_TEAM = t.packed;
  CURRENT_TEAM_FILE = t.file;
  detectMegaSlot();
  console.log(`[Bot] Tran nay dung team: ${t.file}`);
  return PACKED_TEAM;
}

// ---- AI helpers ----
// ctx: {turn, ownHpFrac, partnerAlive} - giup bot khon hon:
// Fake Out chi manh turn 1, Protect khi yeu mau, tranh Earthquake vao dong doi
function moveScore(moveId, userTypes, foeList, ctx) {
  ctx = ctx || { turn: 99, ownHpFrac: 1, partnerAlive: true };
  const mv = Dex.moves.get(moveId);
  if (!mv || !mv.exists) return { score: 1, target: 'foe' };
  if (mv.category === 'Status') {
    const id = mv.id;
    // Protect: rat cao khi yeu mau (<40%), binh thuong thi thap (tranh spam)
    if (id === 'protect' || id === 'detect') {
      return { score: ctx.ownHpFrac < 0.4 ? 95 : 25 + Math.random() * 8, target: 'self' };
    }
    // Fake Out chi co tac dung turn 1
    if (id === 'fakeout') return { score: ctx.turn === 1 ? 90 : 5, target: 'foe' };
    if (id === 'followme' || id === 'ragepowder') return { score: 70, target: 'self' };
    if (id === 'helpinghand') {
      // Helping Hand chi hay khi dong doi danh manh
      return { score: ctx.partnerAlive ? 45 : 5, target: 'self' };
    }
    if (id === 'tailwind' || id === 'trickroom' || id === 'sunnyday' || id === 'raindance') {
      // Dung thoi tiet/room 1 lan dau tran
      return { score: ctx.turn <= 2 ? 60 : 12, target: 'self' };
    }
    if (id === 'swordsdance' || id === 'dragondance' || id === 'calmmind' || id === 'nastyplot') {
      // Setup khi dang day mau
      return { score: ctx.ownHpFrac > 0.7 ? 50 : 15, target: 'self' };
    }
    if (id === 'partingshot' || id === 'uturn' || id === 'voltswitch') return { score: 35, target: 'foe' };
    return { score: 15 + Math.random() * 10, target: 'self' };
  }
  const basePower = mv.basePower || 50;
  const stab = userTypes.includes(mv.type) ? 1.5 : 1;
  let bestMult = 1;
  if (foeList.length) {
    bestMult = 0;
    for (const foe of foeList) {
      if (!foe.types || !foe.types.length) { bestMult = Math.max(bestMult, 1); continue; }
      if (!Dex.getImmunity(mv.type, foe.types)) continue; // mien nhiem -> bo
      const eff = Dex.getEffectiveness(mv.type, foe.types);
      const mult = Math.pow(2, eff);
      if (mult > bestMult) bestMult = mult;
    }
    if (bestMult === 0) bestMult = 0.1; // tat ca mien nhiem
  }
  const priorityBonus = (mv.priority || 0) > 0 ? 15 : 0;
  const accPenalty = mv.accuracy && mv.accuracy !== true && mv.accuracy < 90 ? 0.9 : 1;
  let spreadPenalty = 1;
  // allAdjacent (VD Earthquake) danh ca dong doi -> giam diem khi partner con song
  if (mv.target === 'allAdjacent' && ctx.partnerAlive) spreadPenalty = 0.7;
  const score = basePower * stab * bestMult * accPenalty * spreadPenalty + priorityBonus + Math.random() * 12;
  const needsTarget = ['normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe'].includes(mv.target);
  return { score, target: needsTarget ? (mv.target === 'adjacentAlly' ? 'ally' : 'foe') : 'none' };
}

function pickFoeTarget(foeSlots, tried) {
  // Showdown doubles: foe = +1/+2 (so duong), ally = -1/-2
  // foeSlots index 0 -> '1', 1 -> '2'
  const order = ['1', '2'];
  if (tried) {
    const alt = order.filter(t => t !== tried);
    // Uu tien foe yeu mau trong cac lua chon con lai
    const alive = foeSlots.map((f, i) => ({ ...f, loc: order[i] })).filter(f => f.alive && alt.includes(f.loc));
    if (alive.length) {
      alive.sort((a, b) => (a.hp / (a.maxhp || 1)) - (b.hp / (b.maxhp || 1)));
      return alive[0].loc;
    }
    return alt[0] || '1';
  }
  const alive = foeSlots.map((f, i) => ({ ...f, loc: order[i] })).filter(f => f.alive);
  if (!alive.length) return '1';
  // Uu tien foe yeu mau nhat
  alive.sort((a, b) => (a.hp / (a.maxhp || 1)) - (b.hp / (b.maxhp || 1)));
  return alive[0].loc;
}

function partnerLoc(activeIdx) {
  // Bot slot 0 (trai, loc -1) -> partner -2; slot 1 (phai) -> partner -1
  return activeIdx === 0 ? '-2' : '-1';
}

// ---- Bot connection ----
const battles = new Map(); // roomid -> {request, foes:[{species,types,hp,maxhp,alive}], mine:[...], rqid}

let ws = null;
let connected = false;
let challstr = '';

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(msg);
}

function connect() {
  console.log(`[Bot] Ket noi ${SERVER_URL} ...`);
  ws = new WebSocket(SERVER_URL);
  ws.onopen = () => {
    connected = true;
    console.log('[Bot] Da ket noi server. Cho challstr...');
  };
  ws.onmessage = (ev) => handleMessage(String(ev.data));
  ws.onerror = (e) => console.log('[Bot] WS error:', e.message || e);
  ws.onclose = () => {
    connected = false;
    console.log('[Bot] Mat ket noi, thu lai sau 3s...');
    setTimeout(connect, 3000);
  };
}

function handleMessage(data) {
  // Server co the gui nhieu message cach nhau \n, hoac bat dau bang >roomid
  if (data.startsWith('o')) return; // SockJS open (neu co)
  if (data.startsWith('a[')) {
    try {
      const arr = JSON.parse(data.slice(1));
      for (const m of arr) handleMessage(m);
    } catch {}
    return;
  }
  const rooms = splitRooms(data);
  for (const { room, lines } of rooms) {
    for (const line of lines) handleLine(room, line);
  }
}

function splitRooms(data) {
  // Tach theo >roomid
  const out = [];
  let curRoom = '';
  let curLines = [];
  for (const raw of data.split('\n')) {
    if (!raw) continue;
    if (raw.startsWith('>')) {
      if (curLines.length || curRoom) out.push({ room: curRoom, lines: curLines });
      curRoom = raw.slice(1).trim();
      curLines = [];
    } else {
      curLines.push(raw);
    }
  }
  out.push({ room: curRoom, lines: curLines });
  return out;
}

function handleLine(room, line) {
  if (!line.startsWith('|')) return;
  const parts = line.split('|');
  const type = parts[1];

  if (type === 'challstr') {
    challstr = parts[2] + '|' + parts[3];
    send(`|/trn ${BOT_NAME}`);
    return;
  }
  if (type === 'updateuser') {
    const name = (parts[2] || '').trim();
    const named = parts[3] === '1';
    if (named && name === BOT_NAME) {
      console.log(`[Bot] Dang nhap thanh cong: ${name}`);
      send(`|/join lobby`);
      pickRandomTeam();
      send(`|/utm ${PACKED_TEAM}`);
      send(`|/avatar 167`); // Cynthia-ish
    } else if (!named) {
      // Guest, thu doi ten lai (cho server noguestsecurity)
    }
    return;
  }
  if (type === 'nametaken') {
    console.log('[Bot] Ten bi trung / loi:', parts.slice(2).join('|').slice(0, 200));
    // Thu ten khac
    send(`|/trn ${BOT_NAME} ${Math.floor(Math.random() * 900 + 100)}`);
    return;
  }
  if (type === 'pm') {
    const from = (parts[2] || '').trim();
    const to = (parts[3] || '').trim();
    const msg = parts.slice(4).join('|');
    const cleanFrom = from.replace(/^[^A-Za-z0-9]+/, '');
    if (msg.startsWith('/challenge')) {
      console.log(`[Bot] Nhan thach dau tu ${cleanFrom}: ${msg.slice(0, 120)}`);
      pickRandomTeam(); // moi tran 1 team giai that khac nhau
      send(`|/utm ${PACKED_TEAM}`);
      setTimeout(() => send(`|/accept ${cleanFrom}`), 400);
    } else if (/wanna battle|danh|bot/i.test(msg) && cleanFrom !== BOT_NAME) {
      // Ai PM hoi bot thi gui huong dan
      // Khong spam: chi tra loi challenge
    }
    return;
  }
  if (type === 'updatechallenges') {
    try {
      const ch = JSON.parse(parts.slice(2).join('|') || '{}');
      if (ch.challengesFrom) {
        for (const u of Object.keys(ch.challengesFrom)) {
          console.log(`[Bot] Chap nhan thach dau tu ${u}`);
          pickRandomTeam();
          send(`|/utm ${PACKED_TEAM}`);
          send(`|/accept ${u}`);
          break;
        }
      }
    } catch {}
    return;
  }
  // Battle rooms
  const roomid = room || '';
  if (type === 'init' && parts[2] === 'battle') {
    console.log(`[Bot] Vao tran ${roomid}`);
    battles.set(roomid, { request: null, foes: [{}, {}], rqid: 0 });
    send(`${roomid}|/join`);
    return;
  }
  if (!roomid.startsWith('battle-')) return;
  const st = battles.get(roomid) || { request: null, foes: [{}, {}], rqid: 0 };
  battles.set(roomid, st);

  if (type === 'request') {
    const json = parts.slice(2).join('|');
    if (!json) return;
    try {
      const req = JSON.parse(json);
      st.request = req;
      if (req.rqid) st.rqid = req.rqid;
      if (!req.wait) st.retries = 0;
      decide(roomid, req, st);
    } catch (e) {
      console.log(`[Bot][${roomid}] Loi parse request:`, e.message);
    }
    return;
  }
  if (type === 'turn') {
    const n = parseInt(parts[2], 10);
    if (!isNaN(n)) st.turn = n; // bot dung de biet Fake Out turn 1
    return;
  }
  if (type === 'switch' || type === 'drag' || type === 'replace') {
    // |switch|p2a: Ten|Species,hp|hp/max
    trackSwitch(st, parts);
    return;
  }
  if (type === 'faint') {
    return;
  }
  if (type === 'win' || type === 'tie') {
    console.log(`[Bot][${roomid}] Tran ket thuc: ${line.slice(0, 150)}`);
    battles.delete(roomid);
    pickRandomTeam(); // chuan bi team moi cho tran sau
    send(`|/utm ${PACKED_TEAM}`);
    return;
  }
  if (type === 'error') {
    const msg = parts.slice(2).join('|');
    console.log(`[Bot][${roomid}] Loi choice: ${msg.slice(0, 200)}`);
    // Chong lap vo han: dem retry, doi target hoac default
    st.retries = (st.retries || 0) + 1;
    if (st.retries > 6) {
      console.log(`[Bot][${roomid}] Qua nhieu loi, dung default`);
      st.retries = 0;
      send(`${roomid}|/choose default`);
      return;
    }
    if (/needs a target|Invalid target/i.test(msg) && st.request) {
      decide(roomid, st.request, st, true);
    } else if (/Can't/i.test(msg) && st.request) {
      // Thu default 1 lan, khong loop
      send(`${roomid}|/choose default`);
    }
    return;
  }
  if (type === 'inactive') {
    // Doi thu yeu cau timer - bot danh nhanh nen ke
    return;
  }
}

function trackSwitch(st, parts) {
  // parts: ['', 'switch', 'p2a: Name', 'Species, L50, M', 'hp/max']
  const slot = parts[2] || '';
  const details = parts[3] || '';
  const cond = parts[4] || '';
  const m = /^(p[12])([ab]):/.exec(slot);
  if (!m) return;
  const side = m[1]; // p1 = bot? hay doi thu? Bot co the la p1 hoac p2 -> can biet. Tam luu ca 2, AI dung foe = phia doi dien.
  // Luu theo side de decide() chon dung
  st['slot_' + slot.slice(0, 3)] = { details, cond };
  // Parse species + hp
  const speciesName = details.split(',')[0].trim();
  let sp = null;
  try { sp = Dex.species.get(speciesName); } catch {}
  const hpm = /(\d+)\s*\/\s*(\d+)/.exec(cond);
  const info = {
    species: speciesName,
    types: sp && sp.exists ? sp.types : [],
    hp: hpm ? +hpm[1] : 100,
    maxhp: hpm ? +hpm[2] : 100,
    alive: !/0 ?fnt|0\//.test(cond) || (hpm && +hpm[1] > 0),
  };
  if (!st.slots) st.slots = {};
  st.slots[slot.slice(0, 3)] = info;
}

// Quyet dinh nuoc di
function decide(roomid, req, st, forceDefaultTarget = false) {
  try {
    if (!req) return;
    if (req.wait) return; // doi doi thu
    if (req.teamPreview) {
      // VGC bring 6 pick 4: cham diem moi con (BST + Mega + Fake Out + toc do),
      // bat buoc lay Mega, sap lead theo toc do (nhanh + Fake Out ra san dau)
      const mons = req.side.pokemon || [];
      const maxPick = req.maxTeamSize || 4;
      const scored = mons.map((p, i) => {
        let bst = 500, spe = 50, hasFakeOut = false;
        try {
          const sp = Dex.species.get(p.details ? p.details.split(',')[0] : p.ident);
          if (sp && sp.exists && sp.baseStats) {
            bst = Object.values(sp.baseStats).reduce((a, b) => a + b, 0);
            spe = sp.baseStats.spe || 50;
          }
        } catch {}
        const moves = p.moves || [];
        hasFakeOut = moves.some(m => normId(m) === 'fakeout');
        return { i: i + 1, bst, spe, hasFakeOut, mega: (i + 1) === MEGA_SLOT };
      });
      // Bat buoc lay Mega (neu co), con lai lay diem cao nhat
      scored.forEach(s => {
        s.score = s.bst + (s.mega ? 1000 : 0) + (s.hasFakeOut ? 60 : 0) + s.spe * 0.3;
      });
      scored.sort((a, b) => b.score - a.score);
      const picks = scored.slice(0, maxPick);
      // Lead: 2 con nhanh nhat (uu tien Fake Out)
      picks.sort((a, b) => ((b.hasFakeOut ? 1000 : 0) + b.spe) - ((a.hasFakeOut ? 1000 : 0) + a.spe));
      const order = picks.map(s => s.i).join(',');
      console.log(`[Bot][${roomid}] Team preview chon: ${order}`);
      send(`${roomid}|/team ${order}`);
      return;
    }
    const active = req.active || [];
    if (!active.length) {
      // Co the la forceSwitch chi? active rong nhung co side.pokemon -> van can switch
      if (req.forceSwitch) {
        const sw = buildSwitches(req, st);
        if (sw) { send(`${roomid}|/choose ${sw}`); return; }
      }
      return;
    }
    // Xac dinh bot la p1 hay p2 de biet foe slots
    const mySide = detectMySide(req);
    const foeSlots = getFoeSlots(st, mySide);
    const myTypesList = getMyTypes(req);
    const myHpList = getMyHp(req);
    const turn = st.turn || 1;

    const choices = [];
    const forceSwitch = req.forceSwitch || [];
    const usedSwitchSlots = new Set();
    for (let i = 0; i < active.length; i++) {
      const act = active[i];
      if (!act) { choices.push('pass'); continue; }
      if (forceSwitch[i]) {
        const sw = pickSwitch(req, st, i, usedSwitchSlots);
        choices.push(sw ? `switch ${sw}` : 'pass');
        continue;
      }
      if (act.trapped || act.maybeTrapped) {
        // Bi khoa -> danh
      }
      const moves = act.moves || [];
      let bestIdx = 0, bestScore = -1e9, bestTarget = 'foe';
      const userTypes = myTypesList[i] || [];
      const partnerAlive = active.some((a, j) => j !== i && a);
      const ctx = { turn, ownHpFrac: myHpList[i] != null ? myHpList[i] : 1, partnerAlive };
      // Neu conMega va chua mega -> uu tien mega o turn 1-2
      const canMega = act.canMegaEvo;
      for (let mi = 0; mi < moves.length; mi++) {
        const mv = moves[mi];
        if (mv.disabled) continue;
        if (mv.pp === 0) continue;
        const { score, target } = moveScore(mv.id || mv.move, userTypes, foeSlots.filter(f => f.alive), ctx);
        let s = score;
        if (s > bestScore) { bestScore = s; bestIdx = mi; bestTarget = target; }
      }
      const mv = moves[bestIdx];
      const dexMove = Dex.moves.get(mv.id || mv.move);
      let cmd = `move ${bestIdx + 1}`;
      // Mega: neu co the mega va move gay damage -> mega luon (VGC Mega rat manh)
      if (canMega && dexMove.category !== 'Status') cmd += ' mega';
      if (forceDefaultTarget) {
        // Doi target khac lan truoc (foe dung +1/+2)
        const tried = st.lastTarget && st.lastTarget.replace('+', '');
        cmd += ' ' + pickFoeTarget(foeSlots, tried);
      } else if (bestTarget === 'foe' && ['normal', 'any', 'adjacentFoe'].includes(dexMove.target)) {
        const t = pickFoeTarget(foeSlots);
        st.lastTarget = t;
        cmd += ` ${t}`;
      } else if (bestTarget === 'ally' && (dexMove.target === 'adjacentAlly' || dexMove.target === 'adjacentAllyOrSelf')) {
        cmd += ` ${partnerLoc(i)}`;
      }
      // Ghi nho de tranh lap
      choices.push(cmd);
    }
    const choiceStr = choices.join(', ');
    console.log(`[Bot][${roomid}] Chon: ${choiceStr}`);
    send(`${roomid}|/choose ${choiceStr}`);
  } catch (e) {
    console.log(`[Bot][${roomid}] Loi decide:`, e.message);
    try { send(`${roomid}|/choose default`); } catch {}
  }
}

function detectMySide(req) {
  // req.side.id: 'p1' hoac 'p2'
  if (req.side && (req.side.id === 'p1' || req.side.id === 'p2')) return req.side.id;
  return 'p1';
}

function getFoeSlots(st, mySide) {
  const foeSide = mySide === 'p1' ? 'p2' : 'p1';
  const out = [];
  for (const pos of ['a', 'b']) {
    const info = (st.slots || {})[foeSide + pos];
    if (info) {
      out.push({ alive: info.hp > 0, hp: info.hp, maxhp: info.maxhp, types: info.types || [] });
    } else {
      out.push({ alive: true, hp: 100, maxhp: 100, types: [] });
    }
  }
  return out;
}

function getMyTypes(req) {
  const out = [];
  const pokes = (req.side && req.side.pokemon) || [];
  const actives = req.active || [];
  // Map active index -> pokemon active trong side.pokemon
  let ai = 0;
  for (let i = 0; i < pokes.length && ai < actives.length; i++) {
    if (pokes[i].active) {
      try {
        const sp = Dex.species.get(pokes[i].details ? pokes[i].details.split(',')[0] : '');
        out[ai] = sp && sp.exists ? sp.types : [];
      } catch { out[ai] = []; }
      ai++;
    }
  }
  while (out.length < actives.length) out.push([]);
  return out;
}

function getMyHp(req) {
  // Map active index -> ti le mau hien tai (de bot biet Protect khi yeu)
  const out = [];
  const pokes = (req.side && req.side.pokemon) || [];
  for (const p of pokes) {
    if (!p.active) continue;
    const cond = p.condition || '';
    const m = /(\d+)\s*\/\s*(\d+)/.exec(cond);
    out.push(m ? (+m[1]) / (+m[2] || 1) : 1);
  }
  return out;
}

function buildSwitches(req, st) {
  const fs = req.forceSwitch || [];
  const parts = [];
  const used = new Set();
  for (let i = 0; i < fs.length; i++) {
    if (fs[i]) {
      const sw = pickSwitch(req, st, i, used);
      parts.push(sw ? `switch ${sw}` : 'pass');
    } else parts.push('pass');
  }
  return parts.join(', ');
}

function pickSwitch(req, st, activeIdx, used) {
  const pokes = (req.side && req.side.pokemon) || [];
  // activeIdx la thu tu trong active, can anh xa sang bench chua faint + khong active
  for (let i = 0; i < pokes.length; i++) {
    const p = pokes[i];
    if (p.active) continue;
    if (used && used.has(i + 1)) continue; // 2 con cung ngat khong duoc chon trung slot
    const cond = p.condition || '';
    const m = /(\d+)\s*\/\s*(\d+)/.exec(cond);
    const hp = m ? +m[1] : 1;
    if (hp > 0 && !/fnt/.test(cond)) {
      if (used) used.add(i + 1);
      return i + 1; // switch dung vi tri 1-based trong team 6
    }
  }
  return 0;
}

connect();
