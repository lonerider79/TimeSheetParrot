const { spawnSync } = require('node:child_process')
const path = require('node:path')

const hostTarget = { win32: 'win', linux: 'linux', darwin: 'mac' }[process.platform]
const target = process.argv[2] || hostTarget

// better-sqlite3 must be rebuilt on the OS that will run the packaged app.
if (!hostTarget || target !== hostTarget) {
  console.error(
    `Cannot build ${target || 'this target'} locally on ${process.platform}. ` +
      'Build each platform on its own OS because this app includes better-sqlite3.\n' +
      'For Linux on Windows, use a separate checkout inside WSL (Linux Node.js 24+, npm ci, npm run build:linux).\n' +
      'For all platforms, use the existing GitHub release workflow. See README.md: Build Locally.'
  )
  process.exit(1)
}

const root = path.resolve(__dirname, '..')
const npmCli = process.env.npm_execpath
if (!npmCli) {
  console.error('Run this script through npm: npm run build, build:win, build:linux, or build:mac.')
  process.exit(1)
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    stdio: 'inherit',
  })
  if (result.error) console.error(result.error.message)
  if (result.error || result.status !== 0) process.exit(result.status || 1)
}

run(npmCli, ['run', 'rebuild'])
run(npmCli, ['run', 'build:web'])
run(require.resolve('electron-builder/cli.js'), [`--${target}`, '--publish', 'never'])
