'use strict';
// Test nhanh: gia lap nguoi choi thach dau OfflineBot va danh vai turn
const fs = require('fs');
const path = require('path');
const { Teams } = require('../showdown/dist/sim/teams.js');

const URL = 'ws://localhost:8000/showdown/websocket';
const FORMAT = '[Gen 9 Champions] VGC 2026 Reg M-C';
const TEAM_TXT = fs.readFileSync(path.join(__dirname, '..', 'teams', 'Mau-1-Garchomp-Z.txt'), 'utf8');
const PACKED = Teams.pack(Teams.import(TEAM_TXT));

const ws = new WebSocket(URL);
let myName = 'Tester' + Math.floor(Math.random() * 900 + 100);
let roomid = null;
let turnCount = 0;

function send(m) { ws.send(m); }

ws.onopen = () => console.log('[Test] connected as', myName);
ws.onmessage = (ev) => {
  const data = String(ev.data);
  for (const raw of data.split('\n')) {
    if (!raw) continue;
    if (raw.startsWith('>')) { roomid = raw.slice(1).trim(); continue; }
    if (!raw.startsWith('|')) continue;
    const p = raw.split('|');
    const t = p[1];
    if (t === 'challstr') {
      send(`|/trn ${myName}`);
    } else if (t === 'updateuser' && p[3] === '1') {
      console.log('[Test] login ok:', p[2]);
      send(`|/utm ${PACKED}`);
      setTimeout(() => {
        console.log('[Test] gui challenge toi OfflineBot');
        send(`|/challenge OfflineBot, ${FORMAT}`);
      }, 800);
    } else if (t === 'pm') {
      const msg = p.slice(4).join('|');
      if (msg.includes('/accept') || msg.includes('accepted')) console.log('[Test] PM:', msg.slice(0, 120));
    } else if (t === 'updatechallenges') {
      console.log('[Test] challenges:', raw.slice(0, 150));
    } else if (t === 'init' && p[2] === 'battle') {
      console.log('[Test] VAO TRAN', roomid);
    } else if (t === 'request') {
      const json = p.slice(2).join('|');
      if (!json) continue;
      const req = JSON.parse(json);
      if (req.teamPreview) {
        console.log('[Test] team preview, chon 1,2,3,4');
        send(`${roomid}|/team 1,2,3,4`);
      } else if (!req.wait && (req.active || req.forceSwitch)) {
        // Test player cu danh auto (server tu chon move+target hop le)
        turnCount++;
        console.log(`[Test] turn req (lan ${turnCount}) forceSwitch=${JSON.stringify(req.forceSwitch)} -> /choose default`);
        send(`${roomid}|/choose default`);
      }
    } else if (t === 'error') {
      console.log('[Test] ERROR:', p.slice(2).join('|').slice(0, 200));
      if (/target|Invalid|Can't/i.test(p.slice(2).join('|'))) {
        console.log('[Test] fallback default');
        send(`${roomid}|/choose default`);
      }
    } else if (t === 'turn') {
      console.log('[Test] --- TURN', p[2], '---');
      if (+p[2] >= 10) {
        console.log('[Test] OK: danh duoc 10 turn, bot hoat dong. Forfeit de ket thuc test.');
        send(`${roomid}|/forfeit`);
      }
    } else if (t === 'win' || t === 'tie') {
      console.log('[Test] TRAN KET THUC:', raw.slice(0, 150));
      console.log('TEST-PASS');
      ws.close();
      process.exit(0);
    } else if (t === 'battle') {
      // phong battle duoc tao
    }
  }
};
ws.onerror = (e) => console.log('[Test] err', e.message);
setTimeout(() => { console.log('[Test] TIMEOUT (chua xong tran, nhung da test duoc)'); process.exit(2); }, 60000);
