# Timesheet Parrot 0.1.1

GPLv3 local-first desktop timesheet application built with Electron, Vite, Tailwind CSS, SQLite, ExcelJS, Chart.js and Heroicons.

## Development

```bash
npm install
npm run dev
```

## Build locally

```bash
npm run build:win
npm run build:linux
npm run build:mac
```

## GitHub release / automatic updates

The repository workflow uses a draft GitHub Release for tagged versions. Each Windows, Linux and macOS build publishes its own installer and electron-builder update metadata to that draft release. The final job publishes the draft after all three builds succeed.

Create a release with:

```bash
git tag v0.1.1
git push origin v0.1.1
```

For later releases, increment the application version in `package.json` and create the matching `vX.Y.Z` tag.

### Auto-update targets

- Windows: NSIS installer. Portable builds are not self-updating.
- Linux: AppImage is the preferred self-updating format.
- macOS: DMG/ZIP targets are produced. Apple code signing/notarization is required for production macOS auto-update functionality.

The GitHub repository is configured as the update provider:

`lonerider79/TimeSheetParrot`

Do not use `npm audit fix --force`; it can downgrade ExcelJS. The package pins ExcelJS 4.4.0 and uses npm overrides for stale transitive dependencies.
