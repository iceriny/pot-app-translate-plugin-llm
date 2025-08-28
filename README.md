# AI 翻译插件 (Pot App)

一个支持多种 AI 提供商的高质量翻译插件，为 [Pot App](https://github.com/pot-app/pot-app) 提供强大的 AI 翻译能力。

## ✨ 特色功能

### 🚀 多提供商支持

-   **DeepSeek**: 支持官方所有模型，如 `deepseek-chat` 和 `deepseek-reasoner`
-   **SiliconFlow**: 支持平台所有模型，如 `deepseek-ai/DeepSeek-V3.1`、`Qwen/Qwen2.5-72B-Instruct` 等，配备 JSON 结构化输出

### 🎯 智能架构

-   **策略模式设计**: 根据配置自动切换不同的 AI 提供商
-   **结构化输出**: SiliconFlow 提供商支持 JSON 模式，确保翻译结果更加准确
-   **统一接口**: 所有提供商使用相同的配置参数和调用方式
-   **智能验证**: 完善的输入验证和错误处理机制
-   **自定义模型**: 支持任意模型名称，满足个性化需求

### 🌍 广泛语言支持

支持 20+ 种语言的互译，包括：

-   中文（简体/繁体）、英语、日语、韩语
-   法语、西班牙语、俄语、德语、意大利语
-   阿拉伯语、印地语、泰语、越南语等

## 📋 前置要求

-   [Pot App](https://github.com/pot-app/pot-app) - 主应用程序
-   API 密钥（根据选择的提供商）:
    -   [DeepSeek API](https://platform.deepseek.com/usage)
    -   [SiliconFlow API](https://cloud.siliconflow.cn/)

## 🛠️ 安装方法

### 方式一：使用预编译插件

1. 下载最新的 `plugin.com.iceriny.llm.potext` 文件
2. 在 Pot App 中：
    - 打开「偏好设置」→「服务设置」
    - 点击「翻译 - 添加外部插件」
    - 选择下载的 `.potext` 文件进行安装

### 方式二：从源码构建

```bash
# 克隆仓库
git clone https://github.com/iceriny/pot-app-translate-plugin-llm.git
cd pot-app-translate-plugin-llm

# 打包插件
python pack.py

# 安装生成的 dist/plugin.com.iceriny.llm.potext 文件
```

## ⚙️ 配置说明

安装插件后，在设置中配置以下参数：

### 1. 选择提供商

-   `deepseek`: 使用 DeepSeek 官方 API
-   `siliconflow`: 使用硅基流动平台 API

### 2. 输入模型名称

支持任意模型名称，常用选项包括：

-   **deepseek-chat**: 通用对话模型，响应速度快（DeepSeek 官方）
-   **deepseek-reasoner**: 推理增强模型，逻辑性更强（DeepSeek 官方）
-   **deepseek-ai/DeepSeek-V3.1**: 高性能模型（SiliconFlow 平台）
-   **Qwen/Qwen2.5-72B-Instruct**: 通义千问模型（SiliconFlow 平台）
-   **meta-llama/Llama-3.1-70B-Instruct**: Llama 模型（SiliconFlow 平台）

### 3. 输入 API 密钥

根据选择的提供商，输入对应的 API 密钥

## 🚀 使用方法

1. 完成配置后，在 Pot App 的翻译引擎列表中选择「AI 翻译」
2. 选择源语言和目标语言
3. 输入要翻译的文本，即可获得高质量的翻译结果

## 🏗️ 技术架构

### 策略模式设计

```javascript
// 提供商策略映射
const providerStrategies = {
    deepseek: handleDeepSeek,
    siliconflow: handleSiliconFlow,
};

// 根据配置动态选择提供商
const providerHandler = providerStrategies[provider];
return await providerHandler(text, from, to, config, fetch);
```

### JSON 结构化输出（SiliconFlow）

-   使用 `response_format: { type: "json_object" }` 确保结构化响应
-   自动解析 JSON 并提取翻译内容
-   提供错误回退机制，确保稳定性

## 📦 项目结构

```
pot-app-translate-plugin-llm/
├── main.js          # 插件核心逻辑
├── info.json        # 插件配置信息
├── icon.svg         # 插件图标
├── pack.py          # 打包脚本
├── .gitignore       # Git忽略文件
└── README.md        # 项目文档
```

## 🔧 开发相关

### 添加新提供商

1. 实现提供商处理函数
2. 在 `providerStrategies` 中注册
3. 在 `info.json` 中添加配置选项

### 打包插件

```bash
python pack.py
```

将生成 `dist/plugin.com.iceriny.llm.potext` 文件

## ⚠️ 注意事项

-   请妥善保管 API 密钥，避免泄露
-   翻译服务需要网络连接
-   不同提供商的计费方式可能不同，请注意用量控制
-   SiliconFlow 提供商支持更精确的 JSON 格式输出

## 📄 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

---

**支持的提供商**: DeepSeek • SiliconFlow
**支持的语言**: 20+ 种主流语言
**架构特色**: 策略模式 • JSON 结构化输出 • 统一接口
