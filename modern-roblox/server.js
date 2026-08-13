/*
 * Static host + auth for the modern Roblox copy.
 *
 * Page files are byte-for-byte copies of the repo's HTMLs (never edited).
 * The auth endpoints below implement ONLY contracts that already exist in
 * the repo's code/htmls (no new API design):
 *
 *   POST /login                                <- 2016-roblox-main/services/auth.js
 *        (urlencoded username, password)          + legacy landing form action="/login"
 *   POST /login/signup                         <- api/public/Data/index.html
 *        (username, password, passwordConfirm,    data-signup-api-url="/login/signup"
 *         birthdayMonth, birthdayDay,
 *         birthdayYear, gender)
 *   GET  /apisite/users/v1/users/authenticated <- 2016-roblox-main/services/users.js
 *        -> {id, name} | 401 {errors:[...]}       + legacy landing inline JS
 *   POST /login/2fa                            <- api/public/Data/2FA.html
 *        (Code)
 *   POST /apisite/auth/v2/logout               <- 2016-roblox-main/services/auth.js
 *   cookie .ROBLOSECURITY                      <- legacy landing inline JS
 *   x-csrf-token header                        <- 2016-roblox-main/lib/request.js
 *   errors  {errors:[{code,message}]}          <- 2016-roblox-main/lib/request.js
 *   failure redirects ?loginmsg= / ?signupmsg= <- legacy landing inline JS
 *                        ?err=                 <- 2FA.html inline JS
 *
 * Validation rules/strings are taken from the html form attributes:
 *   username 3-20 chars, "_" allowed  ("Username (length 3-20, _ is allowed)")
 *   password min 8                     ("Password (minimum length 8)")
 *   birthday month/day/year required   ("Invalid birthday")
 *   gender 2 (male) or 3 (female)      ("Gender is required")
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const app = express();
const root = __dirname;

const USERS_FILE = path.join(root, 'users.json');
const SESSIONS_FILE = path.join(root, 'sessions.json');
const DB_FILE = path.join(root, 'roblox.db');

const COOKIE_NAME = '.ROBLOSECURITY';

/* ---- storage -------------------------------------------------------------
 * SQLite via node:sqlite (built into Node >= 22.5, zero native modules, so it
 * runs on Termux/Android with no compilation). Falls back to the JSON file
 * store on older Node versions.
 * ------------------------------------------------------------------------ */
const SQLite = (() => { try { return require('node:sqlite'); } catch (e) { return null; } })();
let sqlite = null;
try { if (SQLite) sqlite = new SQLite.DatabaseSync(DB_FILE); } catch (e) { sqlite = null; }

if (sqlite) {
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS users (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  username TEXT NOT NULL UNIQUE,' +
    '  password TEXT NOT NULL,' +
    '  gender INTEGER,' +
    '  birthday TEXT,' +
    '  isAdmin INTEGER DEFAULT 0' +
    ')'
  );
  // keep schema compatible with DBs created before the admin column
  try { sqlite.exec('ALTER TABLE users ADD COLUMN isAdmin INTEGER DEFAULT 0'); } catch (e) { /* already there */ }
  sqlite.exec(
    'CREATE TABLE IF NOT EXISTS sessions (' +
    '  token TEXT PRIMARY KEY,' +
    '  userId INTEGER NOT NULL,' +
    '  created INTEGER' +
    ')'
  );
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function saveJson(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) { /* ignore */ }
}
let users = loadJson(USERS_FILE, []);
let sessions = loadJson(SESSIONS_FILE, {});
let nextUserId = users.reduce((m, u) => Math.max(m, u.id || 0), 0) + 1;

function findByUsername(username) {
  if (sqlite) return sqlite.prepare('SELECT * FROM users WHERE lower(username) = lower(?)').get(username) || null;
  return users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}
function findUserById(id) {
  if (sqlite) return sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
  return users.find(u => u.id === id) || null;
}
function insertUser(username, password, gender, birthday) {
  const storedPassword = hashPassword(password);
  if (sqlite) {
    const info = sqlite.prepare('INSERT INTO users (username, password, gender, birthday, isAdmin) VALUES (?, ?, ?, ?, 0)')
      .run(username, storedPassword, gender, JSON.stringify(birthday));
    return { id: Number(info.lastInsertRowid), username, password: storedPassword, gender, birthday, isAdmin: 0 };
  }
  const user = { id: nextUserId++, username, password: storedPassword, gender, birthday, isAdmin: 0 };
  users.push(user);
  saveJson(USERS_FILE, users);
  return user;
}

/* isAdmin: reads the column if present (old rows default to 0) */
function isAdminUser(user) {
  if (!user) return false;
  return user.isAdmin === 1 || user.isAdmin === true || user.isAdmin === '1';
}
function seedRobloxAdmin() {
  // the default game is by Roblox: make user 'Roblox' an admin account
  const pw = 'password123';
  try {
    let row = findByUsername('Roblox');
    if (row) {
      if (!isAdminUser(row)) {
        if (sqlite) sqlite.prepare('UPDATE users SET isAdmin = 1 WHERE username = ?').run('Roblox');
        else { row.isAdmin = 1; saveJson(USERS_FILE, users); }
      }
    } else {
      const u = insertUser('Roblox', pw, 2, ['Jan', '1', '2006']);
      if (sqlite) sqlite.prepare('UPDATE users SET isAdmin = 1 WHERE id = ?').run(u.id);
      else { u.isAdmin = 1; saveJson(USERS_FILE, users); }
    }
  } catch (e) { /* ignore */ }
}
seedRobloxAdmin();
function saveSession(token, userId) {
  if (sqlite) { sqlite.prepare('INSERT INTO sessions (token, userId, created) VALUES (?, ?, ?)').run(token, userId, Date.now()); return; }
  sessions[token] = { userId, created: Date.now() };
  saveJson(SESSIONS_FILE, sessions);
}
function getSession(token) {
  if (sqlite) return sqlite.prepare('SELECT * FROM sessions WHERE token = ?').get(token) || null;
  return sessions[token] || null;
}
function deleteSession(token) {
  if (!token) return;
  if (sqlite) { sqlite.prepare('DELETE FROM sessions WHERE token = ?').run(token); return; }
  if (sessions[token]) { delete sessions[token]; saveJson(SESSIONS_FILE, sessions); }
}

/* passwords are stored as scrypt hashes (node:crypto, no native modules);
 * plaintext rows from earlier versions still verify via fallback */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  if (stored.indexOf('scrypt$') === 0) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const candidate = crypto.scryptSync(password, parts[1], 32);
    const expected = Buffer.from(parts[2], 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  }
  return stored === password; // legacy plaintext row
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) {
      try { out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* ignore */ }
    }
  });
  return out;
}

function issueSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  saveSession(token, user.id);
  res.cookie(COOKIE_NAME, token, { httpOnly: true, path: '/' });
}

function clearSession(req, res) {
  deleteSession(parseCookies(req)[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function currentUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  const s = token ? getSession(token) : null;
  if (!s) return null;
  return findUserById(s.userId) || null;
}

function apiError(res, status, code, message) {
  res.status(status).json({ errors: [{ code, message }] });
}

/* ---- host guard: if the browser is pointed at 0.0.0.0 or 127.0.0.1
 *     (unreachable on Android), send it to localhost on the same port/path
 *     so the user lands on a working page instead of ERR_CONNECTION_REFUSED ---- */
app.use((req, res, next) => {
  const h = req.headers.host || '';
  if (/^(0\.0\.0\.0|127\.0\.0\.1)(:\d+)?$/i.test(h)) {
    return res.redirect('http://localhost' + h.replace(/^[^:]+/, '') + req.originalUrl);
  }
  next();
});

/* ---- CSRF: echo header per 2016 lib/request.js; no enforcement so the
 *     repo's native forms (which carry no token) keep working ---- */
app.use((req, res, next) => {
  res.set('x-csrf-token', crypto.randomBytes(16).toString('base64'));
  next();
});

/* ---- body parsing ---- */
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/* ---- signup handler: contract from api/public/Data/index.html ---- */
function handleSignup(req, res, opts) {
  opts = opts || {};
  const b = req.body || {};
  const username = String(b.username || '').trim();
  const password = String(b.password || '');
  const passwordConfirm = String(b.passwordConfirm || b.confirmPassword || '');
  // accept both the repo form's names and the modern API's names/values:
  //   gender: 2/3 (repo) or "Male"/"Female" (modern API)
  //   birthday: month/day/year fields or ISO string "YYYY-MM-DDTHH:mm:ss.SSSZ"
  let gender = b.gender;
  if (typeof gender === 'string') gender = gender.toLowerCase() === 'male' ? 2 : gender.toLowerCase() === 'female' ? 3 : Number(gender);
  gender = Number(gender);
  let month = b.birthdayMonth !== undefined ? b.birthdayMonth : b.birthMonth;
  let day = b.birthdayDay !== undefined ? b.birthdayDay : b.birthDay;
  let year = b.birthdayYear !== undefined ? b.birthdayYear : b.birthYear;
  if (typeof b.birthday === 'string' && /^\d{4}-\d{2}-\d{2}/.test(b.birthday)) {
    const p = b.birthday.split('-');
    year = p[0]; month = Number(p[1]); day = Number(p[2]);
  }
  const birthday = [month, day, year].every(v => v !== undefined && v !== '');
  // native browser form post: go back to the page it came from with an error
  // param (the legacy page displays it; the modern landing simply reloads)
  const isNativeForm = /text\/html/.test(req.headers.accept || '');
  const backTo = (msg) => {
    const ref = req.get('referer') || '';
    return (ref.includes('/legacy') ? '/legacy' : '/') + '?signupmsg=' + encodeURIComponent(msg);
  };

  const fail = (msg) => {
    if (isNativeForm) return res.redirect(backTo(msg));
    return apiError(res, 400, 0, msg);
  };

  // rules copied from the html input placeholders/validation
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return fail('Username must be 3-20 characters (_ allowed).');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (passwordConfirm && password !== passwordConfirm) return fail('Passwords do not match.');
  if (!birthday) return fail('Invalid birthday.');
  if (![0, 1, 2, 3].includes(gender)) return fail('Gender is required.');
  if (findByUsername(username)) return fail('Username is already taken.');

  const user = insertUser(username, password, gender, [month, day, year]);
  issueSession(res, user);

  if (isNativeForm) return res.redirect('/home');
  if (opts.modern) return res.json({});   // match the real API response the bundles expect
  res.json({ success: true, user: { id: user.id, name: user.username } });
}

/* ---- login handler: contract from services/auth.js + legacy form ----
 * Also accepts the modern API's {ctype:"Username", cvalue, password}. */
function handleLogin(req, res, opts) {
  opts = opts || {};
  const b = req.body || {};
  const username = String(b.username || b.cvalue || '').trim();
  const password = String(b.password || '');
  const user = findByUsername(username);
  // native browser form post: go back to the page it came from with an error
  const isNativeForm = /text\/html/.test(req.headers.accept || '');
  const backTo = (msg) => {
    const ref = req.get('referer') || '';
    return (ref.includes('/legacy') ? '/legacy' : '/') + '?loginmsg=' + encodeURIComponent(msg);
  };

  if (!user || !verifyPassword(password, user.password)) {
    if (isNativeForm) return res.redirect(backTo('Invalid username or password.'));
    return apiError(res, 401, 0, 'Incorrect username or password.');
  }

  issueSession(res, user);
  if (isNativeForm) return res.redirect('/home');
  if (opts.modern) return res.json({});   // match the real API response the bundles expect
  res.json({ success: true, user: { id: user.id, name: user.username } });
}

/* ---- endpoints ---- */
app.get('/', (req, res, next) => {
  // like the real site: logged-in users hitting / are sent to their home page
  if (currentUser(req)) return res.redirect('/home');
  next();
});
app.get('/signup', (req, res) => res.redirect('/'));   // landing IS the signup page
app.get('/account/signupredir', (req, res) => res.redirect('/'));   // Roblox's signup redirect flow -> landing
app.get('/account/signup', (req, res) => res.redirect('/'));
app.get('/account/login', (req, res) => res.redirect('/login'));
app.get('/account', (req, res) => res.redirect('/'));
app.get('/login', (req, res, next) => {
  // like the real site: a logged-in user visiting /login is sent home
  if (currentUser(req)) return res.redirect('/home');
  next();
});
app.post('/login', (q, r) => { console.log('[login]', q.headers['content-type'], JSON.stringify(q.body)); handleLogin(q, r, {}); });
app.post('/v2/login', (q, r) => { console.log('[login v2]', q.headers['content-type'], JSON.stringify(q.body)); handleLogin(q, r, { modern: true }); });   // modern API
app.post('/v1/login', (q, r) => { console.log('[login v1]', q.headers['content-type'], JSON.stringify(q.body)); handleLogin(q, r, { modern: true }); });   // older API
app.post('/login/signup', (q, r) => { console.log('[signup]', q.headers['content-type'], JSON.stringify(q.body)); handleSignup(q, r, {}); });
app.post('/signup', (q, r) => { console.log('[signup alt]', q.headers['content-type'], JSON.stringify(q.body)); handleSignup(q, r, {}); });
app.post('/v2/signup', (q, r) => { console.log('[signup v2]', q.headers['content-type'], JSON.stringify(q.body)); handleSignup(q, r, { modern: true }); }); // modern API
app.post('/v1/signup', (q, r) => { console.log('[signup v1]', q.headers['content-type'], JSON.stringify(q.body)); handleSignup(q, r, { modern: true }); }); // older API

app.post('/login/2fa', (req, res) => {
  const code = String((req.body && req.body.Code) || '').trim();
  if (!/^\d{6}$/.test(code)) {
    // 2FA.html displays the ?err= query param itself
    return res.redirect('/2fa?err=' + encodeURIComponent('Invalid code. Please try again.'));
  }
  res.redirect('/home');
});

app.post('/apisite/auth/v2/logout', (req, res) => {
  clearSession(req, res);
  res.json({});
});
app.post('/v2/logout', (req, res) => {           // same contract, bundle path
  clearSession(req, res);
  res.json({});
});

/* ---- local data-API stubs -----------------------------------------------
 * The modern pages' content is fetched at runtime from Roblox's data APIs
 * (games.roblox.com, catalog.roblox.com, ...). The browser blocks those
 * cross-origin, so the pages never fill in. The injected API_REWRITE routes
 * those calls to /__api/<subdomain><path>; here we return the empty-but-valid
 * shapes documented by the repo's own 2016-roblox-main/services/*.js, so the
 * pages render their shells and empty states instead of failing.
 * ---------------------------------------------------------------------- */
app.all('/__api/*', (req, res) => {
  const rest = req.params[0] || '';
  const q = rest.indexOf('?');
  const pathOnly = (q === -1 ? rest : rest.slice(0, q)).replace(/^\/+/, '');
  const slash = pathOnly.indexOf('/');
  const sub = slash === -1 ? pathOnly : pathOnly.slice(0, slash);
  const p = slash === -1 ? '' : pathOnly.slice(slash);
  let body = {};
  if (sub === 'users') {
    if (p.indexOf('/v1/users/authenticated') === 0) {
      const user = currentUser(req);
      if (!user) return apiError(res, 401, 0, 'You are not logged in.');
      body = { description: '', created: '2020-01-01T00:00:00.000Z', isBanned: false, externalAppDisplayName: null, hasVerifiedBadge: true, isAdmin: isAdminUser(user), id: user.id, name: user.username, displayName: user.username };
    } else if (/^\/v1\/users\/[^/]+\/username-history/.test(p)) body = { data: [], nextPageCursor: null };
    else if (/^\/v1\/users\/[^/]+\/(status|canmanage|birthdate)$/.test(p)) body = { status: '', canManage: false, birthdate: '2020-01-01T00:00:00.000Z' };
    else body = {};
  } else if (sub === 'games') {
    if (p.indexOf('/v1/games/sorts') === 0) body = { sorts: [] };
    else if (p.indexOf('/v1/games/list') === 0) body = { games: [], nextPageCursor: null, previousPageCursor: null };
    else if (p.indexOf('/v2/games/') === 0 && p.indexOf('/media') !== -1) body = { data: [] };
    else if (p.indexOf('/games') !== -1) body = { data: [], nextPageCursor: null };
    else body = {};
  } else if (sub === 'catalog') {
    body = { data: [], nextPageCursor: null, previousPageCursor: null };
  } else if (sub === 'friends') {
    if (p.indexOf('/count') !== -1) body = { count: 0 };
    else body = { data: [], nextPageCursor: null };
  } else if (sub === 'presence') {
    body = { userPresences: [] };
  } else if (sub === 'inventory') {
    body = { data: [], nextPageCursor: null };
  } else if (sub === 'economy') {
    body = { robux: 0, tickets: 0 };
  } else if (sub === 'privatemessages') {
    body = { data: [], totalCollectionSize: 0 };
  } else if (sub === 'trades') {
    body = { data: [], nextPageCursor: null };
  } else if (sub === 'accountinformation') {
    // shapes taken from the repo's cached API responses (2022E cache.tar)
    if (/^\/v1\/users\/[^/]+\/roblox-badges/.test(p) || /^\/v1\/users\/[^/]+$/.test(p)) {
      body = [
        { id: 6, name: 'Homestead', description: 'The homestead badge is earned by having your personal place visited 100 times.', imageUrl: 'https://images.rbxcdn.com/b66bc601e2256546c5dd6188fce7a8d1.png' },
        { id: 18, name: 'Welcome To The Club', description: 'This badge is awarded to users who have ever belonged to the illustrious Builders Club.', imageUrl: 'https://images.rbxcdn.com/6c2a598114231066a386fa716ac099c4.png' },
        { id: 2, name: 'Friendship', description: 'This badge is given to members who have embraced the Roblox community and have made at least 20 friends.', imageUrl: 'https://images.rbxcdn.com/5eb20917cf530583e2641c0e1f7ba95e.png' },
        { id: 12, name: 'Veteran', description: 'This badge recognizes members who have visited Roblox for one year or more.', imageUrl: 'https://images.rbxcdn.com/b7e6cabb5a1600d813f5843f37181fa3.png' },
        { id: 7, name: 'Bricksmith', description: 'The Bricksmith badge is earned by having a popular personal place.', imageUrl: 'https://images.rbxcdn.com/49f3d30f5c16a1c25ea0f97ea8ef150e.png' },
      ];
    } else {
      body = { isAllowedNotificationsEndpointDisabled: true, isAccountSettingsPolicyEnabled: true, isPhoneNumberEnabled: false, MaxUserDescriptionLength: 1000, isUserDescriptionEnabled: true, isUserBlockEndpointsUpdated: false, isIDVerificationEnabled: true, isPasswordRequiredForAgingDown: true, homePageUpsellCardVariation: null };
    }
  } else if (sub === 'accountsettings') {
    // cached shapes, email scrubbed (no real user data)
    if (/\/email$/.test(p)) {
      body = { emailAddress: 'u******@gmail.com', verified: true, canBypassPasswordForEmailUpdate: false };
    } else {
      body = { appChatPrivacy: 'Friends' };
    }
  } else if (sub === 'groups' || sub === 'badges' || sub === 'thumbnails' || sub === 'chat' || sub === 'notifications' || sub === 'points') {
    body = {};
  }
  res.type('json').json(body);
});

/* catch-all for native form submissions: the rendered auth forms sometimes
 * submit straight to the page (no JS), which reloads it. If the body carries
 * username/password, treat it as login (or signup when birthday/gender are
 * present) and redirect to /home on success — same handlers as above. */
app.post('*', (req, res, next) => {
  const b = req.body || {};
  if (!(b.username || b.cvalue) || !b.password) return next();
  const isSignup = b.gender !== undefined || b.birthday !== undefined ||
    b.birthMonth !== undefined || b.birthDay !== undefined || b.passwordConfirm !== undefined;
  if (isSignup) return handleSignup(req, res, {});
  return handleLogin(req, res, {});
});

function authenticatedJson(req, res) {
  const user = currentUser(req);
  if (!user) return apiError(res, 401, 0, 'You are not logged in.');
  // same shape as the real users.roblox.com/v1/users/authenticated, so the
  // CDN nav bundle renders the account correctly
  res.json({
    description: '',
    created: '2020-01-01T00:00:00.000Z',
    isBanned: false,
    externalAppDisplayName: null,
    hasVerifiedBadge: true,
    isAdmin: isAdminUser(user),
    id: user.id,
    name: user.username,
    displayName: user.username,
  });
}
app.get('/apisite/users/v1/users/authenticated', authenticatedJson);
app.get('/v1/users/authenticated', authenticatedJson);   // bundle may hit this host-less path too

/* username validation used by the signup form while typing
 * (Roblox: GET auth.roblox.com/v1/usernames/validate?username=..&context=Signup) */
app.get('/v1/usernames/validate', (req, res) => {
  const username = String(req.query.username || '').trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return apiError(res, 400, 1, 'Username must be 3-20 characters (_ allowed).');
  }
  if (findByUsername(username)) return apiError(res, 400, 1, 'Username is already taken.');
  res.json({ code: 0, message: 'Username is valid' });
});

app.get('/home', (req, res, next) => {
  // home uses the cached home shell (served via PAGE_FILES, scrubbed at serve time)
  next();
});

/* ---- navigation aliases ---------------------------------------------
 * The saved pages link to https://www.roblox.com/<path>. A tiny script is
 * injected into every page that strips the roblox.com origin on click, so
 * buttons stay on this site; these aliases then map those paths to the
 * local pages that exist here.
 * -------------------------------------------------------------------- */
const ALIASES = {
  '/my/avatar': '/avatar',
  '/my/character': '/avatar',
  '/my/inventory': '/inventory',
  '/my/messages': '/messages',
  '/my/friends': '/friends',
  '/my/money': '/transactions',
  '/my/transactions': '/transactions',
  '/my/settings': '/settings',
  '/my/account': '/settings',
  '/account': '/settings',
  '/premium': '/subscription',
  '/premium/membership': '/subscription',
  '/upgrades': '/subscription',
  '/charts': '/games',
  '/discover': '/games',
  '/develop': '/games',
  '/create': '/games',
  '/marketplace': '/catalog',
  '/search': '/catalog',
  '/trades': '/trade',
  '/info/privacy': '/privacy',
  '/info/terms-of-service': '/tos',
  '/robux.aspx': '/robux',
  '/catalog.aspx': '/catalog',
  '/login/default.aspx': '/login',
  '/games.aspx': '/games',
  '/gamecards': '/giftcards',
  '/forgotpasswordOrUsername': '/forgot',
  '/about': '/help',
  '/blog': '/help',
  '/careers': '/help',
  '/parents': '/help',
};
Object.keys(ALIASES).forEach(from => app.get(from, (req, res) => res.redirect(ALIASES[from])));
app.get(/^\/admin\/$/, (req, res) => res.redirect('/admin'));
/* user routes: /users/:id and /users/:id/:tab (profile/friends/favorites/
 * inventory) all serve the profile page (per the cached user-format links
 * e.g. /users/88438775/profile, /users/88438775/friends#!/followers) */
app.get('/users/:id/:tab?', (req, res) => {
  const file = path.join(root, 'profile.html');
  if (!fs.existsSync(file)) return res.redirect('/profile');
  let html = fs.readFileSync(file, 'utf8');
  html = deWayback(html);
  html = patchSessionMarkup(html, currentUser(req));
  html = patchCachedShell(html, 'profile');
  if (/navigation-container|react-landing-container/.test(html)) {
    if (html.indexOf('</body>') !== -1) html = html.replace('</body>', PAGE_SCRIPTS + '</body>');
    else html = html + PAGE_SCRIPTS;
  }
  res.type('html').send(html);
});
app.get('/groups/:id/:name?', (req, res) => res.redirect('/groups'));
app.get('/games/:id/:name?', (req, res) => {
  // one default game: Baseplate by Roblox - serve the game-details shell
  // (scrubbed + patched to Baseplate by patchCachedShell)
  const file = path.join(root, 'gamedetails.html');
  if (!fs.existsSync(file)) return res.redirect('/games');
  let html = fs.readFileSync(file, 'utf8');
  html = deWayback(html);
  html = patchSessionMarkup(html, currentUser(req));
  html = patchCachedShell(html, 'gamedetails');
  if (/navigation-container|react-landing-container/.test(html)) {
    if (html.indexOf('</body>') !== -1) html = html.replace('</body>', PAGE_SCRIPTS + '</body>');
    else html = html + PAGE_SCRIPTS;
  }
  res.type('html').send(html);
});
app.get('/catalog/:id/:name?', (req, res) => res.redirect('/catalog'));
app.get('/messages/:tab', (req, res) => res.redirect('/messages'));

/* logout: clear the session and land back on the signup page */
app.get('/logout', (req, res) => {
  clearSession(req, res);
  res.redirect('/');
});

/* ---- html hosting: session-aware pages + injected scripts ----------------
 * The HTML files are never modified. At serve time only:
 *   1. the cached logged-in <meta name="user-data"> (the "awoken" account the
 *      pages were saved with) is removed for logged-out visitors, or rewritten
 *      to the real session user for logged-in ones, so the CDN nav renders the
 *      correct logged-in/logged-out state;
 *   2. the #wrap logged-in/logged-out class follows the session;
 *   3. three small scripts are injected before </body>:
 *      - NAV_FIX:      clicks on roblox.com links stay on this site
 *      - AUTH_REWRITE: the CDN bundles' fetch/XHR calls to *.roblox.com
 *                      (auth.roblox.com/v2/signup etc.) are rewritten to the
 *                      same paths on this origin, so signup/login can't fail
 *                      on CORS ("Sorry! An unknown error occurred.")
 *      - AUTH_STATE:   double-checks the session client-side and toggles the
 *                      logged-in/logged-out state of the existing markup.
 * ------------------------------------------------------------------------ */
const USER_META_RE = /<meta\s+name="user-data"[\s\S]*?\/?>/i;

/* The landing capture is served byte-for-byte, but it was saved through the
 * Wayback Machine. At serve time only, mechanically remove the Wayback
 * toolbar/machinery and un-rewrite its URLs to the direct CDN form the other
 * pages use — the Roblox page itself is untouched. */
function deWayback(html) {
  const headPieces = [
    '<script src="https://web-static.archive.org/_static/js/athena.js" type="text/javascript"></script>',
    "<script type=\"text/javascript\">window.addEventListener('DOMContentLoaded',function(){var v=archive_analytics.values;v.service='wb';v.server_name='wwwb-app220.us.archive.org';v.server_ms=314;archive_analytics.send_pageview({});});</script>",
    '<script type="text/javascript" src="https://web-static.archive.org/_static/js/bundle-playback.js?v=2N_sDSC0" charset="utf-8"></script>',
    '<script type="text/javascript" src="https://web-static.archive.org/_static/js/wombat.js?v=o9P2E1FK" charset="utf-8"></script>',
    '<script>window.RufflePlayer=window.RufflePlayer||{};window.RufflePlayer.config={"autoplay":"on","unmuteOverlay":"hidden","showSwfDownload":true};</script>',
    '<script type="text/javascript" src="https://web-static.archive.org/_static/js/ruffle/ruffle.js"></script>',
    '<link rel="stylesheet" type="text/css" href="https://web-static.archive.org/_static/css/banner-styles.css?v=1utQkbB3" />',
    '<link rel="stylesheet" type="text/css" href="https://web-static.archive.org/_static/css/iconochive.css?v=3PDvdIFv" />',
    '<!-- End Wayback Rewrite JS Include -->',
  ];
  headPieces.forEach(p => { html = html.split(p).join(''); });
  html = html.replace(/<script type="text\/javascript">\s*\n?\s*__wm\.init\([\s\S]*?<\/script>\n?/, '');
  const s = html.indexOf('<!-- BEGIN WAYBACK TOOLBAR INSERT -->');
  const e = html.indexOf('<!-- END WAYBACK TOOLBAR INSERT -->');
  if (s !== -1 && e !== -1) html = html.slice(0, s) + html.slice(e + '<!-- END WAYBACK TOOLBAR INSERT -->'.length);
  html = html.replace(/<\/html>[\s\S]*$/, '</html>');
  html = html.replace(/https:\/\/web\.archive\.org\/web\/20260601003122(?:js_|im_|cs_|if_|rs_)?\/(https?:\/\/|\/)/gi, '$1');
  html = html.replace(/\/\/web\.archive\.org\/web\/20260601003122(?:js_|im_|cs_|if_|rs_)?\/(https?:\/\/|\/)/gi, '$1');
  html = html.replace(/\/web\/20260601003122(?:js_|im_|cs_|if_|rs_)?\/(https?:\/\/[^"'\s>]+)/gi, '$1');
  return html;
}

function patchSessionMarkup(html, user) {
  // only the modern pages carry the CDN-rendered shell (landing uses
  // react-landing-container instead of navigation-container); the 2016-era
  // UnsecuredContent pages are left exactly as they are
  const isModern = /navigation-container|react-landing-container/.test(html);
  const userMeta = USER_META_RE.exec(html);
  if (user) {
    // rewrite the cached account to the real session user (same attributes),
    // or insert one if the page has none (the landing is a logged-out capture);
    // the user gets the verified checkmark (Bubba's verified.svg is shown by
    // the fallback; the meta flag keeps the modern UI in sync)
    if (userMeta) {
      html = html.replace(userMeta[0], (meta) =>
        meta
          .replace(/data-userid="[^"]*"/, `data-userid="${user.id}"`)
          .replace(/data-name="[^"]*"/, `data-name="${user.username}"`)
          .replace(/data-displayName="[^"]*"/, `data-displayName="${user.username}"`)
          .replace(/data-hasverifiedbadge="[^"]*"/, 'data-hasverifiedbadge="true"')
      );
    } else if (isModern) {
      const meta =
        '<meta name="user-data"\n' +
        `          data-userid="${user.id}"\n` +
        `          data-name="${user.username}"\n` +
        `          data-displayName="${user.username}"\n` +
        '          data-isunder13="false"\n' +
        '          data-created="01/01/2020 00:00:00"\n' +
        '          data-ispremiumuser="false"\n' +
        '          data-membership="none"\n' +
        '          data-hasverifiedbadge="true"/>\n';
      html = html.replace('</head>', meta + '</head>');
    }
    html = html.replace(/(class="[^"]*\b)logged-out\b/, '$1logged-in');
    html = html.replace(/\bid="wrap" class="([^"]*)"/, (m, cls) =>
      cls.includes('logged-in') ? m : m.replace('logged-out', 'logged-in')
    );
  } else {
    if (userMeta) html = html.replace(userMeta[0], '');
    html = html.replace(/\b(logged-in)\b/, 'logged-out');
  }
  // theme handling is per-page:
  //  - signup landing (Landing) and login (Login) keep their baked dark theme
  //    (that is their natural Roblox look: dark-theme, login also forced)
  //  - every other modern page: no forced theme - strip any baked
  //    dark/light/forced classes so they render in the default (light) theme;
  //    the Settings toggle is the only way to switch (opt-in, per user)
  if (isModern && !/data-internal-page-name="(Login|Landing)"/.test(html)) {
    html = html.replace(/(<body[^>]*class=")([^"]*)(")/, (m, pre, cls, post) => {
      const tokens = cls.split(/\s+/).filter(t => t && t !== 'dark-theme' && t !== 'light-theme' && t !== 'forced-theme');
      return pre + tokens.join(' ') + post;
    });
  }
  return html;
}

const NAV_FIX = [
  '<script>',
  '/* keep navigation on this site: strip the roblox.com origin from ANY',
  '   link/action. The CDN bundles render absolute https://www.roblox.com/...',
  '   links (nav, account area, footer) and may navigate programmatically, so',
  '   besides a click capture we also rewrite hrefs in place as the bundle',
  '   adds them (MutationObserver + periodic sweep). */',
  '(function () {',
  "  var RX = /^(?:https?:)?\\/\\/(?:(?:[a-z0-9-]+\\.)*roblox\\.com|localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)(?::\\d+)?(\\/[^#?]*)?/i;",
  "  function localHref(href) {",
  "    if (!href) return null;",
  "    var m = String(href).match(RX);",
  "    return m ? (m[1] || '/') : null;",
  "  }",
  "  function fixOne(el) {",
  "    if (!el || !el.getAttribute) return;",
  "    var h = el.getAttribute('href');",
  "    if (h) { var l = localHref(h); if (l) el.setAttribute('href', l); }",
  "  }",
  "  function sweep() {",
  "    var as = document.querySelectorAll('a[href]');",
  "    for (var i = 0; i < as.length; i++) fixOne(as[i]);",
  "    var fs = document.querySelectorAll('form[action]');",
  "    for (var j = 0; j < fs.length; j++) {",
  "      var a = fs[j].getAttribute('action');",
  "      var l = localHref(a);",
  "      if (l) fs[j].setAttribute('action', l);",
  "    }",
  "  }",
  "  sweep();",
  "  if (window.MutationObserver) {",
  "    var mo = new MutationObserver(function () { sweep(); });",
  "    mo.observe(document.documentElement, { childList: true, subtree: true });",
  "  }",
  "  setInterval(sweep, 1000);",
  "  document.addEventListener('click', function (e) {",
  "    var a = e.target && e.target.closest ? e.target.closest('a') : null;",
  "    if (!a) return;",
  "    var l = localHref(a.getAttribute('href'));",
  "    if (!l) return;",
  "    e.preventDefault();",
  "    e.stopPropagation();",
  "    window.location.href = l;",
  "  }, true);",
  "  var ow = window.open;",
  "  if (ow) window.open = function (url) {",
  "    var l = localHref(url);",
  "    if (l) { try { arguments[0] = l; } catch (err) { } }",
  "    return ow.apply(window, arguments);",
  "  };",
  "  if (window.HTMLAnchorElement && HTMLAnchorElement.prototype) {",
  "    var oc = HTMLAnchorElement.prototype.click;",
  "    HTMLAnchorElement.prototype.click = function () {",
  "      fixOne(this);",
  "      return oc.apply(this, arguments);",
  "    };",
  "  }",
  "  /* patch programmatic navigation: location.assign/replace and",
  "     form.submit() rewrite any bad-host target to the same relative path */",
  "  function rewriteUrl(u) { if (u == null) return u; var l = localHref(u); return l ? l : u; }",
  "  if (window.location) {",
  "    if (window.location.assign) { var oa = window.location.assign; window.location.assign = function (u) { return oa.call(window.location, rewriteUrl(u)); }; }",
  "    if (window.location.replace) { var orr = window.location.replace; window.location.replace = function (u) { return orr.call(window.location, rewriteUrl(u)); }; }",
  "  }",
  "  if (window.HTMLFormElement && HTMLFormElement.prototype.submit) {",
  "    var osb = HTMLFormElement.prototype.submit;",
  "    HTMLFormElement.prototype.submit = function () {",
  "      var a = this.getAttribute && this.getAttribute('action');",
  "      if (a) { var l = localHref(a); if (l) this.setAttribute('action', l); }",
  "      return osb.apply(this, arguments);",
  "    };",
  "  }",
  "  /* self-heal: if the page somehow loaded from an unreachable host,",
  "     jump to localhost on the same port/path */",
  "  if (location.hostname === '0.0.0.0' || location.hostname === '127.0.0.1') {",
  "    location.replace('http://localhost' + (location.port ? ':' + location.port : '') + location.pathname + location.search);",
  "  }",
  '})();',
  '</script>',
].join('\n');

const AUTH_REWRITE = [
  '<script>',
  '/* route the CDN bundle auth + data API calls to this origin so they',
  '   cannot fail on CORS:',
  '   - auth.roblox.com (v2/signup, v2/login, v2/logout,',
  '     v1/usernames/validate) and users.roblox.com/v1/users/authenticated',
  '     hit the real local handlers;',
  '   - the data APIs (games, catalog, friends, presence, inventory, economy,',
  '     privatemessages, trades, accountsettings, accountinformation) hit the',
  '     local /__api stubs so the pages render their shells/empty states.',
  '   Everything else is left untouched. */',
  '(function () {',
  "  var DATA_SUBS = ['games','catalog','friends','presence','inventory','economy','privatemessages','trades','accountsettings','accountinformation'];",
  "  function local(url) {",
  "    if (!url) return null;",
  "    var u = String(url);",
  "    var a = u.match(/^(?:https?:)?\\/\\/(?:[a-z0-9-]+\\.)*(?:auth|www)\\.roblox\\.com(\\/(?:v[12]\\/|account\\/)[^?#]*)([?#][\\s\\S]*)?$/i);",
  "    if (a) return (a[1] || '/') + (a[2] || '');",
  "    var n = u.match(/^(?:https?:)?\\/\\/(?:[a-z0-9-]+\\.)*users\\.roblox\\.com(\\/v1\\/users\\/authenticated)([?#][\\s\\S]*)?$/i);",
  "    if (n) return n[1] + (n[2] || '');",
  "    var d = u.match(/^(?:https?:)?\\/\\/([a-z0-9-]+)\\.roblox\\.com(\\/[^?#]*)([?#][\\s\\S]*)?$/i);",
  "    if (d && DATA_SUBS.indexOf(d[1].toLowerCase()) !== -1) return '/__api/' + d[1].toLowerCase() + (d[2] || '') + (d[3] || '');",
  "    return null;",
  "  }",
  "  var rf = window.fetch;",
  "  if (rf) window.fetch = function (input, init) {",
  "    var url = typeof input === 'string' ? input : (input && input.url) || '';",
  "    var l = local(url);",
  "    if (l) { try { input = new Request(l, init || input); } catch (err) { input = l; } }",
  "    return rf.call(this, input, init);",
  "  };",
  "  var ro = XMLHttpRequest.prototype.open;",
  "  XMLHttpRequest.prototype.open = function (method, url) {",
  "    var l = local(url);",
  "    if (l) { try { arguments[1] = l; } catch (err) { } }",
  "    return ro.apply(this, arguments);",
  "  };",
  '})();',
  '</script>',
].join('\n');

const AUTH_STATE = [
  '<script>',
  '/* reflect the real session on the existing page markup */',
  "(function () {",
  "  function setState(loggedIn) {",
  "    var wrap = document.getElementById('wrap');",
  "    if (wrap) { wrap.classList.remove(loggedIn ? 'logged-out' : 'logged-in'); wrap.classList.add(loggedIn ? 'logged-in' : 'logged-out'); }",
  "    if (!loggedIn) {",
  "      var ac = document.getElementById('navigation-account-switcher-container');",
  "      if (ac) ac.style.display = 'none';",
  "    } else if (location.pathname === '/' && document.getElementById('react-landing-container')) {",
  "      location.href = '/home';",
  "    }",
  "  }",
  "  fetch('/apisite/users/v1/users/authenticated').then(function (r) {",
  "    return r.json().then(function (d) { setState(!!(d && d.id)); });",
  "  }).catch(function () { });",
  '})();',
  '</script>',
].join('\n');

const THEME_TOGGLE = [
  '<script>',
  '/* dark/light theme: opt-in only. Nothing is applied unless the user has',
  '   explicitly chosen a theme in Settings (persists in localStorage). */',
  '(function () {',
  "  var KEY = 'bbl-theme';",
  "  function apply(t) {",
  "    var b = document.body;",
  "    if (!b) return;",
  "    b.classList.remove('dark-theme');",
  "    b.classList.remove('light-theme');",
  "    b.classList.add(t === 'light' ? 'light-theme' : 'dark-theme');",
  "    b.classList.add('forced-theme');",
  "    try { localStorage.setItem(KEY, t); } catch (e) { }",
  "  }",
  "  try { var saved = localStorage.getItem(KEY); if (saved !== null) apply(saved); } catch (e) { }",
  "  if (location.pathname === '/settings') {",
  "    var tries = 0;",
  "    var timer = setInterval(function () {",
  "      var host = document.getElementById('user-account') || document.getElementById('content');",
  "      tries++;",
  "      if (!host && tries < 40) return;",
  "      clearInterval(timer);",
  "      if (!host) return;",
  "      var dark = document.body.classList.contains('dark-theme');",
  "      var card = document.createElement('div');",
  "      card.id = 'bbl-theme-card';",
  "      card.style.cssText = 'margin:16px;padding:16px;border:1px solid ' + (dark ? '#3a3a3a' : '#ddd') + ';border-radius:8px;max-width:640px;background:' + (dark ? '#222' : '#fff') + ';color:' + (dark ? '#eee' : '#191919') + ';font-family:Source Sans Pro,Helvetica,Arial,sans-serif;';",
  "      card.innerHTML = '<div style=\"font-size:18px;font-weight:700;margin-bottom:10px\">Theme</div>' +",
  "        '<div style=\"display:flex;gap:8px\">' +",
  "        '<button data-t=\"dark\" style=\"padding:6px 18px;border-radius:4px;cursor:pointer;border:1px solid #666;background:#393939;color:#fff;font-size:14px\">Dark</button>' +",
  "        '<button data-t=\"light\" style=\"padding:6px 18px;border-radius:4px;cursor:pointer;border:1px solid #ccc;background:#fff;color:#191919;font-size:14px\">Light</button></div>';",
  "      card.querySelectorAll('button').forEach(function (btn) {",
  "        btn.addEventListener('click', function () {",
  "          apply(btn.getAttribute('data-t'));",
  "          card.style.background = btn.getAttribute('data-t') === 'light' ? '#fff' : '#222';",
  "          card.style.color = btn.getAttribute('data-t') === 'light' ? '#191919' : '#eee';",
  "        });",
  "      });",
  "      host.appendChild(card);",
  "    }, 250);",
  "  }",
  '})();',
  '</script>',
].join('\n');

const ADMIN_NAV = [
  '<script>',
  '/* add an Admin row to the account/settings dropdown in the nav -',
  '   only for admins (checked against the authenticated endpoint) */',
  '(function () {',
  "  function inject() {",
  "    if (window.__bblAdmin !== true) return;",
  "    var links = document.querySelectorAll('a[href]');",
  "    for (var i = 0; i < links.length; i++) {",
  "      var a = links[i];",
  "      var href = a.getAttribute('href') || '';",
  "      if (href.indexOf('/settings') === -1 && href.indexOf('/logout') === -1) continue;",
  "      var ul = a.closest ? a.closest('ul') : null;",
  "      if (!ul || ul.querySelector('a[data-bbl-admin]')) continue;",
  "      var li = document.createElement('li');",
  "      var na = document.createElement('a');",
  "      na.setAttribute('href', '/admin');",
  "      na.setAttribute('data-bbl-admin', '1');",
  "      na.textContent = 'Admin';",
  "      if (a.className) na.className = a.className;",
  "      li.appendChild(na);",
  "      var logoutItem = null;",
  "      var as = ul.querySelectorAll('a');",
  "      for (var j = 0; j < as.length; j++) {",
  "        if ((as[j].getAttribute('href') || '').indexOf('/logout') !== -1) { logoutItem = as[j].closest ? as[j].closest('li') : null; break; }",
  "      }",
  "      var anchorLi = a.closest ? a.closest('li') : null;",
  "      if (logoutItem) ul.insertBefore(li, logoutItem);",
  "      else if (anchorLi && anchorLi.nextSibling) ul.insertBefore(li, anchorLi.nextSibling);",
  "      else ul.appendChild(li);",
  "    }",
  "  }",
  "  inject();",
  "  if (window.MutationObserver) { var mo = new MutationObserver(function () { inject(); }); mo.observe(document.body, { childList: true, subtree: true }); }",
  "  setInterval(inject, 900);",
  "  fetch('/apisite/users/v1/users/authenticated').then(function (r) {",
  "    return r.json().then(function (d) { window.__bblAdmin = !!(d && d.isAdmin); inject(); });",
  "  }).catch(function () { });",
  '})();',
  '</script>',
].join('\n');

const PAGE_SCRIPTS = NAV_FIX + '\n' + AUTH_REWRITE + '\n' + AUTH_STATE + '\n' + THEME_TOGGLE + '\n' + ADMIN_NAV +
  '\n<script src="/fallback.js"></script>';

/* /home uses the cached home shell; /games uses the cached discover shell;
 * /groups uses the cached group shell (all scrubbed at serve time) */
const PAGE_FILES = { home: 'home.html', games: 'discover.html', groups: 'groupshell.html' };

/* ---- scrub the cached shells -------------------------------------------
 * The cached pages (home/discover/groups/gamedetails) were saved from a real
 * logged-in session and contain real cached data (user IAmBanFor / id
 * 2231932079, group 'ClassicView Studios', game 'BedWars' by Easy.gg, real
 * stats). At serve time we strip those so nothing from the cache leaks, and
 * for the game-details page we patch it to the one default game: Baseplate
 * by Roblox (verified). The HTML files on disk are untouched. */
function patchCachedShell(html, pageName) {
  // any cached user references anywhere in the shell
  html = html.replace(/IAmBanFor|ahahahaha|2231932079|88438775/g, '');

  if (pageName === 'groupshell') {
    html = html
      .replace(/<title>[^<]*<\/title>/i, '<title>Group - Roblox</title>')
      .replace(/<meta property="og:title"[^>]*>/i, '<meta property="og:title" content="Group" />')
      .replace(/<meta property="og:url"[^>]*>/i, '<meta property="og:url" content="https://www.roblox.com/groups" />')
      .replace(/<meta property="og:description"[^>]*>/i, '<meta property="og:description" content="A group on Roblox." />')
      .replace(/<meta name="description"[^>]*>/i, '<meta name="description" content="A group on Roblox." />')
      .replace(/ClassicView Studios|ClassicView-Studios|14319283|ClassicView/g, '');
  } else if (pageName === 'gamedetails') {
    // the one default game: Baseplate by Roblox (place id 1)
    html = html
      .replace(/<title>[^<]*<\/title>/i, '<title>Baseplate - Roblox</title>')
      .replace(/<meta property="og:title"[^>]*>/i, '<meta property="og:title" content="Baseplate" />')
      .replace(/<meta property="og:url"[^>]*>/i, '<meta property="og:url" content="https://www.roblox.com/games/1/Baseplate" />')
      .replace(/<meta property="og:description"[^>]*>/i, '<meta property="og:description" content="The classic baseplate. A blank canvas to build, play, and imagine with friends." />')
      .replace(/<meta name="description"[^>]*>/i, '<meta name="description" content="The classic baseplate. A blank canvas to build, play, and imagine with friends." />')
      .replace(/<link rel="canonical"[^>]*>/i, '<link rel="canonical" href="https://www.roblox.com/games/1/Baseplate" />')
      .replace(/data-place-id="[^"]*"/g, 'data-place-id="1"')
      .replace(/data-root-place-id="[^"]*"/g, 'data-root-place-id="1"')
      .replace(/data-universe-id="[^"]*"/g, 'data-universe-id="1"')
      .replace(/data-private-server-product-id="[^"]*"/g, 'data-private-server-product-id="0"')
      .replace(/data-seller-name="[^"]*"/g, 'data-seller-name="Roblox"')
      .replace(/data-seller-id="[^"]*"/g, 'data-seller-id="1"')
      .replace(/6872265039|2619619496|1239485700/g, '1')
      .replace(/BedWars &#127881; \[SEASON 4!\]|BedWars/g, 'Baseplate')
      .replace(/Easy\.gg|Easy Games/g, 'Roblox')
      .replace(/86,191|2,259,007|2\.8B\+/g, '0');
  } else if (pageName === 'profile') {
    // the cached profile (PoptartNoah / 88438775) is scrubbed of all its
    // cached user data; the session user's meta is inserted by
    // patchSessionMarkup, so visitors see their own profile.
    // IMPORTANT: this runs AFTER patchSessionMarkup, so we must not touch
    // the name="user-data" meta (its data-userid is the session user).
    // Protect it, scrub, then restore.
    const metaMatch = /<meta name="user-data"[\s\S]*?\/?>/.exec(html);
    const meta = metaMatch ? metaMatch[0] : '';
    if (meta) html = html.replace(meta, '<!--USERDATA-->');
    html = html
      .replace(/<title>[^<]*<\/title>/i, '<title>Profile - Roblox</title>')
      .replace(/PoptartNoah|PoptartNoahh|88438775|@PoptartNoahh/g, '')
      .replace(/Programmer, artist\.|https:\/\/devforum\.roblox\.com\/t\/665332/g, '')
      .replace(/ARES VR|Hellreaver Campaign|\(MOBILE\) Hellreaver Arena|Survival: Beginnings|7 Seas Of Sorrow|Rancor \(Legacy\)|BloxPT|Projection Rasterizer Demo|RooM/g, '')
      .replace(/[0-9]+%|<br>/g, '');
    if (meta) html = html.replace('<!--USERDATA-->', meta);
  }
  return html;
}

app.get(/^\/([a-z0-9-]*)$/i, (req, res, next) => {
  const name = req.params[0] || 'index';
  const file = path.join(root, PAGE_FILES[name] || (name + '.html'));
  if (!fs.existsSync(file)) return next();
  let html = fs.readFileSync(file, 'utf8');
  html = deWayback(html);
  html = patchSessionMarkup(html, currentUser(req));
  html = patchCachedShell(html, (PAGE_FILES[name] || (name + '.html')).replace(/\.html$/, ''));
  // inject the client scripts only into the modern pages (the 2016-era
  // UnsecuredContent pages are self-contained and left untouched)
  if (/navigation-container|react-landing-container/.test(html)) {
    if (html.indexOf('</body>') !== -1) html = html.replace('</body>', PAGE_SCRIPTS + '</body>');
    else html = html + PAGE_SCRIPTS;
  }
  res.type('html').send(html);
});

/* ---- admin API (used by the admin dashboard) ---- */
app.get('/admin-api/stats', (req, res) => {
  const user = currentUser(req);
  if (!user) return apiError(res, 401, 0, 'You are not logged in.');
  if (!isAdminUser(user)) return apiError(res, 403, 0, 'Admin only.');
  let totalUsers = 0;
  let totalSessions = 0;
  let recent = [];
  if (sqlite) {
    totalUsers = sqlite.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    totalSessions = sqlite.prepare('SELECT COUNT(*) AS c FROM sessions').get().c;
    recent = sqlite.prepare('SELECT id, username, gender, birthday FROM users ORDER BY id DESC LIMIT 8').all();
  } else {
    totalUsers = users.length;
    totalSessions = Object.keys(sessions).length;
    recent = users.slice(-8).reverse().map(u => ({ id: u.id, username: u.username, gender: u.gender, birthday: JSON.stringify(u.birthday) }));
  }
  res.json({ users: totalUsers, sessions: totalSessions, verified: totalUsers, recent });
});

/* ---- static hosting ---- */
app.use('/assets', express.static(path.join(root, 'assets')));
app.use('/admin-legacy', express.static(path.join(root, 'admin')));   // the old Svelte admin panel
app.use(express.static(root));

/* ---- listener: fall back to the next free port if 8080 is busy, and
 *     print the exact URLs to open (localhost for this device, LAN IP for
 *     other devices) so the wrong-address confusion can't happen ---- */
const os = require('os');
function lanUrl(port) {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const net of ifs[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return `http://${net.address}:${port}`;
    }
  }
  return null;
}
function start(port, attempts) {
  const server = app.listen(port, '0.0.0.0');
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempts > 0) {
      console.log(`port ${port} is busy - trying ${port + 1}`);
      start(port + 1, attempts - 1);
    } else {
      console.error('could not listen:', err.message);
      process.exit(1);
    }
  });
  server.on('listening', () => {
    const lan = lanUrl(port);
    console.log('');
    console.log('  =====================================================');
    console.log(`    Open in a browser on THIS device:  http://localhost:${port}`);
    if (lan) console.log(`    From another device (same Wi-Fi):   ${lan}`);
    console.log('    (do NOT use 0.0.0.0 - it never works from a browser)');
    console.log('  =====================================================');
    console.log('');
  });
}
start(Number(process.env.PORT) || 8080, 10);
