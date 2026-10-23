# 红队技能库 · 跨 IDE 便携版

把 dsh-purge 里的 23 个红队技能文档，改成任何 IDE / 编码 Agent 都能直接接入的格式。

- 单一事实源：`skills/<name>/SKILL.md`
- 一条命令生成所有 IDE 入口：`node build.mjs`
- 装进项目：`node install.mjs --target <项目目录> --ide auto`
- 装到用户目录：`node install.mjs --global --ide all`
- 只按需读取：规则里只放索引，命中任务才打开对应 `SKILL.md`

## 覆盖范围

三层兜底，不管什么工具至少能吃其中一层：

| 层 | 路径 | 谁在读 |
| --- | --- | --- |
| 通用指令 | `AGENTS.md` | Codex、Antigravity、Devin、Trae、Qoder、CodeBuddy、WorkBuddy、ZCode、Cursor、Copilot、Amp、OpenCode、Crush、Factory、Jules 等 60k+ 项目在用的开放格式 |
| 通用规则目录 | `.agents/rules/*.md` | Google Antigravity（也认 `AGENTS.md` / `GEMINI.md`） |
| 通用技能目录 | `.agents/skills/<name>/SKILL.md` | DeepSeek Harness、Antigravity，以及所有遵循 Agent Skills 的宿主 |

## 快速开始

```bash
# 生成 dist/
node build.mjs

# 看支持哪些 IDE
node install.mjs --list

# 装进某个项目（自动检测目录）
node install.mjs --target ~/work/my-project --ide auto

# 一次全装（30 个适配器）
node install.mjs --target ~/work/my-project --ide all

# 只装指定 IDE
node install.mjs --target ~/work/my-project --ide cursor,claude,qoder,codebuddy

# 装到用户目录：所有项目都能用
node install.mjs --global --ide all

# 只装全局技能，不写全局规则
node install.mjs --global --skills-only
```

`--dry-run` 只打印不落盘。重复执行幂等：共享文件用 `<!-- redteam-skills:start/end -->` 标记块更新，不会叠加。

## IDE 对照表

| 工具 | 项目级入口 | 全局目录（`--global`） | 说明 |
| --- | --- | --- | --- |
| **Codex** | `AGENTS.md` | `~/.codex/AGENTS.md` + `~/.codex/skills/` | 通用格式 |
| **Claude Code** | `CLAUDE.md` + `.claude/skills/` | `~/.claude/CLAUDE.md` + `~/.claude/skills/` | 原生 Skill |
| **Gemini CLI** | `GEMINI.md` | `~/.gemini/GEMINI.md` | |
| **Cursor** | `.cursor/rules/00-redteam.mdc` | — | `alwaysApply: true` |
| **Windsurf** | `.windsurf/rules/00-redteam.md` | — | `trigger: always_on` |
| **Cline** | `.clinerules/00-redteam.md` | — | |
| **GitHub Copilot** | `.github/copilot-instructions.md` | — | |
| **Kiro** | `.kiro/steering/redteam-skills.md` | `~/.kiro/steering/` | `inclusion: always` |
| **Qoder** | `.qoder/rules/redteam-skills.md` + `.qoder/skills/` | `~/.qoder/rules/` + `~/.qoder/skills/` | 原生 Skill |
| **Roo Code** | `.roo/rules/00-redteam.md` | — | |
| **Trae（国际/国内）** | `.trae/rules/project_rules.md` + `.trae/skills/` | `~/.trae/skills/` | 项目文件两版一致 |
| **Continue** | `.continue/rules/redteam-skills.md` | — | `alwaysApply: true` |
| **Zed** | `.rules` | — | |
| **CodeBuddy（国际/国内）** | `CODEBUDDY.md` + `.codebuddy/rules/redteam-skills/RULE.mdc` + `.codebuddy/skills/` | `~/.codebuddy/skills/`、`~/.codebuddycn/skills/` | `AGENTS.md` 是 fallback |
| **WorkBuddy** | `WORKBUDDY.md` + `.workbuddy/skills/` | `~/.workbuddy/skills/` | 也读 `AGENTS.md` |
| **ZCode** | `AGENTS.md` + `.zcode/skills/` | `~/.zcode/skills/` | 也读 `CLAUDE.md` |
| **Devin** | `AGENTS.md` + `.devin/rules/redteam-skills.md` | — | 官方主推 `AGENTS.md` |
| **Google Antigravity** | `AGENTS.md` / `GEMINI.md` / `.agents/rules/` + `.agents/skills/` | — | 三个入口任选其一即可 |
| **DeepSeek Harness（DSH）** | `AGENTS.md` + `.agents/skills/` | `~/.agents/skills/` + `~/.dsh/skills/` | 技能是原生机制 |
| **Amazon Q Developer** | `.amazonq/rules/redteam-skills.md` | — | |
| **JetBrains Junie** | `.junie/guidelines.md` | — | |
| **Augment Code** | `.augment/rules/redteam-skills.md` | — | |
| **Kilo Code** | `.kilocode/rules/redteam-skills.md` | — | |
| **Aider** | `CONVENTIONS.md` | — | 需在 aider 配置里 `read` 该文件 |
| **Warp** | `WARP.md` | — | |
| **Qwen Code** | `QWEN.md` | — | |
| **Firebase Studio** | `.idx/airules.md` | — | |
| **Goose** | `.goosehints` | — | |

