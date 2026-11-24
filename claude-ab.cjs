#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const BASE_URL = 'https://api.abliteration.ai';
const MODELS = {
  v2: { id: 'abliterated-model-large-v2', context: 1000000, images: false },
  flash: { id: 'abliterated-model-large-flash', context: 1048576, images: true },
  base: { id: 'abliterated-model', context: 262144, images: true },
  large: { id: 'abliterated-model-large', context: 1000000, images: false },
};
const credentialPath = () => process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'claude-ab', 'api-key.dpapi')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'claude-ab', 'api-key');
const powershell = () => path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function resolveModel(value = 'v2') {
  const canonical = value.replace(/\[1m\]$/, '');
  const model = MODELS[canonical] || Object.values(MODELS).find(m => m.id === canonical);
  if (!model) throw new Error(`Unknown Abliteration model: ${value}. Use --ab-models.`);
  return model;
}

function parseArgs(args) {
  const forwarded = [];
  let model = resolveModel();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') { forwarded.push(...args.slice(i)); break; }
    if (args[i] === '--model') {
      if (!args[i + 1]) throw new Error('--model requires v2, flash, base, or a canonical Abliteration ID.');
      model = resolveModel(args[++i]);
    } else if (args[i].startsWith('--model=')) {
      model = resolveModel(args[i].slice(8));
    } else forwarded.push(args[i]);
  }
  return { model, forwarded };
}

function childEnvironment(parent, model, key) {
  const env = { ...parent };
  for (const name of [
    'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR',
    'CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_SMALL_FAST_MODEL', 'ANTHROPIC_CUSTOM_HEADERS',
    'CLAUDE_CODE_AUTO_COMPACT_WINDOW', 'CLAUDE_CODE_DISABLE_1M_CONTEXT',
  ]) delete env[name];
  Object.assign(env, {
    ANTHROPIC_BASE_URL: BASE_URL,
    ANTHROPIC_AUTH_TOKEN: key,
    ANTHROPIC_MODEL: model.id,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model.id,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model.id,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: model.id,
    ANTHROPIC_SMALL_FAST_MODEL: model.id,
    CLAUDE_CODE_SUBAGENT_MODEL: model.id,
    ANTHROPIC_CUSTOM_MODEL_OPTION: model.id,
    ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: `Abliteration (${model.id})`,
    CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(model.context),
  });
  return env;
}

function findClaude() {
  // Prefer the existing npm installation, then native installations on PATH.
  const npmExe = process.platform === 'win32' && path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  if (npmExe && fs.existsSync(npmExe)) return npmExe;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const candidates = process.platform === 'win32'
      ? [path.join(dir, 'claude.exe'), path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')]
      : [path.join(dir, 'claude')];
    for (const candidate of candidates) {
      try { fs.accessSync(candidate, fs.constants.X_OK); if (fs.statSync(candidate).isFile()) return candidate; } catch {}
    }
  }
  const native = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  if (fs.existsSync(native)) return native;
  throw new Error('Claude Code was not found. Install Claude Code first.');
}

function runCredentialHelper(mode, stdio) {
  return spawnSync(powershell(), [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.join(__dirname, 'credential.ps1'), '-Mode', mode,
  ], { stdio, encoding: 'utf8', windowsHide: mode !== 'Save' });
}

function readKey() {
  const fromEnv = process.env.ABLITERATION_API_KEY || process.env.ABLIT_KEY;
  if (fromEnv) return fromEnv.trim();
  if (!fs.existsSync(credentialPath())) throw new Error('No Abliteration key saved. Run: claude-ab --setup');
  if (process.platform !== 'win32') {
    const stat = fs.lstatSync(credentialPath());
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()) {
      throw new Error('Key file must belong to you with owner-only permissions. Run: claude-ab --setup');
    }
    return fs.readFileSync(credentialPath(), 'utf8').trim();
  }
  const result = runCredentialHelper('Read', ['ignore', 'pipe', 'pipe']);
  if (result.status !== 0 || !result.stdout?.trim()) {
    throw new Error('Cannot decrypt the saved key for this Windows account. Run: claude-ab --setup');
  }
  return result.stdout.trim();
}

function promptHidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('Run --setup in an interactive terminal. For automation, set ABLITERATION_API_KEY.');
  return new Promise((resolve, reject) => {
    let value = '';
    const input = process.stdin;
    const wasRaw = input.isRaw;
    process.stderr.write(prompt);
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();
    const finish = (error) => {
      input.removeListener('data', onData);
      input.setRawMode(Boolean(wasRaw));
      input.pause();
      process.stderr.write('\n');
      if (error) reject(error); else resolve(value.trim());
    };
    function onData(chunk) {
      for (const ch of chunk) {
        if (ch === '\u0003' || ch === '\u0004') return finish(new Error('Setup cancelled.'));
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    }
    input.on('data', onData);
  });
}

