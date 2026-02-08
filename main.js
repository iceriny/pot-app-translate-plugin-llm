const I18n = {
  init(lang = "zh_cn") {
    this.lang = lang === "en" ? "en" : "zh_cn";
    this.strings = {
      zh_cn: {
        help_text: `LLM 翻译插件帮助:
  直接输入文本即可翻译（默认模式）

  翻译命令:
  $t  [文本]   标准翻译（同默认模式）
  $p  [文本]   翻译并润色，提供直译与润色两个版本
  $f  [文本]   女性化口语风格翻译
  $m  [文本]   男性化口语风格翻译

  发音命令（自动适配语言: 中文→拼音 日语→罗马字 韩语→罗马字转写 其他→IPA）:
  $r  [文本]   仅返回原文的发音标注（不翻译）
  $r> [文本]   翻译并返回译文的发音标注
  $r< [文本]   翻译并返回原文的发音标注
  $r<>[文本]   翻译并返回原文与译文的发音标注

  其他:
  $q  [问题]   以问答模式与 LLM 对话（非翻译）
  ?            显示此帮助信息`,
        polished_version_not_found: "润色版本未找到。",
        standard_translation: "标准翻译",
        polished_translation: "润色版",
        colloquial_expression: "口语版",
        translation: "翻译",
        pronunciation: "发音",
        source_text: "原文",
        source_pronunciation: "原文发音",
        target_pronunciation: "译文发音",
        api_response_format_error: "API响应格式异常",
        json_parse_error: "JSON解析失败，返回原始内容",
        translate_text_empty: "翻译文本不能为空",
        target_lang_empty: "目标语言不能为空",
        unsupported_provider: "不支持的提供商: {{$0}}",
        api_key_not_configured: "{{$0}} API密钥未配置",
        http_error: "HTTP {{$0}}: {{$1}}",
        api_request_failed: "{{$0}} API请求失败: {{$1}}",
        plugin_error: "翻译插件出错:",
        plugin_error_header: "[翻译插件出错]",
      },
      en: {
        help_text: `LLM Translate Plugin Help:
  Enter text directly to translate (default mode)

  Translation:
  $t  [text]   Standard translation (same as default)
  $p  [text]   Translate & polish, literal + polished versions
  $f  [text]   Feminine colloquial style translation
  $m  [text]   Masculine colloquial style translation

  Pronunciation (auto-adapts: Chinese→Pinyin, Japanese→Romaji, Korean→RR, Others→IPA):
  $r  [text]   Pronunciation of source text only (no translation)
  $r> [text]   Translate + pronunciation of translated text
  $r< [text]   Translate + pronunciation of source text
  $r<>[text]   Translate + pronunciation of both

  Other:
  $q  [question]  Chat with LLM (non-translation)
  ?               Show this help`,
        polished_version_not_found: "Polished version not found.",
        standard_translation: "Standard Translation",
        polished_translation: "Polished Version",
        colloquial_expression: "Colloquial Version",
        translation: "Translation",
        pronunciation: "Pronunciation",
        source_text: "Source",
        source_pronunciation: "Source Pronunciation",
        target_pronunciation: "Translation Pronunciation",
        api_response_format_error: "API response format error",
        json_parse_error: "JSON parsing failed, returning original content",
        translate_text_empty: "Translate text cannot be empty",
        target_lang_empty: "Target language cannot be empty",
        unsupported_provider: "Unsupported provider: {{$0}}",
        api_key_not_configured: "{{$0}} API key not configured",
        http_error: "HTTP {{$0}}: {{$1}}",
        api_request_failed: "{{$0}} API request failed: {{$1}}",
        plugin_error: "Translate plugin error:",
        plugin_error_header: "[Translate Plugin Error]",
      },
    };
  },
  get(key, ...args) {
    const langStrings = this.strings[this.lang] || this.strings.zh_cn;
    let template = langStrings[key] || `[Missing I18n key: ${key}]`;

    if (args.length > 0) {
      args.forEach((arg, index) => {
        const placeholder = new RegExp(`\\{\\{\\$${index}\\}\\}`, "g");
        template = template.replace(placeholder, arg);
      });
    }
    return template;
  },
};

