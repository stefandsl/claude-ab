# claude-ab

Run **Abliteration models inside the Claude Code terminal harness** with a separate `claude-ab` command. Your ordinary `claude` command keeps its existing settings and login.

Defaults to **Abliterated Large V2** with its 1,000,000-token context. Supports Windows, macOS, and Linux, with no runtime npm dependencies. Inference uses Abliteration's hosted API; this does not download model weights or run offline.

## Install on any machine

Prerequisites: **Node.js 20+ with npm**, **Git**, an installed **Claude Code CLI**, and an **Abliteration project API key** (`ak_...`).

Install directly from this repository:

```sh
npm install --global git+https://github.com/stefandsl/claude-ab.git --ignore-scripts
```

Or clone and use the platform installer:

```sh
git clone https://github.com/stefandsl/claude-ab.git
cd claude-ab
```

Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

macOS / Linux:

```sh
sh ./install.sh
```

Then, on each machine:

```sh
claude-ab --setup
claude-ab --check
claude-ab --test
claude-ab
```

Paste only the key at the hidden setup prompt. `--check` authenticates and lists models without generating a completion. `--test` makes a small **billed** request through the real Claude Code CLI, with tools, MCP, hooks, and plugins disabled for that test. Normal sessions retain your usual Claude Code features and permissions.

The platform installers package the source and install a copy globally with npm; you can delete the clone afterward. They do not install Claude Code or change shell profiles. Your npm global bin directory must be on PATH. On Unix, use a Node version manager or a user-owned npm prefix if global installation reports EACCES.

## Models and commands

| Command | Model | Context | Input |
| --- | --- | ---: | --- |
| `claude-ab` | Abliterated Large V2 | 1,000,000 | Text |
| `claude-ab --model flash` | Abliterated Large Flash | 1,048,576 | Text, images |
| `claude-ab --model base` | Abliterated Model | 262,144 | Text, images |
| `claude-ab --model large` | Abliterated Large (deprecated) | 1,000,000 | Text |

Canonical model IDs also work: `claude-ab --model abliterated-model-large-v2`. Access depends on your key; `--check` lists live models.

```sh
claude-ab -p "Explain this repository"
claude-ab --continue
claude-ab --model flash
claude-ab --ab-help
claude-ab --ab-models
claude-ab --ab-status
claude-ab --help
```

Other arguments pass directly to Claude Code. Start a new `claude-ab --model ...` process to change models, so the context length changes too. The Opus/Sonnet/Haiku tiers and subagent default all map to the selected Abliteration model. Large V2 is text only; use Flash or Base for images.

## Credentials

Keys stay on each machine, outside this repository:

- **Windows:** `%LOCALAPPDATA%\claude-ab\api-key.dpapi`, encrypted with Windows DPAPI for your Windows account. Set up each machine separately; don't copy the encrypted file between machines.
- **macOS / Linux:** `${XDG_CONFIG_HOME:-~/.config}/claude-ab/api-key`, a plaintext file owned by you with mode `0600` in a `0700` directory. It is **not encrypted**. Prefer the environment option below if using a secret manager.
- **Any platform:** `ABLITERATION_API_KEY` (or `ABLIT_KEY`) overrides the saved key. Supply it through your secret manager or CI secret configuration.

The launcher passes keys in the child environment, never command arguments. It does not print keys or change global Anthropic environment variables. Programs running under your account may access your processes or credentials. Re-run `--setup` to replace a saved key. Never commit keys or include them in issue reports.

## How it works

The Claude child process receives `ANTHROPIC_BASE_URL=https://api.abliteration.ai`, bearer authentication, the selected model for all default tiers, and its native `CLAUDE_CODE_MAX_CONTEXT_TOKENS`. Canonical model IDs and explicit context settings also work with Claude Code versions predating newer `[1m]` suffix behavior. The initial Windows launcher was tested with Claude Code 2.1.201.

Inherited Anthropic API/OAuth credentials, cloud-provider selectors, and custom headers are removed from the child environment. Your parent shell is unchanged. Existing Claude settings, hooks, plugins, and permissions still apply during normal sessions. Project or organization settings that override provider/auth variables can conflict with the launcher; resolve those locally.

API usage is billed to **Abliteration**, separately from your Claude subscription. Abliteration documents this integration. Anthropic does not officially support non-Claude models through gateways; compatibility can change with Claude Code versions.

## Troubleshooting

- Command not found: ensure your npm global bin directory is on PATH (`npm prefix --global`; Unix adds `/bin`).
- Claude not found: install Claude Code and confirm `claude --version` works in the same shell.
- Setup format error: copy only the `ak_...` project key, without quotes. Surrounding whitespace is trimmed. Admin keys are not inference keys.
- Windows setup failure: the prompt reports the failing stage and a secret-free error type. Set up and launch under the same Windows account.
- HTTP `401`: replace the key. `402`: add Abliteration credits. `403`: check permissions/policies. `429`: wait and retry.
- Image input rejected: use Flash or Base instead of V2.

## Update and uninstall

Repeat the direct GitHub npm install command, or pull the clone and rerun the installer. Your saved key survives updates.

```sh
npm uninstall --global @stefandsl/claude-ab
```

To remove credentials too, delete the credential file listed above. Users of the initial standalone Windows prototype may also delete `%LOCALAPPDATA%\claude-ab\claude-ab.cjs` and `credential.ps1`; the npm version does not use those old copies.

## Development

```sh
npm test
npm pack --dry-run
```

Tests cover model/context selection, argument boundaries, environment isolation, child exit codes, CLI errors, and Unix key-file permissions. GitHub Actions runs them on Windows, macOS, and Linux without real API keys. Live inference requires your own key and `claude-ab --test`.

## References

- [Claude Code integration](https://docs.abliteration.ai/integrations/claude-code)
- [Models](https://docs.abliteration.ai/models)
- [Authentication](https://docs.abliteration.ai/api/authentication)
- [Anthropic compatibility](https://docs.abliteration.ai/api/anthropic-compatibility)
- [Compatibility matrix](https://docs.abliteration.ai/compatibility-matrix)
- [Anthropic gateway documentation](https://code.claude.com/docs/en/llm-gateway)

Independent utility, not affiliated with Anthropic or Abliteration. MIT licensed.
