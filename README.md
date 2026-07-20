# 中文去 AI 味写作套件

一套可定制、可维护的 agentic 中文写作套件，用于让 agent 写出没有常见中文 AI 味的内容，并按同一套规则编辑、改写、润色和审稿。

这不是一段孤立提示词：

- `SKILL.md` 提供永久控制流程、完整写作规则、详细句式族、解释和例子。
- `operations/kit-operations.md` 处理定制、重置和日常添加规则。
- `skill-customized.md` 保存每个用户的本地偏好，只在用户要求定制时生成。
- `scripts/` 提供规则加载、中文机械扫描和最终交付检查。

## 开始使用

1. **先定制一次。** 输入 `定制`，agent 会创建本地偏好文件，并逐节展示当前规则。
2. **用于写作和编辑。** 发送主题、需求、草稿或成稿，agent 会按当前规则写、改或审。
3. **随时添加。** 发现新的 AI 味表达时，告诉 agent 要加入个人规则还是公共规则；它会先查重，再放进合适章节。

不定制也可以直接使用。没有 `skill-customized.md` 时，系统使用 `SKILL.md` 的默认规则。

## 它处理什么

中文 AI 味有自己的高频问题：公文腔、营销腔、翻译腔、四字标签、总分总模板、三联轻句、短视频口号、假亲密、强行升华和毒性正能量。这个套件同时处理语言表面和推理问题：

- 短硬性禁区把最显眼的问题放在第一层。
- 正向默认值告诉 agent 应该怎样写，不只列禁词。
- 证据规则限制来源沉默、群体边界、因果证明和能力升级。
- 命题落点和段落账本减少换句话重复、总结式结尾和判断夹心。
- 中文扫描器检查破折号、库存句式、假对比、虚构多数人、空洞词和节奏问题。
- 自定义规则不会覆盖事实保真和最终交付检查。

## 范围和限制

这些规则是编辑信号，不是作者身份鉴定工具。它不承诺通过任何检测，也不能替用户补出不存在的事实、经历和观点。

不同模型的指令遵循能力并不相同。紧凑控制器、EOF 标记和脚本检查可以减少漏读与显性违规，但不能保证每次输出都完全没有 AI 味。机械扫描通过后仍需人工语义检查。

## 规则结构

1. 硬性禁区
2. 正向写作默认值
3. 词和短语清理
4. 判断、证据和读者
5. 结构、格式和标点
6. 节奏和重复
7. 最终检查偏好
8. 用户额外偏好，仅用于定制文件

完整运行规则、详细分类、长句式族和例子都保存在 `SKILL.md`，便于 agent 完整加载，也方便用户直接阅读和修改。

## 安装

把仓库克隆到你的 agent 支持的 skill、plugin 或自定义指令目录：

```sh
git clone https://github.com/evelynyaxueke/anti-ai-writing-kit-zh.git <your-skill-directory>/anti-ai-writing-kit-zh
```

加载整个文件夹可以使用脚本和定制功能。只上传 `SKILL.md` 也能作为手动降级方案，但无法运行相对路径脚本。

## 基本调用

```text
使用 anti-ai-writing-kit-zh 写这篇文章，去掉中文 AI 味。
```

```text
使用 anti-ai-writing-kit-zh 编辑这份草稿，保留所有事实和原意。
```

## 定制

输入：

```text
定制
```

agent 只会在收到明确请求后创建 `skill-customized.md`。新格式定制文件只保存第 1 至第 8 节，不复制永久控制器。包含子节的类别会先显示概览，再逐个展示完整规则、解释和例子。已有旧格式定制文件仍可使用，系统不会静默覆盖或迁移它。

## 添加规则

告诉 agent 具体表达，以及要加入个人规则还是公共默认规则：

```text
加到我的规则：不要用“真正重要的是”宣布观点。
```

```text
加到默认 SKILL.md：不要用“大家都没意识到”虚构多数人。
```

agent 会搜索精确表达、近似变体和根本问题。已经覆盖时不重复添加；需要补充时，同时更新适用的 `SKILL.md` 规则、解释、扫描器和测试。

## 重置

输入：

```text
重置
```

agent 只删除 `skill-customized.md`，然后恢复使用默认编号规则。永久控制器和公共规则不受影响。

## 本地验证

脚本只使用 Node.js 标准库，不需要安装依赖。

```sh
node --check scripts/*.mjs
node --test tests/*.test.mjs
```

扫描一份候选稿：

```sh
node scripts/scan-writing.mjs --input draft.txt --format text --fail-on review
```

## 文件结构

```text
anti-ai-writing-kit-zh/
├── SKILL.md
├── README.md
├── AGENTS.md
├── LICENSE
├── agents/
├── operations/
├── scripts/
└── tests/
```

`skill-customized.md` 和 `.DS_Store` 是本地生成文件，已被 `.gitignore` 排除。

## License

MIT License. Copyright (c) 2026 Evelyn Ke.
