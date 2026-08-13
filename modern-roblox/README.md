# Modern Roblox Copy

An accurate copy of the saved modern Roblox pages, assembled **only from files
already in this repo** — every page is a byte-for-byte copy of an existing HTML
(none are edited). The auth flow is functional and implements **only contracts
that already exist in the repo's own code/htmls** (no new API design).

## Pages

| Route | File | Source in repo |
|---|---|---|
| `/` (landing = signup) | `index.html` | `boblox - signup.html` (Wayback capture of `https://www.roblox.com/`, 2026-06-01), edited: Wayback toolbar/scripts removed, its asset URLs un-rewritten to the direct `js.rbxcdn.com`/`css.rbxcdn.com` form the other captures use, and an auth submit-interceptor appended (details below). Pristine copy: `boblox - signup.html` at the repo root |
| `/signup` | → redirects to `/` | |
| `/legacy` | `legacy.html` | `api/public/Data/index.html` (the original BubbaBlox landing, kept aside) |
| `/avatar` | `avatar.html` | `Avatar - Roblox.html` |
| `/robux` | `robux.html` | `Buy Robux.html` |
| `/catalog` | `catalog.html` | `Catalog.html` |
| `/friends` | `friends.html` | `Friends - Roblox.html` |
| `/help` | `help.html` | `Help & Safety - Roblox.html` |
| `/inventory` | `inventory.html` | `Inventory - Roblox.html` |
| `/login` | `login.html` | `Log in to Roblox.html` |
| `/transactions` | `transactions.html` | `My Transactions - Roblox.html` |
| `/redeem` | `redeem.html` | `Redeem Roblox Gift Cards and Codes.html` |
| `/messages` | `messages.html` | `Roblox - messages.html` |
| `/giftcards` | `giftcards.html` | `Roblox Gift Cards.html` |
| `/subscription` | `subscription.html` | `Roblox Subscription.html` |
| `/settings` | `settings.html` | `Settings - Roblox.html` |
| `/games` | `games.html` | `Top Roblox Games.html` |
| `/trade` | `trade.html` | `Trade - Roblox.html` |
| `/profile` | `profile.html` | `profile - Roblox.html` |
| `/groups` | `groups.html` | `groups- Roblox.html` |
| `/2fa` | `2fa.html` | `api/public/Data/2FA.html` |
| `/loggedout` | `loggedout.html` | `api/public/Data/loggedout.html` |
| `/404`, `/privacy`, `/tos`, `/badges`, `/buildersclub`, `/forgot`, `/robux-info` | … | `api/public/UnsecuredContent/*.html` |
| `/admin` | `admin/` | `admin/public/` (admin panel) |
| `/assets` | `assets/` | `api/public/{css,fonts,images,img}` |

## Functional auth (contracts reused from the repo)

The landing is the real modern Roblox signup page: its shell renders from the
same CDN bundles as the other captures. Everything below is applied at serve
time in `server.js` — no HTML file on disk is modified.

- **Wayback un-rewrite** — the landing capture loaded everything through
  `web.archive.org`; at serve time its URLs are mechanically rewritten to the
  direct `js.rbxcdn.com` / `css.rbxcdn.com` form the other 17 captures use
  (no wayback dependency, no toolbar).
- **Auth reroute** — the CDN bundles submit the signup/login forms with
  `fetch`/`XMLHttpRequest` to `auth.roblox.com` or `www.roblox.com`
  (cross-origin → the browser blocks it and the form shows "Sorry! An
  unknown error occurred."). A small script rewrites those calls to the same
  paths on this site (`/v2/signup`, `/v2/login`, `/v2/logout`,
  `/v1/usernames/validate`, `/account/*`), the nav's
  `users.roblox.com/v1/users/authenticated` check, and the data APIs the
  pages' content needs (games/catalog/friends/presence/inventory/economy/
  privatemessages/trades/accountsettings/accountinformation) to this site.
  Auth calls hit the real handlers; data calls hit `/__api/*` stubs that
  return the empty-but-valid shapes from `2016-roblox-main/services/*.js`, so
  the pages render their shells and empty states instead of failing. Auth
  requests are logged to the server console for visibility.

- **Theme** — the signup landing (`/`) and login (`/login`) keep their
  natural baked dark theme (that is how Roblox renders them). Every other
  modern page has no forced theme: any baked `dark-theme`/`forced-theme`
  body class is stripped at serve time so they render in the default (light)
  Roblox theme. The Settings page still has a dark/light toggle, but it is
  **opt-in**: nothing is applied until the user explicitly picks a theme
  (persists in localStorage).
