import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, '..');

function runElectronSmoke(targetExe, baseArgs, label) {
  return new Promise((resolve, reject) => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;

    const child = spawn(targetExe, [...baseArgs, '--smoke'], {
      cwd: desktopDir,
      env: cleanEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${label}: timed out after 50s`));
    }, 50000);

    child.on('exit', (code) => {
      clearTimeout(timer);
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{') && l.endsWith('}'));
      const jsonLine = lines[lines.length - 1];
      if (!jsonLine) {
        reject(new Error(`${label}: no JSON output on stdout (exit=${code}). stderr=${stderr.slice(0, 400)}`));
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(jsonLine);
      } catch (err) {
        reject(new Error(`${label}: invalid JSON report: ${jsonLine} (${err.message})`));
        return;
      }
      if (code !== 0 || !parsed.ok) {
        reject(new Error(`${label}: smoke failed (exit=${code}): ${JSON.stringify(parsed)}`));
        return;
      }
      resolve(parsed);
    });
  });
}

async function main() {
  const exeArg = process.argv.find((a) => a.startsWith('--exe='));
  const electronBinary = require('electron');
  const targetExe = exeArg ? path.resolve(exeArg.slice('--exe='.length)) : electronBinary;
  const baseArgs = exeArg ? [] : [desktopDir];

  const run1 = await runElectronSmoke(targetExe, baseArgs, 'launch-1');
  console.log('Smoke launch 1:', JSON.stringify(run1));

  const run2 = await runElectronSmoke(targetExe, baseArgs, 'launch-2');
  console.log('Smoke launch 2:', JSON.stringify(run2));

  if (run2.prevProbe !== run1.nextProbe) {
    throw new Error(
      `localStorage persistence check failed across launches: run1.nextProbe=${run1.nextProbe} vs run2.prevProbe=${run2.prevProbe}`
    );
  }
  console.log('SMOKE PASSED: offline fonts, CSP/network lockdown, preload isolation, and localStorage persistence verified across two launches.');
}

await main();
