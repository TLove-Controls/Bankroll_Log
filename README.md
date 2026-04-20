# Bankroll Log

Bankroll Log is a bankroll tracker with:

- a desktop web app
- a hosted cloud-sync option
- an Android app in `android-app`

This README is the main reference for how to run it, sync it, and recover the setup later if you forget the steps.

## Project Folders

- Desktop app: `C:\Users\Tyler\Desktop\Bankroll Log`
- Android app project: `C:\Users\Tyler\Desktop\Bankroll Log\android-app`

## Main Files

- Desktop server: [server.js](C:/Users/Tyler/Desktop/Bankroll%20Log/server.js)
- Desktop UI: [index.html](C:/Users/Tyler/Desktop/Bankroll%20Log/index.html)
- Desktop logic: [app.js](C:/Users/Tyler/Desktop/Bankroll%20Log/app.js)
- Desktop styles: [styles.css](C:/Users/Tyler/Desktop/Bankroll%20Log/styles.css)
- Android WebView activity: [MainActivity.kt](C:/Users/Tyler/Desktop/Bankroll%20Log/android-app/app/src/main/java/com/tyler/bankrolllog/MainActivity.kt)
- Android UI assets:
  - [android-app/app/src/main/assets/index.html](C:/Users/Tyler/Desktop/Bankroll%20Log/android-app/app/src/main/assets/index.html)
  - [android-app/app/src/main/assets/app.js](C:/Users/Tyler/Desktop/Bankroll%20Log/android-app/app/src/main/assets/app.js)
  - [android-app/app/src/main/assets/styles.css](C:/Users/Tyler/Desktop/Bankroll%20Log/android-app/app/src/main/assets/styles.css)

## Run The Desktop App

Open PowerShell and run:

```powershell
cd "C:\Users\Tyler\Desktop\Bankroll Log"
npm start
```

When you see:

```text
Bankroll Log running on 0.0.0.0:3000
```

open:

[http://127.0.0.1:3000](http://127.0.0.1:3000)

Notes:

- `0.0.0.0` is correct for the server bind address
- it is not the public URL for sync
- keep the PowerShell window open while using the local desktop app

## Desktop Quick Start File

Double-click this file to start the server:

- [Start-Bankroll-Server.bat](C:/Users/Tyler/Desktop/Bankroll%20Log/Start-Bankroll-Server.bat)

It opens a visible terminal and runs:

```text
npm start
```

## Auto-Start On Login

This PowerShell script starts the server quietly in the background:

- [Start-Bankroll-Server-On-Login.ps1](C:/Users/Tyler/Desktop/Bankroll%20Log/Start-Bankroll-Server-On-Login.ps1)

It:

- starts `node server.js`
- writes logs to `server.log` and `server.err`
- skips starting a duplicate if port `3000` is already in use

### How To Make It Run At Login

1. Press `Win + R`
2. Type `shell:startup`
3. Press Enter
4. Create a shortcut in that folder
5. Use this shortcut target:

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\Users\Tyler\Desktop\Bankroll Log\Start-Bankroll-Server-On-Login.ps1"
```

6. Name it something like `Bankroll Log Server`

### How To Test The Login Script Without Restarting

If the server is already running, the script should detect port `3000` and exit without launching a duplicate.

For a full test:

1. Stop the current server
   In the PowerShell window running `npm start`, press `Ctrl + C`
2. Run:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\Tyler\Desktop\Bankroll Log\Start-Bankroll-Server-On-Login.ps1"
```

3. Confirm the server is listening:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

4. Open:

[http://127.0.0.1:3000](http://127.0.0.1:3000)

Optional log check:

- [server.log](C:/Users/Tyler/Desktop/Bankroll%20Log/server.log)
- [server.err](C:/Users/Tyler/Desktop/Bankroll%20Log/server.err)

## Android App

Open this folder in Android Studio:

`C:\Users\Tyler\Desktop\Bankroll Log\android-app`

The Android app:

- wraps the tracker inside a WebView
- supports local on-device storage
- supports cloud sync
- exports JSON backups to `Downloads/Bankroll Log`

### Android Install / Run

1. Open `android-app` in Android Studio
2. Let Gradle sync
3. Connect your phone or use an emulator
4. Click Run

### Android Build APK

If you want to install it manually on your phone instead of only using the green Run button:

1. In Android Studio, go to `Build`
2. Choose `Build APK(s)`
3. Find the APK in the build output
4. Transfer/install it on your phone

## Cloud Sync

Cloud sync lets the Android app and desktop app use the same hosted bankroll data.

### Important Difference

- `HOST=0.0.0.0`
  This is the internal server bind address. Leave it alone.
- `https://your-app.up.railway.app`
  This is the public URL you paste into the app for sync.

Do not use `0.0.0.0` as the Sync API URL.

### Railway Deploy Summary

The full guide is here:

- [CLOUD_SYNC_SETUP.md](C:/Users/Tyler/Desktop/Bankroll%20Log/CLOUD_SYNC_SETUP.md)

Short version:

1. Push the repo to GitHub
2. Create a Railway project from the GitHub repo
3. Add variable:

```text
BANKROLL_API_TOKEN
```

4. Set Healthcheck Path to:

```text
/api/health
```

5. Generate or copy the public Railway HTTPS domain

Example:

```text
https://bankroll-log-production.up.railway.app
```

Use the base URL only.
Do not add `/api/state`.

### Railway Networking

If Railway shows:

```text
bankroll-log.railway.internal
```

that is the private internal hostname only.

You need to click:

```text
Generate Domain
```

Then copy the public `https://...railway.app` URL.

### Desktop Sync Fields

To find them:

1. Start the desktop app
2. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)
3. Scroll to the `Data` panel

Fields:

- `Sync API URL`
- `Access Token`

Paste:

- `Sync API URL` = your Railway public base URL
- `Access Token` = your `BANKROLL_API_TOKEN`

Then click:

- `Save Sync Settings`
- `Sync Now`

### Android Sync Fields

To find them:

1. Open the Android app
2. Tap `Entry`
3. Open `Data Tools`

Fields:

- `Sync API URL`
- `Access Token`

Paste the same:

- Railway public base URL
- same token

Then tap:

- `Save Sync Settings`
- `Sync Now`

## Sync Test

After setup:

1. Add a bet on Android
2. On desktop, click `Sync Now`
3. Confirm the bet appears
4. Edit or add a bet on desktop
5. On Android, tap `Sync Now`
6. Confirm the changes appear on the phone

## Troubleshooting

### `401 Unauthorized`

Your access token is wrong or mismatched between devices.

### Sync does not work

Check:

- the Railway public URL is correct
- you used the base URL only
- you did not paste `/api/state`
- the Railway deploy is healthy

### Healthcheck confusion

Use:

```text
/api/health
```

### Railway host confusion

If you see `0.0.0.0`, that is normal for the server bind.

If you see `bankroll-log.railway.internal`, that is private Railway networking only.

For app sync, use the public Railway `https://...railway.app` domain.

## Repo

GitHub repo:

[https://github.com/TLove-Controls/Bankroll_Log](https://github.com/TLove-Controls/Bankroll_Log)