- **Admin** — the account/settings dropdown in the nav gets an **Admin** row
  (injected, matching the dropdown item styling) that opens `/admin` — a
  simple dashboard following the main-site theme (blue `#0074BD` header,
  white cards): Total Users / Active Sessions / Verified Users stat cards
  plus a Recent Users table, fed by `GET /admin-api/stats` (requires login;
  reads the SQLite store). The old Svelte admin panel moved to `/admin-legacy`.
- **Cached shells (from the repo's committed caches)** — `/home`, `/games`
  and `/groups` now use the real cached Roblox shells (`home`, `discover`,
  group), and `/games/:id/:name` serves a real **game-details** page showing
  the one default game: **Baseplate by Roblox** (verified check next to the
  name). All cached data is scrubbed at serve time — the logged-in user
  (`IAmBanFor`/id `2231932079`), the group name (`ClassicView Studios`) and
  the game (`BedWars` by `Easy.gg`, real stats) never appear; game ids are
  rewritten to 1818, the seller to Roblox. The `2022E cache.tar` API shapes
  are implemented too: `/__api/accountinformation/v1` (settings metadata),
  `/__api/accountinformation/v1/users/:id/roblox-badges` (real badge set),
  `/__api/accountsettings/v1` (app chat privacy) and `/email` (scrubbed).
- **Content fallback** — the pages' content areas are rendered at runtime by
  the CDN bundles, which need Roblox's data APIs (blocked cross-origin), so
  some pages stayed empty or stuck on "Loading...". `fallback.js` (injected
  only into the modern pages) fills that *specific part* using the repo's own
  BubbaBlox pages/components, **keeping Bubba's original design** — light
  `#e3e3e3` background, white flat cards with the `0 1px 4px` shadow,
  `#343434` headings, `#0055b3` links, `#00a2ff` tab underline, Source Sans
  Pro — so it sits coherently under the modern navbar. Currently covers the
  avatar editor (preview/tabs/body colors/scaling), **My Settings** (Bubba's
  Account Info / Security / Privacy tabs), catalog, robux, premium, redeem,
  help, games rows, and empty states for friends/messages/inventory/trade/
  transactions. The modern Roblox shell is untouched, and if the bundle ever
  renders real content the fallback leaves it alone. (`/home` redirects to
  `/games`; `/profile` serves the modern page as captured.)
- **Endpoint mapping** — `/home` now serves the games page (where signup/
  login land, with the home greeting fallback); added redirects for
  `/develop`, `/create`, `/catalog/:id`, `/users/:id`, `/messages/:tab`,
  `/my/account`, `/upgrades`, `/gamecards`, `/about`, `/blog`, `/logout`
  (clears the session), etc.
- **Verified checkmark** — the logged-in user is verified: the `user-data`
  meta is set to `data-hasverifiedbadge="true"` and both auth endpoints
  (`/apisite/users/v1/users/authenticated` and `/__api/users/...`) return
  `hasVerifiedBadge: true`, so the modern Roblox UI itself shows the blue
  check next to the username in the nav. The badge asset
  (`/verified.svg`, from `2016-roblox-main/public/verified.svg`) is served.
  No HTML file is modified.
- **Navigation fix** — the pages' buttons link to `https://www.roblox.com/…`.
  A tiny script injected into every served page strips the roblox.com origin
  on click (so nothing leaves this site), and the server maps those paths to
  the local pages (`/my/avatar` → `/avatar`, `/charts` → `/games`,
  `/users/:id/profile` → `/profile`, …).
- **Session-aware pages** — the cached logged-in `<meta name="user-data">`
  (the saved "awoken"/"jubihat" account) is removed for logged-out visitors
  and rewritten to the real session user (or inserted, for pages captured
  logged-out like the landing) when logged in; the `#wrap` logged-in/
  logged-out class follows the session, and the dark-theme classes are forced
  on the modern pages (those carrying `navigation-container` /
  `react-landing-container`) so they all match the signup/login dark look.
  The 2016-era UnsecuredContent pages are served untouched, with no scripts
  injected.
- **Native submits** — if a rendered form submits straight to the page
  (plain page reload), the server's catch-all POST processes `username`/
  `password` bodies as login (or signup when birthday/gender are present) and
  redirects to `/home` on success; failures go back to the page it came from
  with the error param. Logged-in users hitting `/` or `/login` are sent to
  `/home` (like the real site).

| Endpoint | Contract source | Behavior |
|---|---|---|
| `POST /login/signup` (also `/signup`, `/v1|v2/signup`) | `data-signup-api-url="/login/signup"` + form fields in `api/public/Data/index.html` | Validates per the html's own rules (username 3–20, `_` allowed; password ≥ 8; birthday; gender), creates account, sets `.ROBLOSECURITY` cookie, redirects to `/home`. Accepts the repo form's names (`birthdayMonth`…), the modern form's (`birthMonth`…), and the modern API's (`gender:"Male"`, ISO `birthday`) |
| `POST /login` (also `/v1|v2/login`) | `2016-roblox-main/services/auth.js` + legacy navbar form (`action="/login"`) | Checks credentials, sets cookie, redirects to `/home`; accepts `{ctype, cvalue, password}` too |
| `POST /login/2fa` | `<form action="/login/2fa">` in `2fa.html` | 6-digit `Code`; failure redirects to `/2fa?err=…` (2FA.html displays it itself) |
| `GET /apisite/users/v1/users/authenticated` (also `/v1/users/authenticated`) | `services/users.js` + legacy landing inline JS | `{id, name}` or `401 {errors:[{code,message}]}` |
| `POST /apisite/auth/v2/logout` (also `/v2/logout`) | `services/auth.js` | Clears session |
| `GET /v1/usernames/validate` | real API (`auth.roblox.com/v1/usernames/validate`) | `{code:0,message:"Username is valid"}` or `400 {errors:[…]}` |
| `GET /home` | modern nav logo target | Redirects to `/games` |
| cookie `.ROBLOSECURITY`, `x-csrf-token` header, `{errors:[…]}` shape | legacy landing inline JS, `lib/request.js` | as the repo expects |

Error strings/flows are the repo's own: signup/login failures redirect back to
the page the request came from with `?signupmsg=…` / `?loginmsg=…` (the legacy
page displays them in `#signuperror-message` / `#login-error-message`); 2FA
failures use `?err=`, which `2fa.html` displays itself.

## Run

```sh
npm install   # express (the dependency the repo's api/package.json already declares)
npm start     # http://localhost:8080
```

## Storage (SQLite)

Accounts and sessions are stored in **SQLite** via Node's built-in
`node:sqlite` module (`DatabaseSync`) — no native modules, no compilation,
works out of the box on Node ≥ 22.5, including Termux/Android.

- Database file: `roblox.db` (created at runtime, gitignored).
- Tables: `users` (id, username unique, password, gender, birthday) and
  `sessions` (token, userId, created).
- Passwords are stored as scrypt hashes (node:crypto, no native modules);
  plaintext rows from earlier versions still verify via fallback.
- Data survives server restarts (verified: sessions stay valid across
  restarts).
- **Fallback:** on Node versions without `node:sqlite` (< 22.5), the server
  automatically falls back to the previous JSON file store
  (`users.json` / `sessions.json`, also gitignored).

## Run locally (Termux / Android)

1. Install Node + npm + git in Termux (Node ≥ 22.5 has SQLite built in;
   Termux's `nodejs` package is fine):

   ```sh
   pkg update && pkg upgrade
   pkg install nodejs npm git
   ```

2. Clone just this folder. The repo is large (lots of binaries), so use a
   **sparse, partial clone** that pulls only `modern-roblox/`:

   ```sh
   cd ~
   git clone --depth 1 --filter=blob:none --sparse \
       -b arena/019ffbe6-bubbablox-v2 \
       https://github.com/ratemyavatar/bubbablox-v2.git
   cd bubbablox-v2
   git sparse-checkout set modern-roblox
   cd modern-roblox
   ```

   (A full `git clone` of the repo also works — it's just ~435 MB because of
   the RCCService binaries.)

3. Install and start (express is pure JavaScript — nothing compiles on
   Android):

   ```sh
   npm install
   npm start
   ```

4. Open a browser on the phone: `http://localhost:8080` (or
   `termux-open-url http://localhost:8080`).

   **Use exactly the URL the server prints on startup.** The server binds
   `0.0.0.0` but that address is NOT usable from a browser (on Android it
   shows "This site can't be reached / 0.0.0.0 refused to connect"). Always
   open `http://localhost:8080` (this device) or the printed LAN URL (other
   devices). If port 8080 is busy the server automatically falls back to the
   next free port and prints it. A request whose Host is `0.0.0.0`/`127.0.0.1`
   is auto-redirected to `localhost`, and the injected page script self-heals
   if the page is ever served from an unreachable host.

That's it — the landing page, signup/login, the 17 modern pages, the admin
panel, and SQLite storage all run from the one `node server.js` process.
If you're on the same Wi-Fi, other devices can reach it at
`http://<phone-ip>:8080` too.

> Prefer a zip/tarball instead? The site also serves a self-contained
> `modern-roblox.tar.gz` (gitignored) from the live preview at
> `https://8080-iut71428z1ufku4y5ayuf.e2b.app/modern-roblox.tar.gz`.

## Notes / honest caveats

- **No HTML file is ever modified.** Every page (including the landing) is
  served byte-for-byte from disk; all behavior is applied at serve time in
  `server.js`:
  - *deWayback* — the landing capture's Wayback toolbar/machinery is removed
    and its URLs un-rewritten to direct CDN (mechanical, no design change).
  - *patchSessionMarkup* — the cached logged-in `<meta name="user-data">`
    (the saved "awoken"/"jubihat" account) is removed for logged-out
    visitors and rewritten to the real session user when logged in; the
    `#wrap` logged-in/logged-out class follows the session.
  - *injected scripts* — clicks on `roblox.com` links stay on this site;
    the CDN bundles' `fetch`/`XMLHttpRequest` calls to `auth.roblox.com`
    (`/v2/signup`, `/v2/login`, `/v2/logout`, `/v1/usernames/validate`)
    are rerouted to the same paths on this origin, so signup can't fail on
    CORS ("Sorry! An unknown error occurred.").
- The modern pages load their CSS/JS from the CDN (as captured), so the
  viewing browser needs internet — same as the originals.
- The pristine, unedited capture remains at the repo root:
  `boblox - signup.html`.

## Where the rest of the backend lives (repo folders)

- **`api/`** – Express API app (`src/` not present in this checkout; its
  `public/` static content is what this site serves).
- **`Roblox/`** – C# backend (`Roblox.Website` controllers/pages).
- **`admin/`** – admin panel. **`renderer/`** – thumbnail renderer.
- **`2016-roblox-main/`** – the older (2016-styled) frontend; its `services/`
  folder defines the API contract this server implements.
| Endpoint | Contract source | Behavior |
|---|---|---|
| `POST /login/signup` (also `/signup`, `/v1|v2/signup`) | `data-signup-api-url="/login/signup"` + form fields in `api/public/Data/index.html` | Validates per the html's own rules (username 3–20, `_` allowed; password ≥ 8; birthday; gender), creates account, sets `.ROBLOSECURITY` cookie, redirects to `/home`. Accepts the repo form's names (`birthdayMonth`…), the modern form's (`birthMonth`…), and the modern API's (`gender:"Male"`, ISO `birthday`) |
| `POST /login` (also `/v1|v2/login`) | `2016-roblox-main/services/auth.js` + legacy navbar form (`action="/login"`) | Checks credentials, sets cookie, redirects to `/home`; accepts `{ctype, cvalue, password}` too |
| `POST /login/2fa` | `<form action="/login/2fa">` in `2fa.html` | 6-digit `Code`; failure redirects to `/2fa?err=…` (2FA.html displays it itself) |
| `GET /apisite/users/v1/users/authenticated` (also `/v1/users/authenticated`) | `services/users.js` + legacy landing inline JS | `{id, name}` or `401 {errors:[{code,message}]}` |
| `POST /apisite/auth/v2/logout` (also `/v2/logout`) | `services/auth.js` | Clears session |
| `GET /v1/usernames/validate` | real API (`auth.roblox.com/v1/usernames/validate`) | `{code:0,message:"Username is valid"}` or `400 {errors:[…]}` |
| `GET /home` | modern nav logo target | Redirects to `/games` |
| cookie `.ROBLOSECURITY`, `x-csrf-token` header, `{errors:[…]}` shape | legacy landing inline JS, `lib/request.js` | as the repo expects |

Error strings/flows are the repo's own: signup/login failures redirect back to
the page the request came from with `?signupmsg=…` / `?loginmsg=…` (the legacy
page displays them in `#signuperror-message` / `#login-error-message`); 2FA
failures use `?err=`, which `2fa.html` displays itself.

## Run

```sh
npm install   # express (the dependency the repo's api/package.json already declares)
npm start     # http://localhost:8080
```

## Storage (SQLite)

Accounts and sessions are stored in **SQLite** via Node's built-in
`node:sqlite` module (`DatabaseSync`) — no native modules, no compilation,
works out of the box on Node ≥ 22.5, including Termux/Android.

- Database file: `roblox.db` (created at runtime, gitignored).
- Tables: `users` (id, username unique, password, gender, birthday) and
  `sessions` (token, userId, created).
- Passwords are stored as scrypt hashes (node:crypto, no native modules);
  plaintext rows from earlier versions still verify via fallback.
- Data survives server restarts (verified: sessions stay valid across
  restarts).
- **Fallback:** on Node versions without `node:sqlite` (< 22.5), the server
  automatically falls back to the previous JSON file store
  (`users.json` / `sessions.json`, also gitignored).

## Run locally (Termux / Android)

1. Install Node + npm + git in Termux (Node ≥ 22.5 has SQLite built in;
   Termux's `nodejs` package is fine):

   ```sh
   pkg update && pkg upgrade
   pkg install nodejs npm git
   ```

2. Clone just this folder. The repo is large (lots of binaries), so use a
   **sparse, partial clone** that pulls only `modern-roblox/`:

   ```sh
   cd ~
   git clone --depth 1 --filter=blob:none --sparse \
       -b arena/019ffbe6-bubbablox-v2 \
       https://github.com/ratemyavatar/bubbablox-v2.git
   cd bubbablox-v2
   git sparse-checkout set modern-roblox
   cd modern-roblox
   ```

   (A full `git clone` of the repo also works — it's just ~435 MB because of
   the RCCService binaries.)

3. Install and start (express is pure JavaScript — nothing compiles on
   Android):

   ```sh
   npm install
   npm start
   ```

4. Open a browser on the phone: `http://localhost:8080` (or
   `termux-open-url http://localhost:8080`).

   **Use exactly the URL the server prints on startup.** The server binds
   `0.0.0.0` but that address is NOT usable from a browser (on Android it
   shows "This site can't be reached / 0.0.0.0 refused to connect"). Always
   open `http://localhost:8080` (this device) or the printed LAN URL (other
   devices). If port 8080 is busy the server automatically falls back to the
   next free port and prints it. A request whose Host is `0.0.0.0`/`127.0.0.1`
   is auto-redirected to `localhost`, and the injected page script self-heals
   if the page is ever served from an unreachable host.

That's it — the landing page, signup/login, the 17 modern pages, the admin
panel, and SQLite storage all run from the one `node server.js` process.
If you're on the same Wi-Fi, other devices can reach it at
`http://<phone-ip>:8080` too.

> Prefer a zip/tarball instead? The site also serves a self-contained
> `modern-roblox.tar.gz` (gitignored) from the live preview at
> `https://8080-iut71428z1ufku4y5ayuf.e2b.app/modern-roblox.tar.gz`.

## Notes / honest caveats

- **No HTML file is ever modified.** Every page (including the landing) is
  served byte-for-byte from disk; all behavior is applied at serve time in
  `server.js`:
  - *deWayback* — the landing capture's Wayback toolbar/machinery is removed
    and its URLs un-rewritten to direct CDN (mechanical, no design change).
  - *patchSessionMarkup* — the cached logged-in `<meta name="user-data">`
    (the saved "awoken"/"jubihat" account) is removed for logged-out
    visitors and rewritten to the real session user when logged in; the
    `#wrap` logged-in/logged-out class follows the session.
  - *injected scripts* — clicks on `roblox.com` links stay on this site;
    the CDN bundles' `fetch`/`XMLHttpRequest` calls to `auth.roblox.com`
    (`/v2/signup`, `/v2/login`, `/v2/logout`, `/v1/usernames/validate`)
    are rerouted to the same paths on this origin, so signup can't fail on
    CORS ("Sorry! An unknown error occurred.").
- The modern pages load their CSS/JS from the CDN (as captured), so the
  viewing browser needs internet — same as the originals.
- The pristine, unedited capture remains at the repo root:
  `boblox - signup.html`.

## Where the rest of the backend lives (repo folders)

- **`api/`** – Express API app (`src/` not present in this checkout; its
  `public/` static content is what this site serves).
- **`Roblox/`** – C# backend (`Roblox.Website` controllers/pages).
- **`admin/`** – admin panel. **`renderer/`** – thumbnail renderer.
- **`2016-roblox-main/`** – the older (2016-styled) frontend; its `services/`
  folder defines the API contract this server implements.
