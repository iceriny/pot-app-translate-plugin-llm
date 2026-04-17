function getI18n(lang, key, ...args) {
  const isEn = lang === "en";
  let t = "";
  switch (key) {
    case "help_text":
      t = isEn
        ? `LLM Translate Plugin Help:\n Enter text directly to translate\n\n Translation:\n $t  [text]   Standard translation\n $p  [text]   Translate & polish\n $f  [text]   Feminine colloquial\n $m  [text]   Masculine colloquial\n\n Pronunciation:\n $r  [text]   Source pronunciation\n $r> [text]   Translated pronunciation\n $r< [text]   Source pronunciation (with translation)\n $r<>[text]   Both pronunciations\n\n Other:\n $q  [question]  Chat with LLM\n ?               Show this help`
        : `LLM 翻译插件帮助:\n 直接输入文本即可翻译\n\n 翻译命令:\n $t  [文本]   标准翻译\n $p  [文本]   翻译并润色，提供直译与润色\n $f  [文本]   女性化口语风格\n $m  [文本]   男性化口语风格\n\n 发音命令:\n $r  [文本]   仅返回原文的发音标注\n $r>[文本]   翻译并返回译文的发音\n $r< [文本]   翻译并返回原文的发音\n $r<>[文本]   返回原文与译文的发音\n\n 其他:\n $q  [问题]   以问答模式与 LLM 对话\n ?            显示此帮助信息`;
      break;
    case "polished_version_not_found":
      t = isEn ? "Polished version not found." : "润色版本未找到。";
      break;
    case "standard_translation":
      t = isEn ? "Standard Translation" : "标准翻译";
      break;
    case "polished_translation":
      t = isEn ? "Polished Version" : "润色版";
      break;
    case "colloquial_expression":
      t = isEn ? "Colloquial Version" : "口语版";
      break;
    case "translation":
      t = isEn ? "Translation" : "翻译";
      break;
    case "pronunciation":
      t = isEn ? "Pronunciation" : "发音";
      break;
    case "source_text":
      t = isEn ? "Source" : "原文";
      break;
    case "source_pronunciation":
      t = isEn ? "Source Pronunciation" : "原文发音";
      break;
    case "target_pronunciation":
      t = isEn ? "Translation Pronunciation" : "译文发音";
      break;
    case "api_response_format_error":
      t = isEn ? "API response format error" : "API响应格式异常";
      break;
    case "json_parse_error":
      t = isEn
        ? "JSON parsing failed, returning original"
        : "JSON解析失败，返回原始内容";
      break;
    case "translate_text_empty":
      t = isEn ? "Translate text cannot be empty" : "翻译文本不能为空";
      break;
    case "target_lang_empty":
      t = isEn ? "Target language cannot be empty" : "目标语言不能为空";
      break;
    case "unsupported_provider":
      t = isEn ? "Unsupported provider: {{$0}}" : "不支持的提供商: {{$0}}";
      break;
    case "api_key_not_configured":
      t = isEn ? "{{$0}} API key not configured" : "{{$0}} API密钥未配置";
      break;
    case "http_error":
      t = isEn ? "HTTP {{$0}}: {{$1}}" : "HTTP {{$0}}: {{$1}}";
      break;
    case "api_request_failed":
      t = isEn
        ? "{{$0}} API request failed: {{$1}}"
        : "{{$0}} API请求失败: {{$1}}";
      break;
    case "plugin_error":
      t = isEn ? "Translate plugin error:" : "翻译插件出错:";
      break;
    case "plugin_error_header":
      t = isEn ? "[Translate Plugin Error]" : "[翻译插件出错]";
      break;
    default:
      t = `[Missing key: ${key}]`;
  }
  if (args.length > 0) {
    args.forEach((arg, i) => {
      t = t.replace(new RegExp(`\\{\\{\\$${i}\\}\\}`, "g"), arg);
    });
  }
  return t;
}

