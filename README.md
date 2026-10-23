# 红队技能库 · 跨 IDE 便携版 v2.0

把 DSH 版红队技能文档，转成**任何 IDE / 编码 Agent 都能直接执行**的格式。

- 单一事实源：`skills/<name>/SKILL.md`（上游原文，未改）
- 构建时自动移植：`node build.mjs` → `dist/`（正文里的宿主私有依赖全部改写）
- 装进项目：`node install.mjs --target <项目目录> --ide auto`
- 装到用户目录：`node install.mjs --global --ide all`
- 卸载：`node install.mjs --target <项目目录> --uninstall`

## v2.0 修了什么

v1.1 只做了「文档换目录」：23 份 SKILL.md 原样复制，正文里全是只有 DSH 认识的
`redteam_preflight`、`$DSH_HOME/redteam/toolkit`、`setup.sh`，换到 Cursor / Claude Code /
Trae 里 Agent 读到就是死路。v2.0 把这些全部改写掉：

| 问题（v1.1） | 处理（v2.0） |
| --- | --- |
| 正文含 28 个 DSH 私有工具调用（109 处） | 全部映射到内置 `lib/record.sh`，任何 shell 都能跑 |
| `$DSH_HOME/redteam/toolkit/*` 硬编码（46 处） | 统一走 `${RT_TOOLKIT}`，可用环境变量覆盖 |
| 依赖 `setup.sh` 写 `.env`（4 处） | 改成显式导出 + `record.sh doctor` 体检 |
| 同一套技能复制 9 份，改一处要同步 9 处 | 只留一份真身，其余建相对 symlink |
| 没有卸载 | `--uninstall` 按 manifest 精确回滚 |
| 全局装了是「没人认领的孤目录」 | 写 `~/.agents/.skill-lock.json`，卸载时撤干净 |
| `--out` 指向别处会残留旧文件 | 按 manifest 清理，不误删用户文件 |
| 构建成功即发布，不校验 | 移植残留 > 0 时**构建直接失败** |

构建时的移植统计会打出来：

```
移植统计：工具路径 46 处 · redteam_* 工具调用 109 处 · setup.sh 4 处 · 变量归一 40 处
```

## 覆盖范围

三层兜底，不管什么工具至少能吃其中一层：

| 层 | 路径 | 谁在读 |
| --- | --- | --- |
| 通用指令 | `AGENTS.md` | Codex、Antigravity、Devin、Trae、Qoder、CodeBuddy、WorkBuddy、ZCode、Cursor、Copilot、Amp、OpenCode、Crush、Factory、Jules 等 60k+ 项目在用的开放格式 |
| 通用规则目录 | `.agents/rules/*.md` | Google Antigravity（也认 `AGENTS.md` / `GEMINI.md`） |
| 通用技能目录 | `.agents/skills/<name>/SKILL.md` | DeepSeek Harness、Antigravity，以及所有遵循 Agent Skills 的宿主 |

## 快速开始

```bash
# 生成 dist/（含移植后的技能 + 记录库）
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

# 撤掉（只撤本工具装的，不动你自己的技能和 runs/）
node install.mjs --target ~/work/my-project --uninstall
```

`--dry-run` 只打印不落盘。`--copy` 强制复制而非建链接（Windows 无符号链接权限时自动降级）。
重复执行幂等：共享文件用 `<!-- redteam-skills:start/end -->` 标记块更新，不会叠加。

## 装完第一件事

```bash
export RT_LIB="$PWD/lib"
export RT_TOOLKIT="${RT_TOOLKIT:-$HOME/.redteam/toolkit}"
export REDTEAM_HOME="${REDTEAM_HOME:-$HOME/.redteam}"
"$RT_LIB/record.sh" doctor
```

`doctor` 会把工具链、凭据、资产库一次列清，缺什么直接标 `✗`。

## 记录库（替代 DSH 私有工具）

原版 28 个 `redteam_*` 工具全部换成 `lib/record.sh`，产物是 `runs/*.jsonl`，
可以用 `grep` / `jq` / 任何编辑器复查，不需要宿主提供任何能力：

```bash
$RT_LIB/record.sh asset  add target=1.2.3.4 source=fofa tags=web,edge
$RT_LIB/record.sh port   add host=1.2.3.4 port=443 url=https://x title=后台
$RT_LIB/record.sh vuln   add target=1.2.3.4 name="Redis 未授权访问" severity=critical
$RT_LIB/record.sh cred   add host=1.2.3.4 username=root secret_type=password --secret secret_value=...
$RT_LIB/record.sh access add host=1.2.3.4 username=root method=ssh privilege=root
$RT_LIB/record.sh tunnel add kind=frp listen=127.0.0.1:1080 reach=10.0.0.0/24
$RT_LIB/record.sh chain  add stage_code=internet tool="cmd 原文" result="回显摘要"
$RT_LIB/record.sh score  server-host target=1.2.3.4 evidence="root shell"
$RT_LIB/record.sh report                       # 汇总 + 总分
```

实体：`asset` `port` `vuln` `cred` `access` `tunnel` `webshell` `chain` `evidence` `poc` `attack` `test`。
动作：`add` / `list` / `query`。全部无依赖（纯 bash，不依赖 python/node/jq）。

