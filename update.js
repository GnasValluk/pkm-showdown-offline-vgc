'use strict';
/**
 * update.js - Cap nhat ban offline theo Smogon moi nhat
 *  node update.js
 * Lam: git pull + build server, git pull + build client,
 *      copy file moi sang client/, tai lai data, patch offline, validate team.
 */
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = __dirname;
const SHOWDOWN_DIR = path.join(ROOT, 'showdown');
const CLIENT_TMP = path.join(ROOT, 'client-tmp');
const CLIENT_SRC = path.join(CLIENT_TMP, 'play.pokemonshowdown.com');
const CLIENT_DIR = path.join(ROOT, 'client');

function log(m) { console.log(`[UPDATE] ${m}`); }
function run(cmd, cwd) {
  log(`$ ${cmd}  (${path.basename(cwd)})`);
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    https.get(url, { headers: { 'User-Agent': 'offline-update' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} : ${url}`));
      }
      const f = fs.createWriteStream(dest);
      res.pipe(f);
      f.on('finish', () => f.close(resolve));
      f.on('error', reject);
    }).on('error', reject);
  });
}

function patchIndexHtml() {
  // Doc testclient moi nhat, ap patch offline, ghi de client/index.html
  const src = path.join(CLIENT_DIR, 'testclient-new.html');
  if (!fs.existsSync(src)) {
    log('Khong thay testclient-new.html, bo qua patch index.');
    return;
  }
  let h = fs.readFileSync(src, 'utf8');
  // 1. Config remote -> local + default localhost:8000
  h = h.replace(
    /<script src="https:\/\/play\.pokemonshowdown\.com\/config\/config\.js"><\/script>[\s\S]*?}\)\(\);/,
    `<script src="config/config.js" onerror="console.log('local config missing, using embedded')"></scr` + `ipt>
	<script>
		// OFFLINE PATCH: mac dinh ket noi server local, khong can mang
		window.Config = window.Config || {};
		Config.version = Config.version || "0-offline-mc";
		Config.bannedHosts = [];
		Config.whitelist = [];
		Config.routes = Config.routes || {
			root: "pokemonshowdown.com",
			client: "play.pokemonshowdown.com",
			dex: "dex.pokemonshowdown.com",
			replays: "replay.pokemonshowdown.com",
			users: "pokemonshowdown.com/users"
		};
		Config.defaultserver = {
			id: 'offline',
			host: 'localhost',
			port: 8000
		};
		Config.testclient = true;
		function loadRemoteData(src) {
			// OFFLINE: data da bundle local trong /data, khong can tai remote.
			console.log('missing local data (offline ok): ' + src);
		}
		(function() {
			if (location.search !== '') {`
  );
  // 2. Net route -> localhost
  h = h.replace(
    /<script> Net\.defaultRoute = 'https:\/\/play\.pokemonshowdown\.com'; <\/script>/,
    `<script> Net = Net || {}; Net.defaultRoute = location.host; </scr` + `ipt>`
  );
  // 3. pokedex-mini remote -> local
  h = h.replace('https://play.pokemonshowdown.com/data/pokedex-mini.js', 'data/pokedex-mini.js');
  h = h.replace('https://play.pokemonshowdown.com/data/pokedex-mini-bw.js', 'data/pokedex-mini-bw.js');
  // 4. logo remote -> local
  h = h.replace('https://play.pokemonshowdown.com/iconbeta.png', 'iconbeta.png');
  // 5. polyfill + testclient-key duong dan sai khi serve local
  h = h.replace('<script nomodule src="/js/lib/ps-polyfill.js"></script>',
    '<script nomodule src="js/lib/ps-polyfill.js"></scr' + 'ipt>');
  h = h.replace('<script src="../config/testclient-key.js"></script>',
    '<script>/* testclient-key khong can offline */</scr' + 'ipt>');
  // Giu theme offline sau moi lan update (patch lai tu testclient moi)
  if (!h.includes('custom-offline.css')) {
    h = h.replace('linkStyle("style/font-awesome.css");',
      'linkStyle("style/font-awesome.css");\n\t\tlinkStyle("style/custom-offline.css"); /* theme rieng offline - giu lai khi update */');
  }
  // Chong cache trinh duyet: moi lan update doi version de client tai JS moi
  h = h.replace(/src="(js\/[^"]+?)(\?offlinev=\d+)?"/g, 'src="$1?offlinev=3"');
  fs.writeFileSync(path.join(CLIENT_DIR, 'index.html'), h);
  log('Da patch client/index.html (offline, localhost:8000).');
}

function patchLoginOffline() {
  // Giu patch login offline sau moi lan update (giong patch index.html)
  const f = path.join(CLIENT_DIR, 'js', 'client-main.js');
  let js = fs.readFileSync(f, 'utf8');
  if (js.includes('OFFLINE-LOGIN')) {
    log('Patch login offline da co.');
    return;
  }
  const oldCode = 'this.loggingIn=name;\nthis.update(null);\nPSLoginServer.rawQuery(';
  if (!js.includes(oldCode)) {
    log('CANH BAO: khong tim thay cho patch login (client doi code?), login offline co the ket.');
    return;
  }
  const newCode = 'this.loggingIn=name;\nthis.update(null);\n' +
    '// OFFLINE-LOGIN: server local (localhost) khong co loginserver -> gui /trn truc tiep\n' +
    'var _lh=(typeof PS!=="undefined"&&PS.server&&PS.server.host)||"";\n' +
    'if(_lh==="localhost"||_lh==="127.0.0.1"||_lh===""){\n' +
    'PS.send("/trn "+name);\n' +
    '_this5.loggingIn=null;\n' +
    '_this5.update({success:true});\n' +
    'return;\n' +
    '}\n' +
    'PSLoginServer.rawQuery(';
  js = js.replace(oldCode, newCode);
  fs.writeFileSync(f, js);
  log('Da patch login offline (js/client-main.js).');
}

async function main() {
  console.log('==============================================');
  console.log('  CAP NHAT OFFLINE THEO SMOGON MOI NHAT');
  console.log('  (can mang, tat Choi-Ngay.bat truoc khi chay)');
  console.log('==============================================');

  // 1. Server (submodule - detached HEAD: fetch + checkout thay vi pull)
  run('git checkout -- package-lock.json', SHOWDOWN_DIR);
  run('git fetch --depth 1 origin master', SHOWDOWN_DIR);
  run('git checkout -q FETCH_HEAD', SHOWDOWN_DIR);
  run('node build', SHOWDOWN_DIR);

  // Kiem tra config offline con khong (config.js la file ignored, git pull khong xoa)
  const cfg = fs.readFileSync(path.join(SHOWDOWN_DIR, 'config', 'config.js'), 'utf8');
  for (const k of ['noguestsecurity = true', 'nothrottle = true', 'noipchecks = true', 'backdoor = false']) {
    if (!cfg.includes(k)) log(`CANH BAO: config.js thieu "${k}". Mo showdown/config/config.js sua lai theo HUONG-DAN.`);
  }
  log('Server xong.');

  // 2. Client (submodule)
  run('git fetch --depth 1 origin master', CLIENT_TMP);
  run('git checkout -q FETCH_HEAD', CLIENT_TMP);
  run('node build', CLIENT_TMP);

  // 3. Copy file moi sang client/ (giu lai index.html + config da patch)
  for (const d of ['js', 'style', 'src', 'fx', 'swf']) {
    const s = path.join(CLIENT_SRC, d);
    if (fs.existsSync(s)) { copyDir(s, path.join(CLIENT_DIR, d)); log(`Copy ${d}/ xong.`); }
  }
  for (const f of ['testclient-new.html', 'testclient-old.html', 'index-new.html', 'crossprotocol.html']) {
    const s = path.join(CLIENT_SRC, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(CLIENT_DIR, f));
  }

  // 3b. Patch login offline (dat ten la vao thang, khong xin token online)
  patchLoginOffline();

  // 4. Tai lai data + chat-formatter (can mang 1 lan, xong choi offline)
  const files = ['graphics.js', 'commands.js', 'pokedex.js', 'moves.js', 'items.js',
    'abilities.js', 'search-index.js', 'teambuilder-tables.js', 'typechart.js',
    'aliases.js', 'pokedex-mini.js', 'pokedex-mini-bw.js'];
  for (const f of files) {
    await download(`https://play.pokemonshowdown.com/data/${f}`, path.join(CLIENT_DIR, 'data', f));
    log(`Tai data/${f} xong.`);
  }
  await download('https://play.pokemonshowdown.com/data/text/en.js', path.join(CLIENT_DIR, 'data', 'text', 'en.js'));
  await download('https://play.pokemonshowdown.com/js/server/chat-formatter.js',
    path.join(CLIENT_DIR, 'js', 'server', 'chat-formatter.js'));
  log('Data xong.');

  // 5. Patch offline + config client
  patchIndexHtml();
  fs.writeFileSync(path.join(CLIENT_DIR, 'config', 'config.js'),
`var Config = Config || {};
Config.version = "0-offline-mc";
Config.bannedHosts = [];
Config.whitelist = [];
Config.defaultserver = {
  id: 'offline',
  host: 'localhost',
  port: 8000
};
Config.roomsFirstOpenScript = function () {};
Config.customcolors = {};
Config.routes = {
  root: 'pokemonshowdown.com',
  client: 'play.pokemonshowdown.com',
  dex: 'dex.pokemonshowdown.com',
  replays: 'replay.pokemonshowdown.com',
  users: 'pokemonshowdown.com/users',
  teams: 'teams.pokemonshowdown.com',
};
Config.testclient = true;
`);

  // 6. Validate lai team mau (format moi co the doi luat)
  for (const t of fs.readdirSync(path.join(ROOT, 'teams'))) {
    if (!t.endsWith('.txt')) continue;
    const r = spawnSync(process.execPath, ['pokemon-showdown', 'validate-team', '[Gen 9 Champions] VGC 2026 Reg M-C'],
      { cwd: SHOWDOWN_DIR, input: fs.readFileSync(path.join(ROOT, 'teams', t)) });
    if (r.status === 0) log(`Team OK: ${t}`);
    else log(`Team CANH BAO (luat moi?): ${t}\n` + String(r.stdout || r.stderr).slice(0, 400));
  }

  console.log('==============================================');
  console.log('  XONG! Mo Choi-Ngay.bat de choi ban moi.');
  console.log('  (Neu muon up len GitHub: git add showdown client-tmp,');
  console.log('   git commit -m "Bump Smogon", git push)');
  console.log('==============================================');
}

main().catch((e) => { console.error('[UPDATE] LOI:', e.message); process.exit(1); });