function getLangName(code) {
  if (!code || code === "auto") return null;
  switch (code.toLowerCase().replace(/[-\s]/g, "_")) {
    case "zh_cn":
      return "Simplified Chinese";
    case "zh_tw":
      return "Traditional Chinese";
    case "yue":
      return "Cantonese";
    case "en":
      return "English";
    case "ja":
      return "Japanese";
    case "ko":
      return "Korean";
    case "fr":
      return "French";
    case "de":
      return "German";
    case "es":
      return "Spanish";
    case "pt_pt":
      return "Portuguese";
    case "pt_br":
      return "Brazilian Portuguese";
    case "ru":
      return "Russian";
    case "ar":
      return "Arabic";
    case "it":
      return "Italian";
    case "th":
      return "Thai";
    case "vi":
      return "Vietnamese";
    case "id":
      return "Indonesian";
    case "ms":
      return "Malay";
    case "hi":
      return "Hindi";
    case "tr":
      return "Turkish";
    case "nl":
      return "Dutch";
    case "pl":
      return "Polish";
    case "uk":
      return "Ukrainian";
    case "sv":
      return "Swedish";
    case "da":
      return "Danish";
    case "no":
      return "Norwegian";
    case "fi":
      return "Finnish";
    case "cs":
      return "Czech";
    case "el":
      return "Greek";
    case "hu":
      return "Hungarian";
    case "ro":
      return "Romanian";
    case "bg":
      return "Bulgarian";
    case "he":
      return "Hebrew";
    case "fa":
      return "Persian";
    default:
      return code;
  }
}

function getPhoneticNotation(code) {
  if (!code || code === "auto") return null;
  switch (code.toLowerCase().replace(/[-\s]/g, "_")) {
    case "zh_cn":
    case "zh_tw":
      return "Pinyin";
    case "yue":
      return "Jyutping";
    case "ja":
      return "Romaji";
    case "ko":
      return "Revised Romanization of Korean";
    case "th":
      return "RTGS romanization";
    case "hi":
      return "IAST transliteration";
    case "vi":
      return "Vietnamese IPA with tone marks";
    default:
      return "IPA";
  }
}

function parseInput(text) {
  const match = text.match(/^([>$][^\s]+)\s+/);
  if (match) {
    const key = match[1];
    if (
      [
        "$t",
        ">t",
        "$p",
        "$r",
        "$r>",
        "$r<",
        "$r<>",
        "$f",
        "$cf",
        "$m",
        "$cm",
        "$q",
      ].includes(key)
    ) {
      const normalizedKey =
        key === ">t" ? "$t" : key === "$cf" ? "$f" : key === "$cm" ? "$m" : key;
      return {
        strategyKey: normalizedKey,
        content: text.substring(match[0].length).trim(),
      };
    }
  }
  return { strategyKey: "default", content: text };
}

function buildStrategy(strategyKey, fromLang, toLang) {
  const langName = getLangName(toLang) || toLang;
  let strategy = {
    responseType: "text",
    systemPrompt:
      "You are a professional translator. Produce an accurate, fluent, and natural translation that faithfully preserves the tone, style, register, and intent of the source text. Output ONLY the translated text with no explanation or extra formatting.",
    userPrompt: `Translate the following text into ${langName}:\n`,
    passthrough: false,
  };

  switch (strategyKey) {
    case "$p":
      strategy.responseType = "json";
      strategy.systemPrompt =
        'You are an expert translator and editor. Provide two translation versions as JSON:\n1. "literal": A faithful, accurate translation.\n2. "free": A polished, idiomatic version that reads naturally and elegantly for native speakers while preserving the original meaning.\n\nRespond with ONLY valid JSON: {"literal": "...", "free": "..."}';
      break;
    case "$r":
      const notation = getPhoneticNotation(fromLang);
      strategy.responseType = "json";
      strategy.systemPrompt = notation
        ? `You are a professional linguist. Provide the ${notation} phonetic transcription for the given text. Do NOT translate or paraphrase. Respond with ONLY valid JSON: {"text": "...", "phonetic": "..."}`
        : 'You are a professional linguist. Detect the language of the given text and provide its phonetic transcription using the most appropriate notation system for that language. Do NOT translate. Respond with ONLY valid JSON: {"text": "...", "phonetic": "..."}';
      strategy.userPrompt = `Provide phonetic transcription for:\n`;
      break;
    case "$r>":
      strategy.responseType = "json";
      strategy.systemPrompt = `You are a linguist and translator. Translate the text into ${langName}, then provide the ${getPhoneticNotation(toLang) || "IPA"} phonetic transcription for the TRANSLATED text. Respond with ONLY valid JSON: {"translation": "...", "phonetic": "..."}`;
      break;
    case "$r<":
      const srcNotation = getPhoneticNotation(fromLang);
      strategy.responseType = "json";
      strategy.systemPrompt = srcNotation
        ? `You are a linguist and translator. Translate the text into ${langName}, and provide the ${srcNotation} phonetic transcription for the ORIGINAL text. Respond with ONLY valid JSON: {"translation": "...", "phonetic": "..."}`
        : `You are a linguist and translator. Translate the text into ${langName}. Detect the source language and provide phonetic transcription of the ORIGINAL text using the appropriate notation system. Respond with ONLY valid JSON: {"translation": "...", "phonetic": "..."}`;
      break;
    case "$r<>":
      const tNot = getPhoneticNotation(toLang) || "IPA";
      const sNot = getPhoneticNotation(fromLang);
      strategy.responseType = "json";
      strategy.systemPrompt = sNot
        ? `You are a linguist and translator. Translate the text into ${langName}. Provide phonetic transcriptions: ${sNot} for the original text and ${tNot} for the translated text. Respond with ONLY valid JSON: {"translation": "...", "sourcePhonetic": "...", "targetPhonetic": "..."}`
        : `You are a linguist and translator. Translate the text into ${langName}. Provide two phonetic transcriptions: detect the source language and use its standard notation for the original text; use ${tNot} for the translated text. Respond with ONLY valid JSON: {"translation": "...", "sourcePhonetic": "...", "targetPhonetic": "..."}`;
      break;
    case "$f":
      strategy.responseType = "json";
      strategy.systemPrompt =
        'You are a translator specializing in cultural nuance. Provide two versions as JSON:\n1. "literal": A standard, neutral translation.\n2. "free": A feminine colloquial version — warmer, expressive, using softer language appropriate to the target culture.\n\nRespond with ONLY valid JSON: {"literal": "...", "free": "..."}';
      break;
    case "$m":
      strategy.responseType = "json";
      strategy.systemPrompt =
        'You are a translator specializing in cultural nuance. Provide two versions as JSON:\n1. "literal": A standard, neutral translation.\n2. "free": A masculine colloquial version — direct, concise, assertive, appropriate to the target culture.\n\nRespond with ONLY valid JSON: {"literal": "...", "free": "..."}';
      break;
    case "$q":
      strategy.passthrough = true;
      break;
  }
  return strategy;
}

