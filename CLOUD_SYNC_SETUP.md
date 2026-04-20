# Cloud Sync Setup

This project now supports one shared hosted API so your desktop app and Android app can use the same bankroll data.

## What Changed

- `server.js` is now deploy-ready for Railway or another Node host.
- The API supports:
  - full bet fields used by Android, including `startTime` and `parlayLegs`
  - optional bearer-token protection with `BANKROLL_API_TOKEN`
  - CORS for desktop-browser and Android WebView access
- The desktop app now has:
  - a `Start Time` field in bet entry
  - `Sync API URL` and `Access Token` settings in the Data panel
- The Android app now has:
  - internet permission
  - `Sync API URL` and `Access Token` settings under Entry > Data Tools
  - cloud-first sync with fallback to cached on-device data

## Best Setup

Use one hosted copy of this app as the source of truth.

- Android app: points to the hosted API
- Desktop local app: points to the hosted API
- Optional simpler desktop flow: just open the hosted app URL in your browser and use that as the desktop version

## Railway Deploy

### 1. Put this folder on GitHub

Create a GitHub repo and push the contents of `C:\Users\Tyler\Desktop\Bankroll Log`.

### 2. Create a Railway project

In Railway:

1. Create a new project.
2. Choose `Deploy from GitHub repo`.
3. Select your Bankroll Log repository.

Railway should detect this as a Node app automatically because this repo includes `package.json`.

### 3. Add your environment variable

In the Railway service Variables tab, add:

- `BANKROLL_API_TOKEN`

Use a long random value, for example:

```text
bankroll-sync-5f7c9f2d3a4b1c8e7d6f0a9b2c4e1f6
```

You do not need to add `PORT` manually for normal Railway deploys. Railway injects it.

### 4. Set the healthcheck path

In the Railway service settings, set the healthcheck path to:

```text
/api/health
```

### 5. Get your public URL

After deploy finishes, Railway gives you a public HTTPS domain like:

```text
https://bankroll-log-production.up.railway.app
```

Use the base URL only. Do not add `/api/state`.

## Desktop Setup

You have two ways to use desktop after deploy.

### Option A: easiest

Open the hosted Railway URL directly in your browser and use that as your desktop app.

### Option B: keep your local desktop app

1. Start the local desktop app:

```powershell
cd "C:\Users\Tyler\Desktop\Bankroll Log"
npm start
```

2. Open the local app in your browser.
3. In the Data panel:
   - paste your Railway base URL into `Sync API URL`
   - paste your token into `Access Token`
4. Click `Save Sync Settings`

From then on, the local desktop app will read and write the hosted API instead of staying local-only.

## Android Setup

1. Open the installed Android app.
2. Go to `Entry`.
3. Open `Data Tools`.
4. Enter:
   - `Sync API URL`: your Railway base URL
   - `Access Token`: the same `BANKROLL_API_TOKEN`
5. Tap `Save Sync Settings`

After that, updates from the phone go to the hosted API, and the desktop app will see the same data.

## How Sync Works

- If `Sync API URL` is empty:
  - desktop uses its local server storage
  - Android uses on-device storage
- If `Sync API URL` is set:
  - the app uses the hosted `/api/state`
  - the token is sent as `Authorization: Bearer <token>`
- If cloud sync is temporarily unavailable:
  - the app falls back to its last cached data on that device

## Important Notes

- Use the same URL and token on desktop and Android.
- Always use the base domain, for example:
  - `https://bankroll-log-production.up.railway.app`
- Do not use:
  - `https://bankroll-log-production.up.railway.app/api/state`
- Keep the token private.
- HTTPS is strongly recommended. Railway provides HTTPS by default on public domains.

## Quick Test

After setup:

1. Add a bet on Android.
2. Open the desktop app.
3. Click `Sync Now` if needed.
4. The same bet should appear there.

Then test the reverse:

1. Edit or add a bet on desktop.
2. Open the Android app.
3. Tap `Sync Now`.
4. The updated data should appear on the phone.
