# AI Translate & Dictionary for Manggo

English | [中文](./README.md)

Native migration of the Pot LLM plugin. Version **4.0.0-beta.1** is a maintainer-authorized prerelease of the test build. Actual host installation and real-provider acceptance remain pending.

- Development: [`manggo`](https://github.com/iceriny/pot-app-translate-plugin-llm/tree/manggo)
- Archived Pot implementation: [`main`](https://github.com/iceriny/pot-app-translate-plugin-llm/tree/main), unchanged at `04e2df4ee0661fd0085d5adc0339f068905b70cb`
- Contract: Bun, ES modules, `manggo.plugin.v1`, `.mplugin` ZIP
- Recommended test host: Manggo v1.0.2 (2026-09-22). The native plugin feature requires appropriate Manggo/Pro support; an earlier minimum host/Bun version has not been verified

## Install

Install `com.iceriny.llm-4.0.0-beta.1.mplugin` in Manggo Plugin Management without extracting it. Then add **AI 翻译 · LLM** in Translation Services and configure a provider, API key and model. Add **AI 词典 · LLM** separately for native dictionary cards; its settings are independent. `?` displays offline help.

Pot settings/history are not accessed or imported. Re-enter credentials in Manggo. The new plugin ID can coexist with the old plugin. The maintainer has authorized this GitHub beta prerelease; it is not a stable release and has not been submitted to a store.

## Features and settings

Real delta streaming; standard Fetch; native secret/password, editable model, numeric and multiline controls; automatic detected-language use; glossary and extra instructions; native dictionary results with definitions, examples, pronunciation and forms.

Providers: DeepSeek, SiliconFlow, OpenAI, local Ollama and custom OpenAI Chat Completions-compatible endpoints. Anthropic/Gemini native APIs and Azure query authentication are not adapters in this build.

- Leave model blank for a provider default. Enter a model for custom/Ollama. Explicit model/URL overrides persist when switching providers, so clear or update them
- API URL can be a versioned base such as `https://host/v1` or full `/chat/completions` URL. The plugin does not guess `/v1`. HTTPS is required except localhost/127.0.0.1/[::1]; URL credentials, queries and fragments are rejected
- Remote API key required; local service key optional. Keys use native password/secret fields. No telemetry, additional forwarding or key logging. Encryption at rest is controlled by the host and is not asserted here
- Streaming defaults on for plain translation/Q&A; structured commands and dictionary return only after JSON validation
- Max tokens defaults to 4000 (plugin range 1–131072; provider limits still apply). Truncation is an error
- Timeout defaults to 60 seconds (5–300), using AbortController for the request/read lifecycle. This is not a claimed host cancellation hook
- Temperature omitted by default. Optional 0–2; leave blank for incompatible models
- JSON mode defaults off; enable only if the provider supports `response_format: {type: "json_object"}`
- Extra instructions and a multiline `source = preferred translation` glossary are supported. The glossary is not applied to Q&A
- Help/error language is separate from translation language

Provider/model presets are editable starting points, not a promise of current account availability. The public native API has no dynamic model-selector refresh hook. Requests are not automatically retried or cached across configurations.

## Commands

| Input | Result |
| --- | --- |
| Plain text / `$t text` / `>t text` | Translation preserving formatting |
| `$p text` | Literal + polished translation |
| `$f text` / `$cf text` | Neutral + warm colloquial |
| `$m text` / `$cm text` | Neutral + concise colloquial |
| `$r text` | Source pronunciation only |
| `$r> text` | Translation + target pronunciation |
| `$r< text` | Translation + source pronunciation |
| `$r<> text` | Translation + both pronunciations |
| `$q question` | Single-turn Q&A; no stored conversation |
| `?` / `$help` | Offline help |

Only `$r>`, `$r<`, `$r<>` allow text without a separating space. Unknown prefixes are preserved. Legacy style aliases remain, described as writing styles without assuming speaker gender.

The separate dictionary service supports words/short phrases (up to 200 characters and 30 whitespace-separated words). It does not parse commands. AI-generated meanings/pronunciation require verification; generated audio URLs are discarded.

## Build

Node.js 22+, npm and Python 3.10+ are development requirements. Manggo runs the installed plugin with Bun.

```sh
npm ci
npm run check
npm test
npm run package
npm run verify-package
```

The production archive contains exactly four root files: `manggo.plugin.json`, a **single bundled/minified ESM `main.js`**, `icon.svg`, and `LICENSE`. It excludes source modules, node_modules, tests, sourcemaps, secrets and build metadata. Source remains in this branch. Pinned esbuild, deterministic ZIP metadata and source/build checksums make packaging repeatable; `dist/sha256.txt` records the archive hash. Smaller code does not establish faster provider response times.

Normal CI has read-only contents permission and uploads build artifacts only. A separate one-time workflow is limited to the explicitly approved `v4.0.0-beta.1`, pins the delivered archive SHA-256, verifies draft assets before publication, and does not publish on ordinary code pushes. No npm/store publishing is configured. Source and minified code run the same mock protocol tests. See [TESTING.md](./TESTING.md) for acceptance coverage and limits.

## References and verification limits

[Official native contract, pinned commit](https://github.com/Pylogmon/manggo-plugin/tree/51e617a98df6ae142b0f1595269e55f27f9d3a1f), [host homepage/changelog](https://manggo.pylogmon.cn/#changelog), [official downloads](https://gitcode.com/Pylogmon/Manggo/releases).

The host is closed-source. Contract/runtime/package validation is distinct from actual host import, UI/proxy/cancel behavior and real credentials/provider calls. Those require user acceptance. No undocumented history-database access, host cancellation signal or dynamic settings callback is assumed.

## License

[GNU GPL v3](./LICENSE), preserved from the original project; the old README's MIT label was incorrect. The minified package includes the license; corresponding editable source stays in this branch/commit.