// ==========================================
// 利用宿主原生 History 数据库作为"只读缓存"
// ==========================================
async function getHostHistoryCache(utils, text, targetLang) {
  if (!utils.Database) return null;
  try {
    // 调用 Tauri 原生 SQL 插件加载宿主的历史数据库
    const db = await utils.Database.load("sqlite:history.db");

    // 直接查询：仅命中本插件服务下相同文本、目标语种的最近一次结果
    const rows = await db.select(
      "SELECT result FROM history WHERE text = $1 AND target = $2 AND service = $3 ORDER BY id DESC LIMIT 1",
      [text, targetLang, "plugin.com.iceriny.llm"],
    );

    if (rows && rows.length > 0 && rows[0].result) {
      return rows[0].result;
    }
  } catch (e) {
    // 静默失败。在极端情况下（比如初次安装无库、表锁死），直接放行到网络请求阶段
  }
  return null;
}

function isReadableStream(stream) {
  return stream && typeof stream.getReader === "function";
}

async function readResponseText(res, onChunk) {
  if (isReadableStream(res.body)) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (typeof onChunk === "function") onChunk(text);
    }
    text += decoder.decode();
    if (typeof onChunk === "function") onChunk(text);
    return text.trim();
  }

  if (typeof res.text === "function") {
    const text = await res.text();
    if (typeof onChunk === "function") onChunk(text);
    return text.trim();
  }

  if (typeof res.data === "string") {
    if (typeof onChunk === "function") onChunk(res.data);
    return res.data.trim();
  }

  if (res.data?.choices?.[0]?.message?.content) {
    const text = res.data.choices[0].message.content;
    if (typeof onChunk === "function") onChunk(text);
    return text.trim();
  }

  return "";
}