没列到的工具：只要它读 `AGENTS.md`、`.agents/rules/` 或 `.agents/skills/` 任意一个，装 `--ide agents` 或 `--ide all` 就能用。VS Code 系的国产 IDE（通义灵码、豆包 MarsCode、Comate 等）多数也兼容 `AGENTS.md` 或自家 rules 目录，装完看一次 `--list` 即可。

## 国内版 / 国际版

项目内的规则文件名两边一致，差异只在应用配置目录：

- CodeBuddy：国际版 `~/.codebuddy`，国内版 `~/.codebuddycn`；项目里都认 `CODEBUDDY.md`。
- Trae：国际版/国内版都读 `.trae/rules/`，技能都放 `.trae/skills/`。
- Qoder：Desktop 和 Qoder IDE 都读 `.qoder/rules/`。
- ZCode / WorkBuddy / DSH：项目级都用 `AGENTS.md`，全局技能目录各归各家。

`--global` 只写本机实际存在的通用目录；应用若把用户规则存在设置/数据库里，项目级文件仍然有效，全局规则需要在该应用设置里手动加一次。

## 为什么只放索引

23 份技能全文约 150KB。全量写进 `always_on` 规则会挤爆上下文，也超出 Windsurf 单文件 6000 字符这类限制。所以：

- 常驻规则 = 一张 23 行的索引表（名称 / 角色 / 用途 / 何时用）
- 技能正文 = 独立的 `SKILL.md`，Agent 命中任务时自己打开
- 有原生 Skill 机制的宿主（Claude Code、Qoder、Trae、CodeBuddy、WorkBuddy、ZCode、DSH、Antigravity）额外镜像到各自的 skills 目录

## 工具路径

技能里的命令默认指向原版 DSH 工具箱：

```
~/.dsh/redteam/toolkit/{fscan,gogo,subfinder,dnsx,naabu,dirsearch,suo5,chisel,frp}
~/.local/bin/pd-httpx
~/.local/nuclei-templates
```

换机器时按实际安装位置替换，或导出 `RT_TOOLKIT` 指向工具箱根目录。

## 范围说明

本包只包含 `skills/redteam/*.md` 这 23 份技能文档，**不包含** dsh-purge 的宿主补丁代码（改 asar / 注入 dock / 改 approval gate），也不包含 `prompt-inject.md` 那套提示词注入层。技能内容按「已获授权的安全测试」使用。

## 来源与许可

- 上游：[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)（MIT）
- 镜像：[WoYun520/dsh-purge](https://github.com/WoYun520/dsh-purge)
- 本包为技能文档的重新打包，遵循 MIT，保留上游署名。详见 `ATTRIBUTION.md`。
