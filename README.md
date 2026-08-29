# Timesheet Parrot 0.1.0

Timesheet Parrot is a local-first desktop timesheet and task timer built with Electron, Vite, vanilla JavaScript, Tailwind CSS, SQLite, Chart.js, Heroicons and ExcelJS.

The project intentionally uses **JavaScript only**. There is no TypeScript.

## Important: fresh database schema

This package is version `0.1.0` and intentionally does not include migrations. The SQLite schema is created fresh.

If an older development database exists, remove it before testing this package.

## First run and workspace import

If the local database does not exist, Timesheet Parrot opens a dedicated workspace window with:

1. **Initialize Workspace** - creates a fresh SQLite database.
2. **Load workspace from previous backup** - lets you choose an exported Timesheet Parrot SQLite database.

The import process validates the expected tables, columns, foreign keys and key values before copying the data into a newly created local database. A progress bar reports each import stage.

If validation fails, the application creates a fresh workspace and reports the failure. You can then continue with the new workspace or choose another backup.

## Localization

Locale files are discovered by the Electron main process **when the application starts**.

The source folder is:

```text
src/renderer/locales/
├── en.json
└── ml.json
```

Add another file such as:

```text
src/renderer/locales/fr.json
```

with the same keys as `en.json`. Restart the application and it will appear automatically in **Settings -> Language**.

For packaged builds, the locale folder is copied to the application's `resources/locales` directory. This keeps locale discovery separate from the bundled renderer code.

`en.json` is the canonical translation contract. All user-visible application strings are represented there, including renderer text, workspace messages, tray labels and Excel export headers.

## Database naming

The database uses explicit entity names:

- `client_id`, `client_name`
- `project_id`, `project_name`
- `task_id`, `task_name`
- `time_entry_id`
- `currency_code`, `currency_symbol`, `currency_name`

Currencies are stored in SQLite rather than in a renderer-side array.

Time entries also have a `deleted` flag. Deleting an entry is a soft delete: the row remains in SQLite and is shown in the timer history as deleted.

## Timer history

The Timer page lists time entries in descending creation order. Each non-deleted entry can be:

- restarted as a new timer,
- edited,
- marked deleted.

Editing recalculates duration from the start and end values.

## Dashboard

Dashboard period choices are:

- Day
- Month
- Year

Month and year views are presented as weekly rows with Monday-Sunday columns. The table can be grouped by client, project or task and filtered by client or project.

## Time display

Settings provides:

- Decimal hours, for example `2.50h`
- `hh:mm:ss`, for example `02:30:00`

The setting is persisted in SQLite.

## Theme

The application supports day and night mode. Heroicons are loaded from the Heroicons package as image assets. Dark mode applies a light icon filter so the icons remain visible against the dark navigation background.

## Excel

Timesheet export uses ExcelJS.

## Development

Use Node.js 22.12 or newer.

```powershell
npm install
npm run rebuild
npm run dev
```

Format the code:

```powershell
npm run format
```

Check formatting:

```powershell
npm run format:check
```

## Local builds

Windows:

```powershell
npm run build:win
```

Linux:

```bash
npm run build:linux
```

macOS:

```bash
npm run build:mac
```

The build output is written to `release/`.

## GitHub Actions

`.github/workflows/build.yml` builds Windows x64, Linux x64 and macOS artifacts and uploads each `release/` directory as a GitHub Actions artifact.

No code signing or notarization credentials are included. Those can be added later as GitHub Actions secrets.

## Readability

The Electron main process, database, repository and renderer code is deliberately written with normal multi-line functions and comments. Prettier is included to keep formatting consistent without compressing the source into one-line functions.

## Architecture

```text
Renderer HTML/JS
      |
      v
Preload API
      |
      v
Electron IPC
      |
      v
Repository
      |
      v
SQLite
```

This keeps the renderer independent from SQLite and leaves room for future local synchronization or P2P adapters.

## License

GPLv3-only.
