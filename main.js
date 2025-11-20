const I18n = {
  init(lang = "zh_cn") {
    this.lang = lang === "en" ? "en" : "zh_cn";
    this.strings = {
      zh_cn: {
        help_text: `LLM 翻译插件帮助:
- 默认: 直接输入文本进行翻译。
- >t [文本]: 执行标准翻译, 也是默认策略。
- $p [文本]: 翻译并润色，返回更优美的结果。
- $r [文本]: 翻译并提供国际音标 (IPA)。
- $cf [文本]: 提供女性化的口语翻译。
- $cm [文本]: 提供男性化的口语翻译。
- $q [问题]: 这将作为LLM的普通的普通的问答形式, 而非翻译。
- ?: 显示此帮助信息。`,
        polished_version_not_found: "润色版本未找到。",
        standard_translation: "标准翻译",
        colloquial_expression: "口语化表达",
        translation: "翻译",
        ipa: "音标 (IPA)",
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
- Default: Enter text directly to translate.
- >t [text]: Perform standard translation.
- $p [text]: Translate and polish for a more elegant result.
- $r [text]: Translate and provide International Phonetic Alphabet (IPA).
- $cf [text]: Provide a colloquial, feminine-style translation.
- $cm [text]: Provide a colloquial, masculine-style translation.
- ?: Display this help message.`,
        polished_version_not_found: "Polished version not found.",
        standard_translation: "Standard Translation",
        colloquial_expression: "Colloquial Expression",
        translation: "Translation",
        ipa: "IPA",
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

    // 策略定义：引导符号 -> 系统提示词
    this.strategies = {
      // 默认策略：专注于质量和风格匹配
      default:
        "You are a master translator. Your goal is to produce a translation that is accurate, fluent, and natural. Faithfully convey the tone, style, and intent of the original text. If the original is formal, the translation should be formal. If it's colloquial, the translation should be colloquial. Avoid any awkward, machine-like phrasing. Your entire output must be only the translated text.",
      ">t": "You are a master translator. Your goal is to produce a translation that is accurate, fluent, and natural. Faithfully convey the tone, style, and intent of the original text. If the original is formal, the translation should be formal. If it's colloquial, the translation should be colloquial. Avoid any awkward, machine-like phrasing. Your entire output must be only the translated text.",

      // $p: 翻译并润色
      $p: {
        prompt: `You are an expert translator and copy-editor. Your task is to provide two versions of the translation in a single JSON object.
1.  **literal**: A standard, faithful, and accurate translation of the original text.
2.  **free**: A polished and refined version of the first translation. This version should be more idiomatic, natural, and engaging for a native speaker, improving flow and readability.

Your response MUST be a single, valid JSON object in the format: \`{"literal": "...", "free": "..."}\`. Do not include any text, explanation, or markdown formatting outside this JSON object.`,
        responseType: "json",
      },

      // $r: 翻译并提供音标
      $r: {
        prompt: `You are a linguist and translator. Your task is to translate the text and provide the International Phonetic Alphabet (IPA) transcription for the **translated text**. Respond with a single, valid JSON object.
1.  **literal**: The translated text.
2.  **free**: The IPA transcription for the translated text. For languages with dialect variations, use a standard, widely-understood form (e.g., General American for US English).

Your response MUST be in the format: \`{"literal": "...", "free": "..."}\`. Do not include any text, explanation, or markdown formatting outside this JSON object.`,
        responseType: "json",
      },

      // $cf: 翻译为标准版和女性化口语版
      $cf: {
        prompt: `You are a translator specializing in cultural and social nuance. Your task is to provide two versions of the translation in a single JSON object, reflecting different communication styles.
1.  **literal**: A standard, neutral translation.
2.  **free**: A colloquial version adapted to a typically **feminine** communication style. This version might be warmer, more expressive, or use softer language, depending on the context and the target language's culture.

Your response MUST be a single, valid JSON object in the format: \`{"literal": "...", "free": "..."}\`. Do not include any text, explanation, or markdown formatting outside this JSON object.`,
        responseType: "json",
      },

      // $cm: 翻译为标准版和男性化口语版
      $cm: {
        prompt: `You are a translator specializing in cultural and social nuance. Your task is to provide two versions of the translation in a single JSON object, reflecting different communication styles.
1.  **literal**: A standard, neutral translation.
2.  **free**: A colloquial version adapted to a typically **masculine** communication style. This version might be more direct, concise, or assertive, depending on the context and the target language's culture.

Your response MUST be a single, valid JSON object in the format: \`{"literal": "...", "free": "..."}\`. Do not include any text, explanation, or markdown formatting outside this JSON object.`,
        responseType: "json",
      },

      // $q: 普通问答，无额外系统提示词
      $q: {
        passthrough: true,
      },
    };

    // 服务商配置
    this.providers = {
      deepseek: {
        url: "https://api.deepseek.com/chat/completions",
        defaultModel: "deepseek-chat",
        responseFormat: "json_object", // 明确支持json模式
      },
      siliconflow: {
        url: "https://api.siliconflow.cn/v1/chat/completions",
        defaultModel: "deepseek-ai/DeepSeek-V3.1",
        responseFormat: "json_object",
      },
      // 可以继续添加更多服务商
    };
  }

  /**
   * 解析用户输入，分离策略和真实待翻译文本
   * @param {string} text 原始输入
   * @returns {{strategyKey: string, content: string}}
   */
  _parseInput(text) {
    const match = text.match(/^([>$]\w+)\s/);
    if (match && this.strategies[match[1]]) {
      return {
        strategyKey: match[1],
        content: text.substring(match[0].length),
      };
    }
    return { strategyKey: "default", content: text };
  }

  /**
   * 构建 API 请求的 messages
   * @param {string} strategyKey - 策略键
   * @param {string} content - 待处理文本
   * @param {string} toLang - 目标语言
   * @returns {Array<Object>}
   */
  _buildMessages(strategyKey, content, toLang) {
    const strategy = this.strategies[strategyKey] || this.strategies.default;
    if (typeof strategy === "object" && strategy.passthrough) {
      return [{ role: "user", content }];
    }

    const systemPrompt =
      typeof strategy === "string" ? strategy : strategy.prompt;
    const userPrompt = `Translate into ${toLang}:\n${content}`;

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
    if (
      !responseData.choices ||
      !responseData.choices[0] ||
      !responseData.choices[0].message
    ) {
      throw new Error(this.i18n.get("api_response_format_error"));
    }

    const messageContent = responseData.choices[0].message.content.trim();

    if (responseFormat === "json_object") {
      try {
        const jsonResponse = JSON.parse(messageContent);
        switch (strategyKey) {
          case "$p":
            return (
              jsonResponse.free || this.i18n.get("polished_version_not_found")
            );
          case "$cf":
          case "$cm":
            return `${this.i18n.get("standard_translation")}:\n${
              jsonResponse.literal
            }\n\n${this.i18n.get("colloquial_expression")}:\n${
              jsonResponse.free
            }`;
          case "$r":
            return `${this.i18n.get("translation")}:\n${
              jsonResponse.literal
            }\n\n${this.i18n.get("ipa")}:\n${jsonResponse.free}`;
          default:
            return jsonResponse.translation || messageContent;
        }
      } catch (e) {
        console.warn(this.i18n.get("json_parse_error"), e.message);
        return messageContent.replace(/^"|"$/g, ""); // 移除可能的引号
      }
    }

    return messageContent;
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
    const messages = this._buildMessages(strategyKey, content, to);

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
