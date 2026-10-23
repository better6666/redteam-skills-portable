#!/usr/bin/env node
/**
 * port.mjs —— 把 DSH 宿主绑定的技能正文，转换成任何编码 Agent 都能独立执行的版本。
 *
 * 输入：skills/<name>/SKILL.md（上游原文，原样保留，作单一事实源）
 * 输出：dist/skills/<name>/SKILL.md（转换后）
 *
 * 这一层解决原包最大的问题：正文里全是 $DSH_HOME / ~/.dsh/redteam/toolkit /
 * redteam_preflight 这类只有 DSH 宿主认识的东西，换到 Cursor / Claude Code /
 * Trae 里 Agent 读到就是死路。
 *
 * 转换规则：
 *   1. 工具路径  ~/.dsh/redteam/toolkit/X  →  ${RT_TOOLKIT}/X
 *                $DSH_HOME/redteam/toolkit/X → ${RT_TOOLKIT}/X
 *   2. setup.sh  → 「自己配 .env」的分步指引（不再假设有 setup.sh）
 *   3. 19 个 redteam_* 私有工具 → lib/record.sh 的子命令（任何 shell 都能跑）
 *   4. 硬编码的 <你的VPS_IP> 等占位符 → 环境变量引用
 *   5. 正文顶部注入「前置：工具与环境」段落，讲清 RT_TOOLKIT / 记录库怎么来
 */
import fs from "node:fs";
import path from "node:path";

// ── 工具映射：redteam_* → record.sh ────────────────────────────────────────
/** 值 = { sub: record.sh 子命令, ent?: 实体, act?: 动作, note?: 补充说明 } */
export const TOOL_MAP = {
  redteam_preflight:      { sub: "doctor",  note: "体检工具链与凭据，替代原 preflight" },  redteam_asset_add:      { sub: "asset add" },
  redteam_asset_upsert:   { sub: "asset add" },
  redteam_asset_query:    { sub: "asset query" },
  redteam_asset_link:     { sub: "chain add", note: "关系写入 chain，detail 说明「A → B 的关系」" },
  redteam_asset_test:     { sub: "test add",  note: "status=testing|tested|no_surface|blocked|abandoned" },
  redteam_asset_list:     { sub: "asset list" },
  redteam_vuln_add:       { sub: "vuln add" },
  redteam_vuln_update:    { sub: "vuln add",  note: "追加一条修正记录，不要改历史行" },
  redteam_vuln_list:      { sub: "vuln list" },
  redteam_credential_add: { sub: "cred add",  note: "明文口令加 --secret" },
  redteam_credential_list:{ sub: "cred list" },
  redteam_access_add:     { sub: "access add" },
  redteam_access_list:    { sub: "access list" },
  redteam_session_check:  { sub: "chain add", note: "stage_code=session-check，result 写实测连通性结论" },
  redteam_tunnel_add:     { sub: "tunnel add" },
  redteam_tunnel_update:  { sub: "tunnel add", note: "追加一条 status=down 的记录，不要改历史行" },
  redteam_webshell_add:   { sub: "webshell add" },
  redteam_http_evidence_add: { sub: "evidence add" },
  redteam_poc_search:     { sub: "poc query", note: "先在知识库 grep；没有再查 nuclei 模板目录，最后才上网找" },
  redteam_poc_get:        { sub: "poc query" },
  redteam_poc_add:        { sub: "poc add" },
  redteam_chain_add:      { sub: "chain add" },
  redteam_chain_list:     { sub: "chain list" },
  redteam_score_hit:      { sub: "score",     note: "自动按得分点算分" },
  redteam_attack_file_add:{ sub: "attack add" },
  redteam_web_list:       { sub: "port list" },
  redteam_report:         { sub: "report" },
};

const RECORD = "${RT_LIB}/record.sh";

// ── 环境变量占位符归一 ──────────────────────────────────────────────────────
const ENV_NORMALIZE = [
  [/<你的VPS_IP>|<你的vps_ip>|<VPS_IP>|<vps_ip>/gi, "${REDTEAM_VPS_HOST}"],
  [/<你的VPS_HOST>|<VPS_HOST>/gi, "${REDTEAM_VPS_HOST}"],
  [/<私钥\s*路径>|<私钥路径>/gi, "${REDTEAM_VPS_KEY}"],
  [/<FOFA_KEY>|<fofa_key>/gi, "${FOFA_KEY}"],
];