class LLMTranslator {
  constructor(options) {
    this.config = options.config;
    this.utils = options.utils;
    this.i18n = Object.create(I18n);
    this.i18n.init(this.config.lang);

    // ── 语言名称映射 ──
    this._langNames = {
      zh_cn: "Simplified Chinese",
      zh_tw: "Traditional Chinese",
      yue: "Cantonese",
      en: "English",
      ja: "Japanese",
      ko: "Korean",
      fr: "French",
      de: "German",
      es: "Spanish",
      pt_pt: "Portuguese",
      pt_br: "Brazilian Portuguese",
      ru: "Russian",
      ar: "Arabic",
      it: "Italian",
      th: "Thai",
      vi: "Vietnamese",
      id: "Indonesian",
      ms: "Malay",
      hi: "Hindi",
      tr: "Turkish",
      nl: "Dutch",
      pl: "Polish",
      uk: "Ukrainian",
      sv: "Swedish",
      da: "Danish",
      no: "Norwegian",
      fi: "Finnish",
      cs: "Czech",
      el: "Greek",
      hu: "Hungarian",
      ro: "Romanian",
      bg: "Bulgarian",
      he: "Hebrew",
      fa: "Persian",
    };

    // ── 语言 → 发音标注系统映射 ──
    this._phoneticSystems = {
      zh_cn: "Pinyin",
      zh_tw: "Pinyin",
      yue: "Jyutping",
      ja: "Romaji",
      ko: "Revised Romanization of Korean",
      th: "RTGS romanization",
      hi: "IAST transliteration",
      vi: "Vietnamese IPA with tone marks",
    };

    // ── 策略定义 ──
    const defaultPrompt =
      "You are a professional translator. Produce an accurate, fluent, and natural translation that faithfully preserves the tone, style, register, and intent of the source text. Output ONLY the translated text with no explanation or extra formatting.";

    this.strategies = {
      default: defaultPrompt,
      $t: defaultPrompt,

      // $p: 翻译并润色，返回直译 + 意译
      $p: {
        prompt:
          'You are an expert translator and editor. Provide two translation versions as JSON:\n1. "literal": A faithful, accurate translation.\n2. "free": A polished, idiomatic version that reads naturally and elegantly for native speakers while preserving the original meaning.\n\nRespond with ONLY valid JSON: {"literal": "...", "free": "..."}',
        responseType: "json",
      },

      // $r 系列: 发音标注策略（动态适配语言）
      $r: {
        prompt: (fromLang) => {
          const notation = this._getPhoneticNotation(fromLang);
          if (!notation) {
            return 'You are a professional linguist. Detect the language of the given text and provide its phonetic transcription using the most appropriate notation system for that language (e.g., Pinyin for Chinese, Romaji for Japanese, IPA for English and European languages). Do NOT translate. Respond with ONLY valid JSON: {"text": "...", "phonetic": "..."}';
          }
          return `You are a professional linguist. Provide the ${notation} phonetic transcription for the given text. Do NOT translate or paraphrase. Respond with ONLY valid JSON: {"text": "...", "phonetic": "..."}`;
        },
        responseType: "json",
        buildUserPrompt: (content) =>
          `Provide phonetic transcription for:\n${content}`,
      },
      "$r>": {
        prompt: (fromLang, toLang) => {
          const notation = this._getPhoneticNotation(toLang) || "IPA";
          const langName = this._getLangName(toLang) || toLang;
          return `You are a linguist and translator. Translate the text into ${langName}, then provide the ${notation} phonetic transcription for the TRANSLATED text. Respond with ONLY valid JSON: {"translation": "...", "phonetic": "..."}`;
        },
        responseType: "json",
      },
      "$r<": {
        prompt: (fromLang, toLang) => {
          const langName = this._getLangName(toLang) || toLang;
          const notation = this._getPhoneticNotation(fromLang);
          if (!notation) {
            return `You are a linguist and translator. Translate the text into ${langName}. Detect the source language and provide phonetic transcription of the ORIGINAL text using the appropriate notation system for that language. Respond with ONLY valid JSON: {"translation": "...", "phonetic": "..."}`;
          }
          return `You are a linguist and translator. Translate the text into ${langName}, and provide the ${notation} phonetic transcription for the ORIGINAL text. Respond with ONLY valid JSON: {"translation": "...", "phonetic": "..."}`;
        },
        responseType: "json",
      },
      "$r<>": {
        prompt: (fromLang, toLang) => {
          const langName = this._getLangName(toLang) || toLang;
          const tgtNotation = this._getPhoneticNotation(toLang) || "IPA";
          const srcNotation = this._getPhoneticNotation(fromLang);
          if (!srcNotation) {
            return `You are a linguist and translator. Translate the text into ${langName}. Provide two phonetic transcriptions: detect the source language and use its standard notation for the original text; use ${tgtNotation} for the translated text. Respond with ONLY valid JSON: {"translation": "...", "sourcePhonetic": "...", "targetPhonetic": "..."}`;
          }
          return `You are a linguist and translator. Translate the text into ${langName}. Provide phonetic transcriptions: ${srcNotation} for the original text and ${tgtNotation} for the translated text. Respond with ONLY valid JSON: {"translation": "...", "sourcePhonetic": "...", "targetPhonetic": "..."}`;
        },
        responseType: "json",
      },

      // $f: 女性化口语风格
      $f: {
        prompt:
          'You are a translator specializing in cultural nuance. Provide two versions as JSON:\n1. "literal": A standard, neutral translation.\n2. "free": A feminine colloquial version — warmer, expressive, using softer language appropriate to the target culture.\n\nRespond with ONLY valid JSON: {"literal": "...", "free": "..."}',
        responseType: "json",
      },

      // $m: 男性化口语风格
      $m: {
        prompt:
          'You are a translator specializing in cultural nuance. Provide two versions as JSON:\n1. "literal": A standard, neutral translation.\n2. "free": A masculine colloquial version — direct, concise, assertive, appropriate to the target culture.\n\nRespond with ONLY valid JSON: {"literal": "...", "free": "..."}',
        responseType: "json",
      },

      // $q: 普通问答
      $q: {
        passthrough: true,
      },
    };

    // 向后兼容旧命令
    this.strategies[">t"] = this.strategies.$t;
    this.strategies["$cf"] = this.strategies.$f;
    this.strategies["$cm"] = this.strategies.$m;

    // ── 服务商配置 ──
    this.providers = {
      deepseek: {
        url: "https://api.deepseek.com/chat/completions",
        defaultModel: "deepseek-chat",
        responseFormat: "json_object",
      },
      siliconflow: {
        url: "https://api.siliconflow.cn/v1/chat/completions",
        defaultModel: "deepseek-ai/DeepSeek-V3.1",
        responseFormat: "json_object",
      },
    };
  }