// ==========================================
// 核心执行入口 (剥离 Class 包装)
// ==========================================
async function translate(text, from, to, options) {
  const { config, utils, setResult } = options;
  const lang = config.lang || "zh_cn";

  try {
    // 0. 特殊指令处理
    if (text.trim() === "?") return getI18n(lang, "help_text");
    if (!text) throw new Error(getI18n(lang, "translate_text_empty"));
    if (!to) throw new Error(getI18n(lang, "target_lang_empty"));

    // 1. 【核心优化】尝试命中宿主缓存，阻断重复的 LLM 请求
    const cachedResult = await getHostHistoryCache(utils, text, to);
    if (cachedResult) return cachedResult;

    // 2. 验证 API 配置
    const providerConfig = {
      deepseek: {
        url: "https://api.deepseek.com/chat/completions",
        defaultModel: "deepseek-chat",
      },
      siliconflow: {
        url: "https://api.siliconflow.cn/v1/chat/completions",
        defaultModel: "deepseek-ai/DeepSeek-V3.1",
      },
    };
    const providerName = config.provider || "deepseek";
    const pc = providerConfig[providerName];
    if (!pc)
      throw new Error(getI18n(lang, "unsupported_provider", providerName));
    if (!config.apiKey)
      throw new Error(getI18n(lang, "api_key_not_configured", providerName));

    // 3. 构建请求体
    const { strategyKey, content } = parseInput(text);
    const useModel = (config.model || pc.defaultModel).trim();
    const strategy = buildStrategy(strategyKey, from, to);

    let messages = strategy.passthrough
      ? [{ role: "user", content }]
      : [
          { role: "system", content: strategy.systemPrompt },
          { role: "user", content: strategy.userPrompt + content },
        ];

    const body = {
      model: useModel,
      messages,
      temperature: 0.1,
      top_p: 0.99,
      max_tokens: 4000,
      enable_thinking: false,
      ...(strategy.responseType === "json" && {
        response_format: { type: "json_object" },
      }),
    };

    // 兼容 Pot App 不同版本的 Fetch API
    const fetchFn = utils.tauriFetch || (utils.http && utils.http.fetch);
    if (!fetchFn) throw new Error("Fetch method not found in utils");

    const reqBody =
      utils.http && utils.http.Body
        ? utils.http.Body.json(body)
        : { type: "Json", payload: body };

    // 4. 发起网络请求
    const res = await fetchFn(pc.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: reqBody,
    });

    if (typeof res.ok === "boolean" && !res.ok)
      throw new Error(
        getI18n(lang, "http_error", res.status, JSON.stringify(res.data)),
      );

    const messageContent = await readResponseText(res, (partial) => {
      if (typeof setResult === "function") {
        setResult(partial);
      }
    });

    if (!messageContent) {
      throw new Error(getI18n(lang, "api_response_format_error"));
    }

    // 5. 格式化结果
    let finalResult = messageContent;

    if (strategy.responseType === "json") {
      try {
        const json = JSON.parse(messageContent);
        const safe = (v) => (v == null ? "" : `${v}`);
        switch (strategyKey) {
          case "$p":
            finalResult = json.free
              ? `${getI18n(lang, "standard_translation")}:\n${json.literal}\n\n${getI18n(lang, "polished_translation")}:\n${json.free}`
              : getI18n(lang, "polished_version_not_found");
            break;
          case "$f":
          case "$m":
            finalResult = `${getI18n(lang, "standard_translation")}:\n${json.literal}\n\n${getI18n(lang, "colloquial_expression")}:\n${json.free}`;
            break;
          case "$r":
            finalResult = [
              json.text
                ? `${getI18n(lang, "source_text")}:\n${safe(json.text)}`
                : "",
              `${getI18n(lang, "pronunciation")}:\n${safe(json.phonetic)}`,
            ]
              .filter(Boolean)
              .join("\n\n");
            break;
          case "$r>":
            finalResult = [
              `${getI18n(lang, "translation")}:\n${safe(json.translation)}`,
              `${getI18n(lang, "target_pronunciation")}:\n${safe(json.phonetic)}`,
            ].join("\n\n");
            break;
          case "$r<":
            finalResult = [
              `${getI18n(lang, "translation")}:\n${safe(json.translation)}`,
              `${getI18n(lang, "source_pronunciation")}:\n${safe(json.phonetic)}`,
            ].join("\n\n");
            break;
          case "$r<>":
            finalResult = [
              `${getI18n(lang, "translation")}:\n${safe(json.translation)}`,
              `${getI18n(lang, "target_pronunciation")}:\n${safe(json.targetPhonetic)}`,
              `${getI18n(lang, "source_pronunciation")}:\n${safe(json.sourcePhonetic)}`,
            ].join("\n\n");
            break;
          default:
            finalResult = json.translation || messageContent;
        }
      } catch (e) {
        console.warn(getI18n(lang, "json_parse_error"), e.message);
        finalResult = messageContent.replace(/^"|"$/g, "");
      }
    }

    if (typeof setResult === "function") {
      setResult(finalResult);
    }

    // ★ 注意：这里无需执行 setCache。
    // 因为 return 后，宿主软件拿到翻译成功的 finalResult 会自动把它插入 history.db。
    return finalResult;
  } catch (error) {
    console.error(getI18n(lang, "plugin_error"), error);
    return `${getI18n(lang, "plugin_error_header")}\n\n${error.stack || error.message}`;
  }
}
