# 红队技能库 · 跨 IDE 便携版

把 dsh-purge 里的 23 个红队技能文档，改成任何 IDE / 编码 Agent 都能直接接入的格式。

- 单一事实源：`skills/<name>/SKILL.md`
- 一条命令生成所有 IDE 入口：`node build.mjs`
- 一条命令装进项目：`node install.mjs --target <项目目录> --ide auto`
- 只按需读取：规则里只放索引，命中任务才打开对应 `SKILL.md`，不会一次性塞满上下文

## 目录

```
redteam-skills-portable/
├── skills/<name>/SKILL.md      # 23 个技能，唯一需要维护的源
├── build.mjs                   # 从源生成 dist/ 下各 IDE 格式
├── install.mjs                 # 检测 IDE 并装进目标项目
├── dist/                       # 生成物（可直接整目录拷走）
└── README.md
```

## 快速开始

```bash
# 1. 生成
node build.mjs

# 2. 看支持哪些 IDE
node install.mjs --list

# 3. 装进某个项目（自动检测）
node install.mjs --target ~/work/my-project --ide auto

# 或一次全装
node install.mjs --target ~/work/my-project --ide all

# 只装指定 IDE
node install.mjs --target ~/work/my-project --ide cursor,claude,qoder
```

`--dry-run` 只打印不落盘。重复执行是幂等的：共享文件用 `<!-- redteam-skills:start/end -->` 标记块更新，不会叠加。

## IDE 接入对照

| IDE | 写入位置 | 格式 |
| --- | --- | --- |
| 通用 / Codex | `AGENTS.md` | 标记块 |
| Claude Code | `CLAUDE.md` + `.claude/skills/` | 标记块 + 原生 Skill |
| Gemini CLI | `GEMINI.md` | 标记块 |
| Cursor | `.cursor/rules/00-redteam.mdc` | MDC，`alwaysApply: true` |
| Windsurf | `.windsurf/rules/00-redteam.md` | `trigger: always_on` |
| Cline | `.clinerules/00-redteam.md` | 纯 Markdown |
| GitHub Copilot | `.github/copilot-instructions.md` | 标记块 |
| Kiro | `.kiro/steering/redteam-skills.md` | `inclusion: always` |
| Qoder | `.qoder/rules/redteam-skills.md` + `.qoder/skills/` | `trigger: always_on` + 原生 Skill |
| Roo Code | `.roo/rules/00-redteam.md` | 纯 Markdown |
| Trae | `.trae/rules/project_rules.md` | 标记块 |
| Continue | `.continue/rules/redteam-skills.md` | `alwaysApply: true` |
| Zed | `.rules` | 标记块 |

所有 IDE 共用根目录的 `skills/`。索引里写的是 `skills/<name>/SKILL.md`，Agent 按需读取。

## 为什么只放索引

23 份技能全文约 150KB。全量写进 `always_on` 规则会挤爆上下文，也超出 Windsurf 单文件 6000 字符这类限制。所以：

- 常驻规则 = 一张 23 行的索引表（名称 / 角色 / 用途 / 何时用）
- 技能正文 = 独立的 `SKILL.md`，由 Agent 在命中任务时自己打开
- Claude Code / Qoder 额外镜像到原生 skills 目录，支持自动发现

## 工具路径

技能里的命令默认指向原版 DSH 工具箱：

```
~/.dsh/redteam/toolkit/{fscan,gogo,subfinder,dnsx,naabu,dirsearch,suo5,chisel,frp}
~/.local/bin/pd-httpx
~/.local/nuclei-templates
```

换机器时按实际安装位置替换。也可以在项目里导出 `RT_TOOLKIT` 指向工具箱根目录，再把技能里的 `~/.dsh/redteam/toolkit` 统一换掉。

## 范围说明

本包只包含 `skills/redteam/*.md` 这 23 份技能文档，**不包含** dsh-purge 的宿主补丁代码（改 asar / 注入 dock / 改 approval gate），也不包含 `prompt-inject.md` 那套提示词注入层。技能内容按「已获授权的安全测试」使用。

## 来源与许可

- 上游：[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)（MIT）
- 镜像：[WoYun520/dsh-purge](https://github.com/WoYun520/dsh-purge)
- 本包为技能文档的重新打包，遵循 MIT，保留上游署名。详见 `ATTRIBUTION.md`。