  // ── 辅助方法 ──

  /**
   * 获取语言的可读名称
   * @param {string} code - 语言代码 (如 "zh_cn", "en", "ja")
   * @returns {string|null}
   */
  _getLangName(code) {
    if (!code || code === "auto") return null;
    const key = code.toLowerCase().replace(/[-\s]/g, "_");
    return this._langNames[key] || code;
  }

  /**
   * 获取语言对应的发音标注系统
   * @param {string} langCode - 语言代码
   * @returns {string|null} 标注系统名称，未知语言返回 null
   */
  _getPhoneticNotation(langCode) {
    if (!langCode || langCode === "auto") return null;
    const key = langCode.toLowerCase().replace(/[-\s]/g, "_");
    return this._phoneticSystems[key] || "IPA";
  }

  /**
   * 解析用户输入，分离策略和真实待翻译文本
   * @param {string} text 原始输入
   * @returns {{strategyKey: string, content: string}}
   */
  _parseInput(text) {
    const match = text.match(/^([>$][^\s]+)\s+/);
    if (match && this.strategies[match[1]]) {
      return {
        strategyKey: match[1],
        content: text.substring(match[0].length).trim(),
      };
    }
    return { strategyKey: "default", content: text };
  }

  /**
   * 构建 API 请求的 messages
   * @param {string} strategyKey - 策略键
   * @param {string} content - 待处理文本
   * @param {string} fromLang - 源语言
   * @param {string} toLang - 目标语言
   * @returns {Array<Object>}
   */
  _buildMessages(strategyKey, content, fromLang, toLang) {
    const strategy = this.strategies[strategyKey] || this.strategies.default;
    if (typeof strategy === "object" && strategy.passthrough) {
      return [{ role: "user", content }];
    }

    let systemPrompt;
    if (typeof strategy === "string") {
      systemPrompt = strategy;
    } else if (typeof strategy.prompt === "function") {
      systemPrompt = strategy.prompt(fromLang, toLang);
    } else {
      systemPrompt = strategy.prompt;
    }

    const langName = this._getLangName(toLang) || toLang;
    const userPrompt =
      typeof strategy === "object" &&
      typeof strategy.buildUserPrompt === "function"
        ? strategy.buildUserPrompt(content, toLang)
        : `Translate the following text into ${langName}:\n${content}`;

    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];
  }

  /**
   * 处理 API 响应
   * @param {Object} responseData - API 返回的数据
   * @param {string} responseFormat - 期望的响应格式
   * @param {string} strategyKey - 使用的策略键
   * @returns {string} 处理后的文本
   */
  _processResponse(responseData, responseFormat, strategyKey) {
    if (!responseData.choices?.[0]?.message) {
      throw new Error(this.i18n.get("api_response_format_error"));
    }

    const messageContent = responseData.choices[0].message.content.trim();

    if (responseFormat === "json_object") {
      try {
        const json = JSON.parse(messageContent);
        switch (strategyKey) {
          case "$p":
            if (!json.free) return this.i18n.get("polished_version_not_found");
            return `${this.i18n.get("standard_translation")}:\n${json.literal}\n\n${this.i18n.get("polished_translation")}:\n${json.free}`;
          case "$cf":
          case "$cm":
          case "$f":
          case "$m":
            return `${this.i18n.get("standard_translation")}:\n${json.literal}\n\n${this.i18n.get("colloquial_expression")}:\n${json.free}`;
          case "$r":
          case "$r>":
          case "$r<":
          case "$r<>":
            return this._formatPhoneticsResponse(
              strategyKey,
              json,
              messageContent
            );
          default:
            return json.translation || messageContent;
        }
      } catch (e) {
        console.warn(this.i18n.get("json_parse_error"), e.message);
        return messageContent.replace(/^"|"$/g, "");
      }
    }

    return messageContent;
  }

  /**
   * 格式化发音标注响应
   */
  _formatPhoneticsResponse(strategyKey, payload, fallback) {
    const safe = (v) => (v == null ? "" : `${v}`);
    const sections = [];

    switch (strategyKey) {
      case "$r":
        if (payload.text) {
          sections.push(
            `${this.i18n.get("source_text")}:\n${safe(payload.text)}`
          );
        }
        sections.push(
          `${this.i18n.get("pronunciation")}:\n${safe(payload.phonetic)}`
        );
        break;
      case "$r>":
        sections.push(
          `${this.i18n.get("translation")}:\n${safe(payload.translation)}`
        );
        sections.push(
          `${this.i18n.get("target_pronunciation")}:\n${safe(payload.phonetic)}`
        );
        break;
      case "$r<":
        sections.push(
          `${this.i18n.get("translation")}:\n${safe(payload.translation)}`
        );
        sections.push(
          `${this.i18n.get("source_pronunciation")}:\n${safe(payload.phonetic)}`
        );
        break;
      case "$r<>":
        sections.push(
          `${this.i18n.get("translation")}:\n${safe(payload.translation)}`
        );
        sections.push(
          `${this.i18n.get("target_pronunciation")}:\n${safe(payload.targetPhonetic)}`
        );
        sections.push(
          `${this.i18n.get("source_pronunciation")}:\n${safe(payload.sourcePhonetic)}`
        );
        break;
      default:
        return fallback;
    }

    return sections
      .filter((section) => section && section.trim().length)
      .join("\n\n");
  }

  /**
   * 主翻译函数
   */
  async translate(text, from, to) {
    // 0. 帮助指令
    if (text.trim() === "?") {
      return this.i18n.get("help_text");
    }

    // 1. 输入验证
    if (!text || typeof text !== "string")
      throw new Error(this.i18n.get("translate_text_empty"));
    if (!to || typeof to !== "string")
      throw new Error(this.i18n.get("target_lang_empty"));

    // 2. 获取配置
    const { provider = "deepseek", apiKey, model } = this.config;
    const providerConfig = this.providers[provider];

    if (!providerConfig)
      throw new Error(this.i18n.get("unsupported_provider", provider));
    if (!apiKey)
      throw new Error(this.i18n.get("api_key_not_configured", provider));

    // 3. 预处理 -> 解析输入
    const { strategyKey, content } = this._parseInput(text);

    // 4. 策略选择 -> 构建请求体
    const strategy = this.strategies[strategyKey] || this.strategies.default;
    const messages = this._buildMessages(strategyKey, content, from, to);

    // 默认返回 text, 仅当策略明确要求时才使用 json
    const responseFormat =
      typeof strategy === "object" && strategy.responseType === "json"
        ? "json_object"
        : "text";

    const body = {
      model: (model || providerConfig.defaultModel).trim(),
      messages,
      temperature: 0.1,
      top_p: 0.99,
      max_tokens: 4000,
      ...(responseFormat === "json_object" && {
        response_format: { type: "json_object" },
      }),
    };

    // 5. 执行 -> 发送API请求
    const { tauriFetch: fetch } = this.utils;
    try {
      const res = await fetch(providerConfig.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: { type: "Json", payload: body },
      });

      if (res.ok) {
        // 6. 后处理 -> 解析和格式化输出
        return this._processResponse(res.data, responseFormat, strategyKey);
      } else {
        throw new Error(
          this.i18n.get("http_error", res.status, JSON.stringify(res.data))
        );
      }
    } catch (error) {
      throw new Error(
        this.i18n.get("api_request_failed", provider, error.message)
      );
    }
  }
}

async function translate(text, from, to, options) {
  try {
    const translator = new LLMTranslator(options);
    return await translator.translate(text, from, to);
  } catch (error) {
    const i18n = Object.create(I18n);
    i18n.init(options.config.lang);
    console.error(i18n.get("plugin_error"), error);
    return `${i18n.get("plugin_error_header")}\n\n${
      error.stack || error.message
    }`;
  }
}