/** 把上游正文转成便携版正文 */
export function portBody(raw) {
  let body = raw;
  let stats = { toolkit: 0, toolcall: 0, setup: 0, env: 0 };

  // 1. 工具路径 → ${RT_TOOLKIT}
  body = body.replace(
    /(?:\$DSH_HOME|\$\{DSH_HOME\}|~\/\.dsh)\/redteam\/toolkit(?:\/[A-Za-z0-9_.\-]+)*/g,
    (m) => {
      stats.toolkit++;
      const sub = m.replace(/^(?:\$DSH_HOME|\$\{DSH_HOME\}|~\/\.dsh)\/redteam\/toolkit\/?/, "");
      return sub ? `\${RT_TOOLKIT}/${sub}` : "${RT_TOOLKIT}";
    }
  );
  // 裸 toolkit 目录引用
  body = body.replace(/\$DSH_HOME\/redteam\/toolkit\b/g, () => {
    stats.toolkit++;
    return "${RT_TOOLKIT}";
  });

  // 2. engagements 目录 → 项目内 runs/
  body = body.replace(/(?:\$DSH_HOME|\$\{DSH_HOME\}|~\/\.dsh)\/redteam\/engagements\/?/g, "runs/");

  // 3. setup.sh / $DSH_HOME/.env → 便携版的配法
  body = body.replace(
    /`?bash\s+\$DSH_HOME\/redteam\/setup\.sh`?/g,
    () => {
      stats.setup++;
      return `${RECORD} doctor`;
    }
  );
  body = body.replace(/(?:\$DSH_HOME|\$\{DSH_HOME\})\/redteam\/setup\.sh/g, () => {
    stats.setup++;
    return RECORD;
  });
  body = body.replace(/(?:\$DSH_HOME|\$\{DSH_HOME\}|\$HOME\/\.dsh)\/\.env/g, () => {
    stats.env++;
    return "${REDTEAM_HOME}/.env";
  });

  // 4. redteam_* 工具调用 → record.sh
  //    原文里常已包在反引号里，替换时要吃掉外层反引号，避免 ``` ``cmd`` ``` 这种双层
  body = body.replace(/(`)?\b(redteam_[a-z_]+)\b(`)?/g, (full, b1, name, b2) => {
    const hit = TOOL_MAP[name];
    if (!hit) return full;
    stats.toolcall++;
    const cmd = `${RECORD} ${hit.sub}`;
    // 两侧都有反引号 → 复用原有的，不重复加
    return b1 && b2 ? `\`${cmd}\`` : cmd;
  });

  // 5. 硬编码占位符
  for (const [re, rep] of ENV_NORMALIZE) {
    body = body.replace(re, () => {
      stats.env++;
      return rep;
    });
  }

  // 6. 去掉对 DSH 包本身的引用
  body = body.replace(/npm 版\s*`?dsh-redteam-mode`?/g, "本技能库");
  body = body.replace(/`?dsh-redteam-mode-<版本>-toolkit\.tar\.gz`?/g, "`toolkit.tar.gz`");

  // 7. 兜底：任何剩余的 $DSH_HOME 都收敛到 REDTEAM_HOME
  body = body.replace(/\$\{?DSH_HOME\}?/g, () => {
    stats.env++;
    return "${REDTEAM_HOME}";
  });
  // 兜底：残留的 DSH 绝对路径表述
  body = body.replace(/~\/\.dsh\/redteam\/toolkit/g, () => {
    stats.toolkit++;
    return "${RT_TOOLKIT}";
  });

  return { body, stats };
}

// ── 前置段落：每个技能都需要的环境说明 ──────────────────────────────────────
export function preambleFor(skill) {
  const needsToolkit = /RT_TOOLKIT/.test(skill.ported);
  const needsVps = /\$\{REDTEAM_VPS_(HOST|KEY|USER)\}|\$REDTEAM_VPS_(HOST|KEY|USER)|反弹\s*Shell\s*回连/.test(
    skill.ported
  );
  const lines = [
    "## 前置：工具与环境",
    "",
    "```bash",
    '# 记录库：项目内优先，其次全局安装位置',
    'REDTEAM_HOME="${REDTEAM_HOME:-$HOME/.redteam}"',
    'if [ -z "${RT_LIB:-}" ]; then',
    '  for _c in "./lib" "$REDTEAM_HOME/lib"; do',
    '    [ -x "$_c/record.sh" ] && RT_LIB="$_c" && break',
    '  done',
    'fi',
    'RT_TOOLKIT="${RT_TOOLKIT:-$REDTEAM_HOME/toolkit}"',
    '[ -f "$REDTEAM_HOME/.env" ] && . "$REDTEAM_HOME/.env"',
    'mkdir -p runs',
    "```",
    "",
    "开工前先跑一次体检，缺什么会直接列出来：",
    "",
    "```bash",
    `${RECORD} doctor`,
    "```",
  ];
  if (needsToolkit) {
    lines.push(
      "",
      "`${RT_TOOLKIT}` 下的二进制本包不带。缺了就按 `skills/redteam-setup/SKILL.md` 第二节自行取，",
      "或把 `RT_TOOLKIT` 指向你已有的工具目录。**不要假设原 DSH 的默认目录存在**——那是原 DSH 版的路径，便携版不依赖它。"
    );
  }
  if (needsVps) {
    lines.push(
      "",
      "需要 VPS 的技能还要这三个环境变量（写在 `$REDTEAM_HOME/.env`，权限 600）：",
      "`REDTEAM_VPS_HOST`（`user@ip`）、`REDTEAM_VPS_KEY`（私钥路径）、`REDTEAM_VPS_USER`（可选）。"
    );
  }
  lines.push(
    "",
    "所有「落库」动作统一走内置记录库，输出到 `runs/*.jsonl`，不需要宿主提供任何工具：",
    "",
    "```bash",
    `${RECORD} <实体> add k=v ...   # 见 lib/record.sh help`,
    "```",
    ""
  );
  return lines.join("\n");
}

