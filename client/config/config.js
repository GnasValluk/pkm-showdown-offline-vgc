var Config = Config || {};
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
