# Timesheet Parrot

> A lightweight, **local-first** desktop timesheet app built for solo developers and freelancers who just want to track time and generate reports — without subscriptions, cloud lock-in, or bloat.

[![GitHub release](https://img.shields.io/github/v/release/lonerider79/TimeSheetParrot)](https://github.com/lonerider79/TimeSheetParrot/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-informational)](https://github.com/lonerider79/TimeSheetParrot/releases)

---

<details>
<summary>📸 Screenshots</summary>
<img width="640" height="480" alt="Dashboard" src="https://github.com/user-attachments/assets/cae88591-a4e9-4780-b761-ffb7f3a862d1" />
<img width="640" height="480" alt="Timer" src="https://github.com/user-attachments/assets/ebc07e97-41d8-4b79-87a3-400a322402bb" />
<img width="640" height="480" alt="Settings in light theme" src="https://github.com/user-attachments/assets/3e17d837-a519-4d18-b70e-2034f721a229" />
</details>

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
- 🔄 **Auto-updates** via GitHub releases (this is still WIP)

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

> **Note:** Portable builds are available for windows but do not support auto-updates.

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

The repository uses a CI workflow that runs for version tags. It builds Windows x64, Linux x64, and macOS x64 and arm64 artifacts in parallel. After every platform build succeeds, one final job creates the GitHub Release and uploads the installers and `electron-builder` update metadata. 

> ⚠️ **There are no publisher certificates, hence on Mac and Windows a local build helps to avoid warning issues**.

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

Built with ❤️ for solo developers who just want to track their time without the drama. No cloud. No subscriptions. No nonsense.

> *"Your work. Your data. Your timesheet."*
