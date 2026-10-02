# AI 翻译与词典 · Manggo 原生插件

[English](./README.en.md) | 中文

这是原 Pot AI 翻译插件的 **Manggo 原生迁移版**。当前为 `4.0.0-beta.1` 预发布版，已获维护者授权发布对应测试包；实际安装与 API 验收仍待完成。

- 新开发分支：[`manggo`](https://github.com/iceriny/pot-app-translate-plugin-llm/tree/manggo)
- Pot 旧版留档：[`main`](https://github.com/iceriny/pot-app-translate-plugin-llm/tree/main)，原提交 `04e2df4ee0661fd0085d5adc0339f068905b70cb`，不删除、不改写历史
- 安装格式：`.mplugin`，不是 `.potext`
- 运行契约：Bun + ES module + `manggo.plugin.v1`
- 建议验证宿主：Manggo **v1.0.2**（官网 2026-09-22 版本）。插件功能需要支持原生插件的 Manggo/Pro；未声明未经验证的最低宿主或 Bun 版本

## 安装测试包

1. 从本次交付文件或本分支 CI 的构建制品取得 `com.iceriny.llm-4.0.0-beta.1.mplugin`，不要解压或更改后缀
2. 在 Manggo 的“插件管理”中安装该文件
3. 到“翻译服务”添加 **AI 翻译 · LLM**，填写服务商、API 密钥与模型；插件安装并不等于服务已经添加
4. 如需词典卡片，另外添加 **AI 词典 · LLM** 并配置。两个服务的设置独立
5. 输入 `?` 可离线查看指令帮助；随后按 [测试清单](./TESTING.md) 验证

旧 Pot 的配置和历史不会被读取或自动搬运，密钥请在 Manggo 服务配置中重新填写。两个插件 ID 不同，可以并存。维护者已授权在 GitHub 发布此 beta 测试包；它不是稳定版，未进行商店发布。

## 升级内容

| Manggo 原生能力 | 本插件的用法 |
| --- | --- |
| `utils.fetch` 的标准 Fetch 接口 | 不再猜测 Pot/Tauri Body 格式；用 JSON 请求体和标准 Response |
| `setResult(delta)` | 真正请求 SSE，只发送新增文字；处理 UTF-8 分片、LF/CRLF/CR、多行事件、完成与异常信号 |
| 密码、布尔、数字、多行与可编辑下拉控件 | 密钥遮挡、手填模型、流式开关、超时/tokens、术语表、补充要求 |
| 一个插件多个服务 | 普通文本翻译和独立结构化词典，不把原始 JSON 暴露为译文 |
| 结构化 dictionary 返回值 | 词性、释义、例句、发音和词形通过原生词典卡片展示 |
| 映射后的 `options.detect` | 自动语言模式下保留实际检测源语言，正确区分简繁中文与发音体系 |

同时修复：旧实现没有真正请求流式数据、可能显示整个 API JSON；缓存不区分配置；错误作为成功译文返回；空指令发出无意义请求；模型/目标语言校验不足；README 许可与实际文件不一致。

不直接照搬官方示例中的解析器：本版会报告截断、断流、空结果、格式错误，关闭 reader，并避免重复发送累计文本。错误抛给宿主，不写成“成功”的翻译。不会自动重试收费请求，也不跨模型复用旧历史缓存。

## 服务商和配置

预设支持 DeepSeek、SiliconFlow、OpenAI、本机 Ollama、自定义 OpenAI Chat Completions 兼容接口。它不是 Anthropic/Gemini 原生接口适配器，也不支持 Azure 查询参数认证。

- **模型**：留空按服务商选择默认值；可输入任意模型 ID。Ollama/自定义必须填写。切换服务商时，若之前手填过模型或 API 地址，请清空或同步更换
- **API 地址**：预设可留空。自定义填 `https://host/v1` 或完整 `https://host/v1/chat/completions`；不自动猜 `/v1`。只允许 HTTPS，本机 `localhost`、`127.0.0.1`、`[::1]` 可用 HTTP。URL 不接受用户名、密码、查询参数或片段
- **API 密钥**：远程接口必填；本机服务可留空。只向所配置的接口发送，没有遥测、额外转发或密钥日志
- **流式输出**：默认开。标准翻译和问答可流式；润色、发音、口语和词典等待完整 JSON 校验后显示
- **最大输出 tokens**：默认 4000，插件范围 1–131072；实际仍受模型限制。输出因长度截断时明确报错
- **超时**：默认 60 秒，可选 5–300 秒；覆盖请求和读取，通过 AbortController 中止。这不是宿主取消按钮 API
- **随机度**：默认不传，使用服务商默认值。需要时设置 0–2；模型不支持时留空
- **JSON 模式**：默认关。打开后仅结构化模式发送 `response_format: {type: "json_object"}`；模型/接口不支持时关闭
- **补充要求 / 术语表**：多行输入。术语表按 `source = preferred target` 每行填写；问答不应用术语表
- **提示语言**：中文或 English；不改变目标翻译语言

预设模型 ID 只是可编辑起点，不承诺所有账户或地区均可用。Manggo 公开 API 没有动态模型下拉刷新钩子，故不伪造自动发现行为。密码控件的 `secret` 标记不代表本插件能证明宿主加密存储方式。

## 指令

| 输入 | 功能 |
| --- | --- |
| 普通文本、`$t 文本`、`>t 文本` | 忠实翻译，保留段落、Markdown、代码和占位符 |
| `$p 文本` | 标准翻译 + 润色版 |
| `$f 文本` / `$cf 文本` | 标准翻译 + 温和友好的口语版 |
| `$m 文本` / `$cm 文本` | 标准翻译 + 简洁直接的口语版 |
| `$r 文本` | 原文发音，不翻译 |
| `$r> 文本` | 翻译 + 译文发音 |
| `$r< 文本` | 翻译 + 原文发音 |
| `$r<> 文本` | 翻译 + 两种发音 |
| `$q 问题` | 单轮问答，不保存对话上下文 |
| `?` / `$help` | 离线帮助，无需密钥 |

`$r>`、`$r<`、`$r<>` 可紧接文本，其余命令须用空格分隔；未知 `$...` 前缀保留为原文。旧 `$cf/$cm` 别名保留，以表达风格描述，不假定说话者性别。

AI 词典适合单词与短语（最多 200 个字符、30 个空白分词），使用独立服务，不解析上述命令。释义、发音都由模型生成，需要核对；插件丢弃模型生成的音频 URL，避免意外请求第三方地址。

## 构建与验证

开发需要 Node.js 22+、npm、Python 3.10+。插件安装后的执行不依赖 Node、npm 或 Python，由 Manggo 的 Bun 运行。

```sh
npm ci
npm run check
npm test
npm run package
npm run verify-package
```

`esbuild` 固定版本并锁定依赖，源码 `main.js` 与 `lib/*.js` 打成单个压缩 ESM。最终 ZIP 根目录**恰好四个文件**：

```text
manggo.plugin.json
main.js              # 单个 bundle + minify 产物
icon.svg
LICENSE
```

不包含源码模块、node_modules、测试、source map、配置密钥或构建元数据。打包具有固定时间戳和文件顺序；校验构建与源码摘要，防止漏构建。`dist/sha256.txt` 提供包校验和。压缩可减小代码体积，但不承诺未经测量的翻译延迟改善。

日常 CI 只做语法、测试、构建、包校验和上传 Actions 制品，使用只读 contents 权限。另有仅限此次已授权 `v4.0.0-beta.1` 的一次性发布流程，固定已交付包 SHA-256，先测试并上传草稿附件后再公开预发布；普通源码推送不会触发发布，也没有 npm/商店发布步骤。源代码和压缩产物运行同一组协议测试；测试使用本地假响应，不调用收费 API。详见 [TESTING.md](./TESTING.md)。

## API 依据与验证边界

- [官方原生插件指南，固定提交 51e617a](https://github.com/Pylogmon/manggo-plugin/tree/51e617a98df6ae142b0f1595269e55f27f9d3a1f)
- [Manggo 官网与更新日志](https://manggo.pylogmon.cn/#changelog)
- [官方宿主下载仓库](https://gitcode.com/Pylogmon/Manggo/releases)

Manggo 宿主闭源。本项目验证公开 API 契约、源码、Bun/Node 运行行为和包内容；真实宿主导入、界面/代理、宿主取消行为、真实密钥与服务商收费接口仍须按测试清单验收。没有声称提供不存在于文档的动态模型 API、宿主数据库权限或取消信号。

## 许可

[GNU GPL v3](./LICENSE)，沿用原仓库 LICENSE。压缩包保留许可文件，完整可修改源码保留在对应分支/提交。旧 README 中的 MIT 标识已纠正。
