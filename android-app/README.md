# Bankroll Log Android

This is a standalone Android Studio project that wraps the bankroll tracker UI in a native Android app.

## What it does

- Loads the tracker UI inside a WebView
- Saves bankroll data to app storage on the phone
- Exports JSON backups to `Downloads/Bankroll Log`
- Supports JSON import using the Android file picker

## Project location

Open this folder in Android Studio:

`C:\Users\Tyler\Desktop\Bankroll Log\android-app`

## Main files

- `app/src/main/java/com/tyler/bankrolllog/MainActivity.kt`
- `app/src/main/assets/index.html`
- `app/src/main/assets/styles.css`
- `app/src/main/assets/app.js`

## Notes

- This project is designed for Android Studio sync/build, not for `node`.
- I did not run a full Android build here because the local Android SDK / Gradle toolchain is not available in this workspace.
