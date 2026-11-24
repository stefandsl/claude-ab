const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveModel, parseArgs, childEnvironment, launchClaude, readKey, saveUnixKey, MODELS } = require('../claude-ab.cjs');
const launcher = path.resolve(__dirname, '../claude-ab.cjs');

test('model aliases and canonical IDs select native contexts', () => {
  assert.equal(resolveModel().id, 'abliterated-model-large-v2');
  assert.equal(resolveModel('abliterated-model-large-v2[1m]').context, 1000000);
  assert.equal(resolveModel('flash').context, 1048576);
  assert.equal(resolveModel('base').context, 262144);
  assert.throws(() => resolveModel('sonnet'), /Unknown/);
  assert.throws(() => parseArgs(['--model']), /requires/);
});

test('model flags preserve prompt boundaries and the option terminator', () => {
  const prompt = 'spaces, "quotes", $dollar, `backticks`, & pipes | and Unicode: ciao è';
  const parsed = parseArgs(['--model=base', '-p', prompt]);
  assert.equal(parsed.model, MODELS.base);
  assert.deepEqual(parsed.forwarded, ['-p', prompt]);
  assert.deepEqual(parseArgs(['--', '--model', 'literal']).forwarded, ['--', '--model', 'literal']);
});

test('routing replaces unrelated auth only in the child, including subagents', () => {
  const parent = { ANTHROPIC_API_KEY: 'unrelated', ANTHROPIC_BASE_URL: 'wrong', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_OAUTH_TOKEN: 'unrelated', KEEP_ME: 'yes' };
  const before = { ...parent };
  const env = childEnvironment(parent, MODELS.flash, 'ak_test_not_real');
  assert.deepEqual(parent, before);
  for (const name of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_OAUTH_TOKEN']) assert.equal(env[name], undefined);
  assert.equal(env.ANTHROPIC_BASE_URL, 'https://api.abliteration.ai');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'ak_test_not_real');
  assert.equal(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS, '1048576');
  for (const name of ['ANTHROPIC_DEFAULT_HAIKU_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL']) assert.equal(env[name], MODELS.flash.id);
  assert.equal(env.KEEP_ME, 'yes');
});

test('OS process launch preserves shell metacharacters and the exit code', async () => {
  const prompt = 'space "quotes" $HOME `echo` & | ; è';
  const code = 'require("node:assert/strict").deepEqual(process.argv.slice(1), ' + JSON.stringify([prompt, '--flag']) + '); process.exitCode = 7;';
  assert.equal(await launchClaude(process.execPath, ['-e', code, '--', prompt, '--flag'], process.env), 7);
});

test('launcher help and bundled model list need neither a key nor Claude installed', () => {
  for (const option of ['--ab-help', '--ab-models']) {
    const result = spawnSync(process.execPath, [launcher, option], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Abliteration|abliterated/);
  }
  const result = spawnSync(process.execPath, [launcher, '--model', 'invalid'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown/);
});

test('Unix key storage enforces owner-only modes and rejects unsafe permissions', { skip: process.platform === 'win32' }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-ab-test-'));
  const previous = { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, ABLITERATION_API_KEY: process.env.ABLITERATION_API_KEY, ABLIT_KEY: process.env.ABLIT_KEY };
  const file = path.join(temporary, 'claude-ab', 'api-key');
  try {
    process.env.XDG_CONFIG_HOME = temporary;
    delete process.env.ABLITERATION_API_KEY;
    delete process.env.ABLIT_KEY;
    saveUnixKey('ak_test_not_real', file);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.equal(readKey(), 'ak_test_not_real');
    fs.chmodSync(file, 0o644);
    assert.throws(() => readKey(), /owner-only/);
    saveUnixKey('ak_replaced_not_real', file);
    assert.equal(readKey(), 'ak_replaced_not_real');
    assert.throws(() => saveUnixKey('not-an-api-key', file), /ak_/);
  } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    fs.unlinkSync(file);
    fs.rmdirSync(path.dirname(file));
    fs.rmdirSync(temporary);
  }
});