function saveUnixKey(key, file = credentialPath()) {
  if (!/^ak_\S+$/.test(key)) throw new Error('Expected an ak_ project API key, without quotes.');
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.uid !== process.getuid()) throw new Error('Credential directory must be owned by your account.');
  fs.chmodSync(directory, 0o700);
  const temporary = path.join(directory, `.api-key-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(temporary, key + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

async function checkKey(key, model) {
  const response = await fetch(`${BASE_URL}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const hints = { 401: 'Invalid key; run --setup again.', 402: 'Add credits in the Abliteration console.', 403: 'Check the key project permissions.', 429: 'Rate limited; try again later.' };
    throw new Error(`Abliteration HTTP ${response.status}. ${hints[response.status] || 'Try again or check service status.'}`);
  }
  const body = await response.json();
  const ids = (body.data || []).map(m => m.id);
  console.log('Abliteration authentication: OK');
  console.log(`Available models: ${ids.join(', ')}`);
  if (!ids.includes(model.id)) throw new Error(`Your key does not list ${model.id}. Select another model with --model.`);
  console.log(`Selected model: ${model.id}; context: ${model.context.toLocaleString('en-US')}`);
}

function launchClaude(exe, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { env, stdio: 'inherit', shell: false });
    // Both processes receive console Ctrl+C. Keep the wrapper alive until Claude exits.
    const onInterrupt = () => {};
    process.on('SIGINT', onInterrupt);
    child.once('error', error => { process.removeListener('SIGINT', onInterrupt); reject(error); });
    child.once('exit', (code, signal) => {
      process.removeListener('SIGINT', onInterrupt);
      resolve(code ?? (signal ? 130 : 1));
    });
  });
}

async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--setup') {
    if (process.platform !== 'win32') {
      saveUnixKey(await promptHidden('Abliteration project API key (hidden): '));
      console.log('Key saved in an owner-only local file (0600). Run: claude-ab --check');
      return 0;
    }
    const result = runCredentialHelper('Save', 'inherit');
    if (result.error) throw new Error('Could not start the private key prompt.');
    return result.status ?? 1;
  }
  if (args.length === 1 && args[0] === '--ab-help') {
    console.log(`claude-ab: Claude Code with Abliteration\n\n  claude-ab --setup              Save your API key privately on this machine\n  claude-ab                     Start Large V2 (text, 1M context)\n  claude-ab --model flash        Large Flash (text/images, 1M context)\n  claude-ab --model base         Base model (text/images, 262K context)\n  claude-ab --ab-models          List bundled model choices\n  claude-ab --check              Validate key and list live models\n  claude-ab --test               Run a small real Claude Code request\n  claude-ab --ab-status          Show setup status without revealing the key\n\nOther arguments pass through to Claude Code, including --help, -p, --continue.\nUse --model at launch to change models and context together.\nAPI usage is billed to your Abliteration account.`);
    return 0;
  }
  if (args.length === 1 && args[0] === '--ab-models') {
    for (const [alias, model] of Object.entries(MODELS)) console.log(`${alias.padEnd(6)} ${model.id.padEnd(32)} ${String(model.context).padStart(7)} tokens; ${model.images ? 'text/images' : 'text'}${alias === 'large' ? '; deprecated' : ''}`);
    return 0;
  }
  if (args.length === 1 && args[0] === '--ab-status') {
    console.log(`Claude Code: ${findClaude()}`);
    console.log(`Endpoint: ${BASE_URL}`);
    console.log(`Default: ${MODELS.v2.id} (1,000,000 tokens)`);
    console.log(`Saved key: ${fs.existsSync(credentialPath()) ? 'present' : 'not configured; run claude-ab --setup'}`);
    console.log(`Storage: ${process.platform === 'win32' ? 'Windows DPAPI encryption' : 'owner-only local file (0600), not encrypted'}`);
    console.log(`Environment key: ${process.env.ABLITERATION_API_KEY || process.env.ABLIT_KEY ? 'present' : 'absent'}`);
    return 0;
  }
  const { model, forwarded } = parseArgs(args);
  const exe = findClaude();
  if (forwarded.length === 1 && ['--help', '-h', '--version', '-v'].includes(forwarded[0])) {
    return launchClaude(exe, forwarded, process.env);
  }
  const key = readKey();
  if (!/^ak_\S+$/.test(key)) throw new Error('Expected an Abliteration project key beginning with ak_. Run --setup.');
  if (forwarded.length === 1 && forwarded[0] === '--check') { await checkKey(key, model); return 0; }
  const claudeArgs = forwarded.length === 1 && forwarded[0] === '--test'
    ? ['--safe-mode', '--strict-mcp-config', '--no-session-persistence', '--tools', '', '-p', 'Reply with exactly: ABLITERATION_OK']
    : forwarded;
  return launchClaude(exe, ['--model', model.id, ...claudeArgs], childEnvironment(process.env, model, key));
}

module.exports = { resolveModel, parseArgs, childEnvironment, launchClaude, readKey, saveUnixKey, findClaude, credentialPath, MODELS };
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(`claude-ab: ${error.message}`);
  process.exitCode = 1;
});
