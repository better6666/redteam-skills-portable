# 署名与来源 / Attribution

本包是技能文档的**重新打包**，不含上游的宿主补丁代码与提示词注入层。

| 项 | 内容 |
| --- | --- |
| 原项目 | dsh-purge（DeepSeek Harness 红队插件） |
| 原作者 | 小杨 / YuJunZhiXue（[@YuJunZhiXue](https://github.com/YuJunZhiXue)） |
| 上游仓库 | <https://github.com/YuJunZhiXue/dsh-purge> |
| 镜像仓库 | <https://github.com/WoYun520/dsh-purge> |
| 原许可证 | MIT License（`LICENSE` 原样保留） |
| 本包内容 | `skills/redteam/*.md` 共 23 份技能文档，frontmatter 与正文未改动 |

## 沿用的要求

按上游 README「署名要求」与镜像说明：

- 使用本项目名称、思路、代码或提示词，必须署名并写明来源仓库。
- 任何二开、分发、集成，保留本说明与原仓库链接。
- 沿用原项目的非盈利条款：不得用于卖课、卖插件、卖 token、倒卖等收费行为。

## 本包未包含

- `lib/` 下的宿主补丁代码（asar 解包、dock 注入、approval gate 改写、host clean、重签等）
- `~/.dsh/prompt-inject.md` 提示词注入内容
- `presets/`、`scripts/`、UI 资源

这些内容与具体宿主绑定，不属于跨 IDE 的可移植部分。
