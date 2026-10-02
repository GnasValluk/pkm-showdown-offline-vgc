'use strict';
/**
 * start.js - Mo la choi: chay server game + bot + web offline
 *  node start.js
 *  => Server:  http://localhost:8000 (game logic)
 *  => Web:     http://localhost:8080 (mo trang nay de choi)
 *  => Bot:     OfflineBot tu dong nhan thach dau VGC Reg M-C
 */
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const SHOWDOWN_DIR = path.join(ROOT, 'showdown');
const GAME_PORT = 8000;
const WEB_PORT = process.env.PS_CLIENT_PORT ? +process.env.PS_CLIENT_PORT : 8080;
const PIDS_DIR = path.join(ROOT, '.pids');

function writePid(name, pid) {
  try {
    fs.mkdirSync(PIDS_DIR, { recursive: true });
    fs.writeFileSync(path.join(PIDS_DIR, name + '.pid'), String(pid));
  } catch {}
}
function clearPids() {
  try { fs.rmSync(PIDS_DIR, { recursive: true, force: true }); } catch {}
}

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

function waitPort(port, host = '127.0.0.1', timeout = 30000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function tryOnce() {
      const s = net.connect(port, host, () => {
        s.end();
        resolve(true);
      });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - t0 > timeout) return reject(new Error('Het thoi gian cho port ' + port));
        setTimeout(tryOnce, 500);
      });
    })();
  });
}

function openBrowser(url) {
  // Mo trinh duyet mac dinh, nhieu fallback de chac chan mo duoc tren Windows
  const { exec } = require('child_process');
  log('WEB', `Dang tu mo trinh duyet toi ${url} ...`);
  if (process.platform === 'win32') {
    exec(`cmd /c start "" "${url}"`, (err) => {
      if (err) {
        log('WEB', 'Cach 1 that bai, thu PowerShell...');
        exec(`powershell -NoProfile -Command "Start-Process '${url}'"`, (err2) => {
          if (err2) {
            log('WEB', 'Khong tu mo duoc, ban copy link tren vao trinh duyet nhe.');
          } else log('WEB', 'Da mo trinh duyet (PowerShell).');
        });
      } else log('WEB', 'Da mo trinh duyet.');
    });
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

async function main() {
  console.log('==============================================');
  console.log('  POKEMON SHOWDOWN OFFLINE - VGC 2026 Reg M-C');
  console.log('  Mo la choi, khong can mang (bot co san)');
  console.log('==============================================');

  // 1. Kiem tra build server
  if (!fs.existsSync(path.join(SHOWDOWN_DIR, 'dist', 'server', 'index.js'))) {
    log('SETUP', 'Chua build server, dang build (lan dau hoi lau)...');
    await new Promise((resolve, reject) => {
      const b = spawn(process.execPath, ['build'], { cwd: SHOWDOWN_DIR, stdio: 'inherit', shell: false });
      b.on('close', (c) => (c === 0 ? resolve() : reject(new Error('Build that bai, ma ' + c))));
    });
  }

  // 2. Chay server game
  log('GAME', `Dang chay server game port ${GAME_PORT}...`);
  writePid('web', process.pid); // tien trinh web (chinh no)
  const server = spawn(process.execPath, ['pokemon-showdown', String(GAME_PORT)], {
    cwd: SHOWDOWN_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  writePid('server', server.pid);
  server.stdout.on('data', (d) => process.stdout.write(`[GAME] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[GAME-ERR] ${d}`));
  server.on('close', (c) => log('GAME', `Server dung (ma ${c}). Nhan Ctrl+C de thoat.`));

  try {
    await waitPort(GAME_PORT);
    log('GAME', `Server san sang: http://localhost:${GAME_PORT}`);
  } catch (e) {
    log('GAME', 'Khong thay server len! Xem loi o tren. Nhan Ctrl+C.');
  }

  // 3. Chay bot
  log('BOT', 'Dang chay OfflineBot (VGC Reg M-C)...');
  const bot = spawn(process.execPath, [path.join(ROOT, 'bot', 'bot.js')], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env, PS_URL: `ws://localhost:${GAME_PORT}/showdown/websocket` },
  });
  writePid('bot', bot.pid);
  bot.stdout.on('data', (d) => process.stdout.write(`${d}`));
  bot.stderr.on('data', (d) => process.stderr.write(`[BOT-ERR] ${d}`));

  // 4. Chay web offline (trong tien trinh nay)
  const { serve } = require('./client-server.js');
  http.createServer(serve).listen(WEB_PORT, '127.0.0.1', () => {
    const url = `http://localhost:${WEB_PORT}`;
    log('WEB', `San sang! Mo trinh duyet: ${url}`);
    log('WEB', 'Chon ten bat ky (khach) -> chon team VGC -> thach dau OfflineBot');
    openBrowser(url);
  });

  // Tat sach khi Ctrl+C
  process.on('SIGINT', () => {
    log('SYS', 'Dang tat...');
    try { server.kill(); } catch {}
    try { bot.kill(); } catch {}
    clearPids();
    setTimeout(() => process.exit(0), 800);
  });
}

main().catch((e) => {
  console.error('Loi khoi dong:', e);
  process.exit(1);
});
