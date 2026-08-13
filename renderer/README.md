# Renderer (RCC thumbnail service) — Termux / Linux setup

This folder is the **orchestrator** that drives RCCService to render thumbnails
(avatar headshots, asset images, game icons). It was built for Windows; this
guide makes it run on **Termux (Android) / Linux** with a **native Linux RCC
2020** binary.

## How it works (from the code)

1. **`renderer/src/server.ts`** — Express API on `port` (3040) + a WebSocket
   on `thumbnailWebsocketPort` (3189).
   - The website connects to the WS with `?key=<authorization>` and sends
     commands (`GenerateThumbnailHeadshot`, `GenerateThumbnailAsset`, ...).
   - RCC uploads finished PNGs to `/api/upload-thumbnail-v1` (checked against
     the same `authorization`).
2. **`renderer/src/controllers/index.ts`** — `startRcc()` **spawns RCC itself**
   (`cp.spawn(path.join(rccPath, rccexe), ['-console','-verbose','-port', port],
   { cwd: rccPath, detached: true })`), then sends **SOAP `OpenJobEx`** XML to
   `http://127.0.0.1:<rccport>/`. The Lua script is injected into the SOAP
   body (from `renderer/scripts/*.lua`).
3. **`renderer/src/scripts.ts`** — replaces the Lua placeholders at runtime:
   - `local baseURL = "http://localhost"` → `conf.baseUrl`
   - `UPLOAD_URL_HERE` → `http://127.0.0.1:<conf.port>/api/upload-thumbnail-v1`
   - `AccessKey` → `conf.authorization`
4. RCC runs the script, renders the thumbnail, POSTs the PNG back with
   `{ accessKey, jobId }`; the renderer upscales with `sharp` and resolves the
   pending job.

## Prerequisites on Termux

```sh
pkg update && pkg upgrade
pkg install nodejs npm git
pkg install binutils file      # for the launcher's arch detection
pkg install box64              # only if your Linux RCC is x86_64
```

**Optional (needed for sharp):** sharp needs libvips. On Termux:
`pkg install vips` (or `libvips`) so the npm install can build/use it.

## Setup

1. **Get the repo** (if you haven't):

   ```sh
   cd ~
   git clone https://github.com/ratemyavatar/bubbablox-v2.git
   cd bubbablox-v2
   ```

2. **Put your Linux RCC 2020 binary in place**:

   ```sh
   cd RCCService2020
   # drop your Linux RCC binary here, named exactly:
   #   RCCService          (must be chmod +x)
   chmod +x RCCService run-rcc.sh
   ```

   The bundled `run-rcc.sh` wrapper auto-detects the arch:
   - aarch64 binary → runs natively
   - x86_64 binary → runs via `box64`

3. **Configure the renderer** (`renderer/config.json`):

   ```json
   {
     "rcc": "/data/data/com.termux/files/home/bubbablox-v2/RCCService2020",
     "rccexe": "run-rcc.sh",
     "authorization": "RendererAuthInTheAppSettingsConfigJsonFileTheyShouldMatch",
     "baseUrl": "http://localhost:8080",
     "rccPort": 64989,
     "port": 3040,
     "websiteBotAuth": "TheBotAuthInTheAppSettingsConfigJson",
     "thumbnailWebsocketPort": 3189,
     "webhook": ""
   }
   ```

   > `authorization` must match **RCCService2020/AppSettings.xml** (`BaseUrl`
   > should point at your site; the renderer's `baseUrl` must match too, since
   > RCC fetches avatars/assets from `<baseUrl>/Asset/?id=`).

4. **Install + build the renderer** (on the phone — this sandbox can't reach
   npm reliably, but Termux can):

   ```sh
   cd renderer
   npm install
   npm run build        # -> dist/
   ```

5. **Start the renderer**:

   ```sh
   npm start            # runs: node ./dist/index.js
   ```

   It will spawn RCC on demand via `run-rcc.sh`. Watch the console:
   - `express listening on port 3040`
   - `ws server listening on port 3189`
   - when a job comes in: `found port for rcc`, `waiting for rcc...`,
     `RCC ok`, then the thumbnail upload logs.

6. **Point your site at it** — the C# `Roblox.Website` connects to the renderer
   via `appsettings.example.json`:

   ```json
   "Render": {
     "BaseUrl": "ws://localhost:3189",
     "Authorization": "RendererAuthInTheRendererConfigJsonFile"
   }
   ```

   (those two values must match your `renderer/config.json`
   `thumbnailWebsocketPort` and `authorization`).

## Testing RCC standalone (before wiring the site)

RCC itself listens on an HTTP port and accepts SOAP jobs. The renderer handles
all of that, so the simplest test is: start the renderer, then hit it:

```sh
# from another terminal, ask it to render a headshot for user 1:
curl -s http://localhost:3040/api/ping   # -> true
```

To trigger a real render you need the website (or a WS client) to send a
`GenerateThumbnailHeadshot` command — the C# backend does that. If you only
want to verify RCC boots:

```sh
cd RCCService2020
./run-rcc.sh -console -verbose -port 64989
# you should see RCC's startup logs and it should stay running
```

## Known caveats

- **VMProtect** — the repo's 2020 build ships `VMProtectSDK32.dll` (Windows).
  A *native Linux* RCC shouldn't have it. If your Linux binary is VMProtect-
  wrapped, box64 may crash on it — prefer the 2018 build for reliability.
- **OpenGL** — RCC renders via its bundled software GL (OSMesa). Under
  box64/Android this is slow; expect minutes per thumbnail on a phone.
- **Assets** — RCC loads avatars from `<baseUrl>/Asset/?id=...`; your site
  must serve that endpoint (the C# `Roblox.Website` asset route does).
- **Memory** — RCC jobs are memory-hungry; ensure zram/swap is enabled on the
  phone (`pkg install zram` or kernel zram), or renders will OOM.
