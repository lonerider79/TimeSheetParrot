# Timesheet Parrot

> A lightweight, **local-first** desktop timesheet app built for solo developers and freelancers who just want to track time and generate reports — without subscriptions, cloud lock-in, or bloat.

[![GitHub release](https://img.shields.io/github/v/release/lonerider79/TimeSheetParrot)](https://github.com/lonerider79/TimeSheetParrot/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-informational)](https://github.com/lonerider79/TimeSheetParrot/releases)

---

## ✨ Why I Built This

After a popular time tracker paywalled basic export features overnight, I realized how risky it is to depend on cloud apps for something as simple as logging hours. The alternatives were either overpriced or packed with project management features I didn't need.

So I built **Timesheet Parrot** — a dead-simple, open-source replacement that keeps everything on your machine.

---

## 🚀 What It Does

- ⏱️ **Track time** by project and task
- 📊 **Generate weekly timesheets** with a clean, readable layout
- 📤 **Export reports** (Excel / print-friendly formats)
- 💾 **100% local SQLite storage** — your data, your control, no cloud required
- 🖥️ **Cross-platform** — Windows, Linux, and macOS
- 🔄 **Auto-updates** via GitHub releases (no manual checking)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop Framework | [Electron](https://www.electronjs.org/) |
| Build Tool | [Vite](https://vitejs.dev/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| Database | [SQLite](https://www.sqlite.org/) (local, file-based) |
| Excel Export | [ExcelJS](https://github.com/exceljs/exceljs) |
| Charts | [Chart.js](https://www.chartjs.org/) |
| Icons | [Heroicons](https://heroicons.com/) |

---

## 📥 Download & Install

Grab the latest installer for your platform from the [Releases](https://github.com/lonerider79/TimeSheetParrot/releases) page.

| Platform | Preferred Format | Auto-Update |
|----------|-----------------|-------------|
| Windows | `.exe` (NSIS installer) | ✅ Yes |
| Linux | `.AppImage` | ✅ Yes |
| macOS | `.dmg` / `.zip` | ✅ Yes (code signing required for production) |

> **Note:** Portable builds are available but do not support auto-updates.

---

## 🧑‍💻 Development

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [npm](https://www.npmjs.com/)

### Setup

```bash
# Clone the repository
git clone https://github.com/lonerider79/TimeSheetParrot.git
cd TimeSheetParrot

# Install dependencies
npm install

# Start the development server
npm run dev
```

> ⚠️ **Do not run `npm audit fix --force`.** The project pins `exceljs@4.4.0` and uses npm overrides for stale transitive dependencies. Forcing an audit fix can downgrade ExcelJS and break functionality.

---

## 📦 Build Locally

```bash
# Windows
npm run build:win

# Linux
npm run build:linux

# macOS
npm run build:mac
```

Build artifacts will be placed in the `dist/` directory.

---

## 🔄 GitHub Release & Auto-Updates

The repository uses a CI workflow that creates a **draft GitHub Release** for tagged versions. Each platform build (Windows, Linux, macOS) publishes its own installer and `electron-builder` update metadata to that draft. The final job publishes the release automatically once all three builds succeed.

### Creating a Release

1. Update the version in `package.json`
2. Create and push a tag:

```bash
git tag v0.1.2
git push origin v0.1.2
```

3. The CI workflow will build, package, and publish the release automatically.

### Auto-Update Configuration

The app is configured to use this GitHub repository as its update provider:

```
lonerider79/TimeSheetParrot
```

---

## 🤝 Contributing

Contributions are welcome! Whether it's a bug report, feature request, or pull request, your input helps make Timesheet Parrot better for everyone.

- 🐛 **Found a bug?** [Open an issue](https://github.com/lonerider79/TimeSheetParrot/issues)
- 💡 **Have an idea?** [Start a discussion](https://github.com/lonerider79/TimeSheetParrot/discussions)
- 🔧 **Want to code?** Fork the repo, make your changes, and open a PR

If this project saves you a subscription fee, a ⭐ on the repo is greatly appreciated!

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with love for solo developers who just want to track their time without the drama. No cloud. No subscriptions. No nonsense.

> *"Your data. Your machine. Your timesheet."*
