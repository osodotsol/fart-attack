// Launch Electron with a clean environment. Some hosts (e.g. VS Code extension terminals) export
// ELECTRON_RUN_AS_NODE=1, which would make Electron behave like plain Node and never open a window.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron'); // resolves to the electron executable path
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// `--script <file>` runs a dev script (e.g. scripts/snap.cjs) instead of the app.
const args = process.argv.slice(2);
const i = args.indexOf('--script');
const entry = i >= 0 ? args.splice(i, 2)[1] : '.';
const child = spawn(electronPath, [entry, ...args], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
