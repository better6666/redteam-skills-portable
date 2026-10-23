# 署名与来源 / Attribution

本包是技能文档的**重新打包 + 跨宿主移植**，不含上游的宿主补丁代码与提示词注入层。

| 项 | 内容 |
| --- | --- |
| 原项目 | dsh-purge（DeepSeek Harness 红队插件） |
| 原作者 | 小杨 / YuJunZhiXue（[@YuJunZhiXue](https://github.com/YuJunZhiXue)） |
| 上游仓库 | <https://github.com/YuJunZhiXue/dsh-purge> |
| 镜像仓库 | <https://github.com/WoYun520/dsh-purge> |
| 原许可证 | MIT License（`LICENSE` 原样保留） |
| 本包内容 | `skills/*/SKILL.md` 共 23 份技能文档（源文件逐字节未改动） |

## 本包做了什么（v2.0）

`skills/` 下的 23 份源文件**逐字节保留上游原文**，移植发生在**构建阶段**
（`build.mjs` + `lib/port.mjs`），产物写入 `dist/`：

| 改动 | 数量 | 说明 |
| --- | --- | --- |
| `redteam_*` 私有工具 → `lib/record.sh` | 109 处 | 原 19 个 DSH 专有工具调用，改为任何 shell 都能跑的内置记录库 |
| `$DSH_HOME/redteam/toolkit` → `${RT_TOOLKIT}` | 46 处 | 工具路径参数化，不再绑定 DSH 目录 |
| `setup.sh` 依赖 → 显式环境变量 + `doctor` | 4 处 | 不再假设存在 DSH 安装脚本 |
| frontmatter `whenToUse` 并入 `description` | 23 处 | 兼容标准 Agent Skills（只认 name + description） |
| 顶部注入「前置：工具与环境」段 | 23 处 | 每个技能自带环境说明与体检命令 |

`lib/record.sh`（记录库）与 `lib/port.mjs`（移植器）为本次新增，**非上游内容**。

> 注意区分：本包的 `lib/` 是移植层；上游 dsh-purge 的 `lib/` 是宿主补丁代码，
> 两者无关，后者不在本包内。

## 沿用的要求

按上游 README「署名要求」与镜像说明：

- 使用本项目名称、思路、代码或提示词，必须署名并写明来源仓库。
- 任何二开、分发、集成，保留本说明与原仓库链接。
- 沿用原项目的非盈利条款：不得用于卖课、卖插件、卖 token、倒卖等收费行为。

## 本包未包含

- 上游 dsh-purge 的宿主补丁代码（asar 解包、dock 注入、approval gate 改写、host clean、重签等）
- `~/.dsh/prompt-inject.md` 提示词注入内容
- `presets/`、`scripts/`、UI 资源
- 任何渗透测试二进制（工具链由用户自行获取，见 `skills/redteam-setup/SKILL.md`）

这些内容与具体宿主绑定，不属于跨 IDE 的可移植部分。
