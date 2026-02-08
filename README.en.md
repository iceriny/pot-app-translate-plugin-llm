# Pot AI Translate Plugin

[中文](./README.md) | English

A translation plugin for [pot](https://github.com/pot-app/pot-app), leveraging Large Language Models (LLMs) to provide high-quality, multi-strategy translation services.

## ✨ Features

- **Multi-Provider Support**: Easily switch between various LLM providers like DeepSeek, SiliconFlow, etc.
- **Flexible Translation Strategies**: Achieve more than just translation with simple prefix commands.
  - `Default`: High-quality regular translation.
  - `>t`: Standard translation that preserves the tone and style of the original text.
  - `$p`: **Translate & Polish**, making the translation more fluent and idiomatic.
  - `$r` / `$r>` / `$r<` / `$r<>`: **Multiple IPA modes** for source text, translated text, or both.
  - `$cf` / `$cm`: **Provide Stylized Colloquial Translations**, offering options for feminine or masculine tones.
  - `$q`: **LLM Q&A Mode:** Convenient short queries to LLM without chat history
- **Highly Configurable**: Supports custom model names to accommodate various models from different providers.
- **Internationalization (i18n)**: The plugin's UI, help text, and error messages support both Chinese and English.
- **Built-in Help**: Simply type `?` to get help information for all available commands.

## 🚀 Installation

1. Go to the [Releases](https://github.com/iceriny/pot-app-translate-plugin-llm/releases) page.
2. Download the latest plugin file with the `.potext` extension.
3. Open the pot application, go to `Settings` -> `Plugins` -> `Install Plugin`, and select the downloaded `.potext` file.

## ⚙️ Configuration

After installing the plugin, please configure it in pot's plugin settings interface:

| Option                      | Description                                                 | Example                     |
| --------------------------- | ----------------------------------------------------------- | --------------------------- |
| `提供商/Provider`           | Select the AI provider you want to use.                     | `deepseek` or `siliconflow` |
| `模型名称/Model Name`       | Enter the model ID provided by the service provider.        | `deepseek-chat`             |
| `API密钥/API Key`           | Your API key from the provider.                             | `sk-xxxxxxxx`               |
| `显示语言/Display Language` | The language for the plugin's help text and error messages. | `zh_cn` or `en`             |

## 📖 Usage

Activate different features by adding prefixes in pot's input box.

#### 1. Default Translation

Simply enter the text you want to translate.

```
Hello World
```

> 你好，世界

---

#### 2. Translate & Polish (`$p`)

Use the `$p ` prefix, and the plugin will return a polished, more natural-sounding translation.

**Input:**

```
$p The company's innovative strategy led to a paradigm shift in the market.
```

**Output:**

> The company's groundbreaking strategy completely reshaped the market.

_(Note: The `$p` strategy only returns the polished version.)_

---

#### 3. Phonetics Modes (`$r` / `$r>` / `$r<` / `$r<>`)

- `$r`: Return only the IPA for the source text (no translation).
- `$r>`: Translate and return the IPA for the translated text.
- `$r<`: Translate and return the IPA for the source text.
- `$r<>`: Translate and return IPAs for both the source and translated text.

**Input:**

```
$r<> Hello
```

**Output:**

```
Translation:
你好

Translated IPA:
nǐ xàu

Source Text:
Hello

Source IPA:
həˈloʊ
```

---

#### 4. Provide Colloquial Translation (`$cf` / `$cm`)

Use the `$cf ` (feminine) or `$cm ` (masculine) prefix, and the plugin will provide a standard translation along with a stylized colloquial version.

**Input:**

```
$cf That's great!
```

**Output:**

```
Standard Translation:
That's great!

Colloquial Expression:
Oh, that's just wonderful!
```

---

#### 5. Get Help (`?`)

Enter `?` in the input box and press Enter to view help information for all available commands.

## 🛠️ Development

1. Clone this repository.
2. Run `python pack.py` to package the plugin.
3. The generated `.potext` file will be in the `dist` directory.

## 📄 License

[MIT](./LICENSE)
