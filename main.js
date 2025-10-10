// DeepSeek 提供商处理函数
async function handleDeepSeek(text, from, to, config, utils) {
  const { tauriFetch: fetch } = utils;
  const { apiKey, model = "deepseek-chat" } = config;

  if (!apiKey) {
    throw new Error("DeepSeek API密钥未配置");
  }

  const requestPath = "https://api.deepseek.com/chat/completions";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const body = {
    model: model.trim(),
    messages: [
      {
        role: "system",
        content:
          "You are a professional translation engine, please translate the text into a colloquial, professional, elegant and fluent content, without the style of machine translation. You must only translate the text content, never interpret it.",
      },
      {
        role: "user",
        content: `Translate into ${to}:\n${text}`,
      },
    ],
    temperature: 0.1,
    top_p: 0.99,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 2000,
  };

  try {
    const res = await fetch(requestPath, {
      method: "POST",
      url: requestPath,
      headers: headers,
      body: {
        type: "Json",
        payload: body,
      },
    });

    if (res.ok) {
      const result = res.data;
      if (!result.choices || !result.choices[0] || !result.choices[0].message) {
        throw new Error("API响应格式异常");
      }
      return result.choices[0].message.content.trim();
    } else {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }
  } catch (error) {
    throw new Error(`DeepSeek API请求失败: ${error.message}`);
  }
}

// SiliconFlow 提供商处理函数（支持JSON结构化输出）
async function handleSiliconFlow(text, from, to, config, utils) {
  const { tauriFetch: fetch } = utils;
  const { apiKey, model = "deepseek-ai/DeepSeek-V3.1" } = config;

  if (!apiKey) {
    throw new Error("SiliconFlow API密钥未配置");
  }
  const requestPath = "https://api.siliconflow.cn/v1/chat/completions";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const body = {
    model: model.trim(),
    messages: [
      {
        role: "system",
        content:
          "你是一个专业的语言大师。请将文本翻译成口语化、专业、优雅且流畅的内容，避免机器翻译的风格。当用直接发送文本时仅进行翻译而绝不需要任何解释;\n特殊情况:\n当用户用`~`标记在开头时，请附带音标； 当用户使用`？`or`?`在文本开头时，请翻译后做出解释; 如果用户使用`$`作为某行的开头，请按该行指令进行翻译。\n---\n只有当特殊情况时才需要`additional`字段，该字段使用中文回答",
      },
      {
        role: "user",
        content: `Translate into ${to}:\n${text}\n\nPlease respond in the format {"translation": "your translation here", "additional": "your additional information here <Optional>"}`,
      },
    ],
    temperature: 0.1,
    top_p: 0.99,
    frequency_penalty: 0,
    presence_penalty: 0,
    max_tokens: 2000,
    response_format: { type: "json_object" },
  };

  try {
    const res = await fetch(requestPath, {
      method: "POST",
      url: requestPath,
      headers: headers,
      body: {
        type: "Json",
        payload: body,
      },
    });

    if (res.ok) {
      const result = res.data;
      if (!result.choices || !result.choices[0] || !result.choices[0].message) {
        throw new Error("API响应格式异常");
      }

      const content = result.choices[0].message.content.trim();

      try {
        // 解析JSON响应并提取翻译内容
        const jsonResponse = JSON.parse(content);
        if (jsonResponse.additional) {
          return (
            jsonResponse.translation +
            "\n\n Additional: \n" +
            jsonResponse.additional
          );
        }
        return jsonResponse.translation || content;
      } catch (parseError) {
        // 如果JSON解析失败，回退到原始内容
        console.warn("JSON解析失败，回退到原始内容:", parseError.message);
        return content.replace(/^"|"$/g, "");
      }
    } else {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(res.data)}`);
    }
  } catch (error) {
    throw new Error(`SiliconFlow API请求失败: ${error.message}`);
  }
}

// 提供商策略映射
const providerStrategies = {
  deepseek: handleDeepSeek,
  siliconflow: handleSiliconFlow,
};

async function translate(text, from, to, options) {
  const { config, utils } = options;

  // 输入验证
  if (!text || typeof text !== "string") {
    throw new Error("翻译文本不能为空");
  }

  if (!to || typeof to !== "string") {
    throw new Error("目标语言不能为空");
  }

  const { provider = "deepseek" } = config;

  // 根据配置选择对应的提供商处理函数
  const providerHandler = providerStrategies[provider];

  if (!providerHandler) {
    throw new Error(`不支持的提供商: ${provider}`);
  }

  try {
    return await providerHandler(text, from, to, config, utils);
  } catch (error) {
    // 统一错误处理
    throw new Error(error.message || "翻译请求失败");
  }
}