// ── frontmatter 重写：补 whenToUse 进 description，去掉宿主私有键 ──────────
export function portFrontmatter(fm, dirName) {
  const desc = fm.description || "";
  const when = fm.whenToUse || fm.when_to_use || "";
  // 标准 Agent Skills 只认 name + description；把「何时用」并进 description，
  // 这样 Claude Code / Codex / DSH / Antigravity 都能凭 description 命中。
  const full = when && !desc.includes(when) ? `${desc}。USE WHEN: ${when}` : desc;
  // description 里也可能带硬编码占位符，同样归一
  let norm = full;
  for (const [re, rep] of ENV_NORMALIZE) norm = norm.replace(re, () => rep);
  norm = norm.replace(/(?:\$DSH_HOME|\$\{DSH_HOME\})\/redteam\/toolkit/g, "${RT_TOOLKIT}");
  // description 是给 Agent 做意图匹配用的，塞 shell 命令只会干扰匹配 → 换成自然语言
  norm = norm.replace(/\bredteam_preflight\b/g, "环境体检");
  norm = norm.replace(/\bredteam_[a-z_]+/g, (m) => (TOOL_MAP[m] ? "记录库" : m));
  norm = norm.replace(/\$\{RT_LIB\}\/record\.sh\s+[a-z]+/g, "记录库");
  norm = norm.replace(/\$\{[A-Z_]+\}/g, "");
  return [
    "---",
    `name: ${dirName}`,
    `description: ${norm.replace(/\n/g, " ").trim()}`,
    "---",
  ].join("\n");
}

export function portSkill(raw, dirName) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm = {};
  if (m) {
    for (const line of m[1].split("\n")) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  const original = m ? raw.slice(m[0].length) : raw;
  const { body, stats } = portBody(original);
  const out = portFrontmatter(fm, dirName) + "\n\n" + preambleFor({ ported: body }) + "\n" + body.replace(/^\n+/, "");
  return { text: out.replace(/\n{3,}/g, "\n\n"), stats, fm };
}

/** 校验：转换后不应再有宿主私有残留 */
export function auditPorted(text) {
  const problems = [];
  const checks = [
    // 任何 redteam_* 都不该留下——已知的会被映射，未知的必须报出来让人补 TOOL_MAP
    [/\bredteam_[a-z_]+\b/, "未映射的 redteam_* 工具调用"],
    [/\$DSH_HOME|\$\{DSH_HOME\}/, "DSH_HOME 变量残留"],
    [/~\/\.dsh\/redteam\/toolkit/, "DSH 工具箱绝对路径残留"],
    [/dsh-redteam-mode/, "DSH 包名残留"],
    [/<你的VPS_IP>|<VPS_IP>/, "未替换的 VPS 占位符"],
  ];
  for (const [re, why] of checks) {
    const hit = text.match(re);
    if (hit) problems.push(`${why}: ${hit[0]}`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const src = path.join(root, "skills");
  let tot = { toolkit: 0, toolcall: 0, setup: 0, env: 0 };
  let bad = 0;
  for (const d of fs.readdirSync(src, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const f = path.join(src, d.name, "SKILL.md");
    if (!fs.existsSync(f)) continue;
    const { text, stats } = portSkill(fs.readFileSync(f, "utf8"), d.name);
    for (const k of Object.keys(tot)) tot[k] += stats[k];
    const p = auditPorted(text);
    if (p.length) { bad++; console.log(`✗ ${d.name}: ${p.join("; ")}`); }
  }
  console.log(`路径 ${tot.toolkit} · 工具调用 ${tot.toolcall} · setup.sh ${tot.setup} · 变量 ${tot.env}`);
  console.log(bad ? `${bad} 个技能仍有残留` : "全部通过，无宿主私有残留");
}