## 环境变量

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `REDTEAM_HOME` | `~/.redteam` | 记录库根目录，`.env` 从这里读 |
| `RT_TOOLKIT` | `$REDTEAM_HOME/toolkit` | 工具链根目录 |
| `REDTEAM_ENGAGEMENT` | `latest` | 项目名，决定 `runs/<name>/` |
| `FOFA_KEY` | — | fofa-recon 测绘 |
| `REDTEAM_VPS_HOST` | — | `user@ip`，反弹 Shell / 隧道用 |
| `REDTEAM_VPS_KEY` | `$RT_TOOLKIT/vps/id_rsa` | VPS 私钥路径 |
| `NO_COLOR` | — | 关掉颜色，日志干净 |

`.env` 放在 `$REDTEAM_HOME/.env`，权限 600，`record.sh` 自动 source。

## 技能真身只有一份

`<target>/skills/` 是唯一真身，各宿主的原生技能目录（`.claude/skills/`、`.qoder/skills/`、
`.agents/skills/` 等）都是指向它的相对 symlink：

```
.claude/skills/active-scan -> ../../skills/active-scan
```

改一处即全部生效，不会再出现 9 份不同步的副本。Windows 无符号链接权限时自动降级复制，
并打印 `copy` 提示。

**全局安装例外**：`--global` 一律复制成独立副本，因为指向包内 `dist/` 的链接在包被移动后就会断。

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
| **Kiro** | `.kiro/steering/redteam-skills.md` | — | `inclusion: always` |
| **Qoder** | `.qoder/rules/redteam-skills.md` + `.qoder/skills/` | `~/.qoder/rules/` + `~/.qoder/skills/` | 原生 Skill |
| **Roo Code** | `.roo/rules/00-redteam.md` | — | |
| **Trae（国际/国内）** | `.trae/rules/project_rules.md` + `.trae/skills/` | `~/.trae/skills/` | 项目文件两版一致 |
| **Continue** | `.continue/rules/redteam-skills.md` | — | `alwaysApply: true` |
| **Zed** | `.rules` | — | |
| **CodeBuddy（国际）** | `CODEBUDDY.md` + `.codebuddy/rules/` + `.codebuddy/skills/` | `~/.codebuddy/skills/` | |
| **CodeBuddy（国内）** | `CODEBUDDY.md` + `.codebuddy/general/rules/` + `.codebuddycn/skills/` | `~/.codebuddycn/skills/` | 独立配置目录 |
| **WorkBuddy** | `WORKBUDDY.md` + `.workbuddy/skills/` | `~/.workbuddy/skills/` | 也读 `AGENTS.md` |
| **ZCode** | `AGENTS.md` + `.zcode/skills/` | `~/.zcode/skills/` | 也读 `CLAUDE.md` |
| **Devin** | `AGENTS.md` + `.devin/rules/redteam-skills.md` | — | 官方主推 `AGENTS.md` |
| **Google Antigravity** | `AGENTS.md` / `GEMINI.md` / `.agents/rules/` + `.agents/skills/` | — | 三个入口任选其一 |
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

没列到的工具：只要它读 `AGENTS.md`、`.agents/rules/` 或 `.agents/skills/` 任意一个，装 `--ide agents` 或 `--ide all` 就能用。

## 为什么只放索引

23 份技能全文约 184KB。全量写进 `always_on` 规则会挤爆上下文，也超出 Windsurf 单文件 6000 字符这类限制。所以：

- 常驻规则 = 一张 23 行的索引表（名称 / 角色 / 用途 + 何时用）
- 技能正文 = 独立的 `SKILL.md`，Agent 命中任务时自己打开
- 有原生 Skill 机制的宿主额外镜像到各自的 skills 目录（symlink）

索引里每个技能的「何时用」被并进了 frontmatter 的 `description`（`… USE WHEN: …`），
这样 Claude Code / Codex / DSH / Antigravity 都能只凭 description 命中，不依赖宿主私有字段。

## 工具路径

技能里的命令统一走 `${RT_TOOLKIT}`：

```bash
export RT_TOOLKIT="$HOME/.redteam/toolkit"
# 期望布局：subfinder/ dnsx/ naabu/ httpx/ fscan/ gogo/ chisel/ frp/ suo5/ dirsearch/ ...
```

换机器时按实际安装位置改 `RT_TOOLKIT`，或直接 `export` 指向你已有的工具目录。
`record.sh doctor` 会按这个布局逐个检查并报缺。

## 范围说明

本包只包含技能文档的**重新打包 + 移植**，不含 dsh-purge 的宿主补丁代码
（改 asar / 注入 dock / 改 approval gate），也不含 `prompt-inject.md` 那套提示词注入层。
技能内容按「已获授权的安全测试」使用。

## 来源与许可

- 上游：[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)（MIT）
- 镜像：[WoYun520/dsh-purge](https://github.com/WoYun520/dsh-purge)
- 本包为技能文档的重新打包与跨宿主移植，遵循 MIT，保留上游署名。详见 `ATTRIBUTION.md`。
