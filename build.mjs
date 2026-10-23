#!/usr/bin/env node
/**
 * 从 skills/<name>/SKILL.md 单一源生成各 IDE 的规则入口。
 *
 * 两阶段：
 *   1. 移植（lib/port.mjs）：把 DSH 宿主绑定的正文转成任何编码 Agent 都能跑
 *   2. 分发：索引 + 各 IDE 规则入口 + skills 真身
 *
 * 用法：node build.mjs [--out dist] [--raw]
 *   --raw  跳过移植，直接用上游原文（仅用于对比调试）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { portSkill, auditPorted, TOOL_MAP } from "./lib/port.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "skills");
const LIB = path.join(ROOT, "lib");

export const ROLE_ORDER = ["plan", "recon", "vuln-scan", "exploit", "internal"];
export const ROLE_LABEL = {
  plan: "准备",
  recon: "侦察",
  "vuln-scan": "漏洞扫描",
  exploit: "利用",
  internal: "内网",
};

export const VERSION = "2.0.0";

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** 从移植后的正文里提取 frontmatter（description 已被重写） */
function portedFrontmatter(ported) {
  return parseFrontmatter(ported);
}

export function loadSkills({ raw = false, src = SRC } = {}) {
  if (!fs.existsSync(src)) throw new Error(`缺少技能源目录：${src}`);
  const dirs = fs
    .readdirSync(src, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(src, name, "SKILL.md")));

  const skills = dirs.map((dir) => {
    const file = path.join(src, dir, "SKILL.md");
    const source = fs.readFileSync(file, "utf8");
    const fmRaw = parseFrontmatter(source);
    if (fmRaw.name && fmRaw.name !== dir) {
      throw new Error(`frontmatter name 与目录名不一致：${dir} -> ${fmRaw.name}`);
    }

    let text = source;
    let stats = { toolkit: 0, toolcall: 0, setup: 0, env: 0 };
    let problems = [];
    if (!raw) {
      const r = portSkill(source, dir);
      text = r.text;
      stats = r.stats;
      problems = auditPorted(text);
    }
    const fm = portedFrontmatter(text);

    return {
      name: dir,
      description: fm.description || "",
      whenToUse: fm.whenToUse || fm.when_to_use || "",
      role: fmRaw.role || "other",
      file: path.relative(ROOT, file),
      source,
      text,
      stats,
      problems,
    };
  });

  if (!skills.length) throw new Error(`技能目录为空：${src}`);
  const seen = new Set();
  for (const s of skills) {
    if (seen.has(s.name)) throw new Error(`技能重名：${s.name}`);
    seen.add(s.name);
  }
  // 移植残留必须为零，否则直接构建失败——不能把死路文档发给用户
  const broken = skills.filter((s) => s.problems.length);
  if (broken.length && !raw) {
    const detail = broken.map((s) => `  ${s.name}: ${s.problems.join("; ")}`).join("\n");
    throw new Error(`移植后仍有宿主私有残留：\n${detail}`);
  }

  return skills.sort((a, b) => {
    const ra = ROLE_ORDER.indexOf(a.role);
    const rb = ROLE_ORDER.indexOf(b.role);
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb) || a.name.localeCompare(b.name);
  });
}

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ").trim();

export function renderIndex(skills) {
  const rows = skills.map(
    (s) =>
      `| \`${s.name}\` | ${ROLE_LABEL[s.role] || s.role} | ${cell(s.description) || "-"} |`
  );
  const tools = Object.keys(TOOL_MAP).length;
  return [
    `# 红队技能库（跨 IDE 便携版 v${VERSION}）`,
    "",
    `> ${skills.length} 个技能，正文已从 DSH 宿主改写为**任何编码 Agent 都能直接执行**的版本。`,
    "> 命中任务时先读对应技能的 `SKILL.md` 全文再执行，不要凭记忆下命令。",
    "> 技能位置：项目内 `<项目>/skills/<name>/SKILL.md`；全局安装看 `~/.qoder/skills/`、`~/.agents/skills/` 等宿主目录。",
    "> 仅用于已获授权的安全测试；授权范围未确认的资产先停手确认。",
    "> 命令中的 `${TARGET}`、`${CIDR}`、`${DOMAIN}` 等占位符需替换为实际值。",
    "",
    "## 一次配好环境（每个项目只做一次）",
    "",
    "```bash",
    'export RT_LIB="<本包>/lib"                      # 便携版内置记录库',
    'export RT_TOOLKIT="${RT_TOOLKIT:-$HOME/.redteam/toolkit}"',
    'export REDTEAM_HOME="${REDTEAM_HOME:-$HOME/.redteam}"',
    'mkdir -p runs && "$RT_LIB/record.sh" doctor     # 缺什么工具会直接列出来',
    "```",
    "",
    "体检报告里标 `✗` 的工具，按 `skills/redteam-setup/SKILL.md` 第二节自行安装或把 `RT_TOOLKIT` 指到你已有的工具目录。",
    "",
    "## 记录库（替代原 DSH 私有工具）",
    "",
    `原版有 ${tools} 个只有 DSH 认识的 \`redteam_*\` 工具，本包全部换成内置的 \`lib/record.sh\`，`,
    "任何 shell 都能跑，产物是 `runs/*.jsonl`，可以用 `grep` / `jq` / 编辑器复查：",
    "",
    "```bash",
    '$RT_LIB/record.sh asset  add target=1.2.3.4 source=fofa tags=web',
    '$RT_LIB/record.sh vuln   add target=1.2.3.4 name="Redis 未授权" severity=critical',
    '$RT_LIB/record.sh cred   add host=1.2.3.4 username=root secret_type=password --secret secret_value=...',
    '$RT_LIB/record.sh score  server-host target=1.2.3.4 evidence="root shell"',
    '$RT_LIB/record.sh report                                # 汇总 + 总分',
    "```",
    "",
    "## 使用约定",
    "",
    "1. 先按下表定位技能，再读对应 `SKILL.md` 的「前置」和「命令」两节。",
    "2. 一次任务命中多个技能时，按 侦察 → 漏洞扫描 → 利用 → 内网 的顺序执行。",
    "3. 工具路径统一走 `$RT_TOOLKIT`，不依赖任何宿主的默认目录。",
    "4. 扫描/爆破类命令必须带限速参数，先在授权时间窗口内确认目标存活。",
    "",
    "## 技能索引",
    "",
    "| 技能 | 角色 | 用途 / 何时用 |",
    "| --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function ruleFile({ rel, frontmatter, body, banner = true }) {
  const head = banner
    ? `<!-- 由 build.mjs 生成，勿手改；改 skills/ 后重跑 node build.mjs -->\n`
    : "";
  return { rel, content: (frontmatter ? `${frontmatter}\n` : "") + head + body };
}

/** 只清本工具产出过的内容，避免 --out 指向别处时误删用户文件 */
function cleanOut(out) {
  const manifest = path.join(out, ".redteam-manifest.json");
  if (fs.existsSync(manifest)) {
    try {
      const prev = JSON.parse(fs.readFileSync(manifest, "utf8"));
      for (const rel of prev.files || []) {
        const p = path.join(out, rel);
        if (fs.existsSync(p)) fs.rmSync(p, { force: true });
      }
      // 清空后留下的空 skills 目录
      for (const d of ["skills", ".agents/skills"]) {
        const p = path.join(out, d);
        if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
      }
    } catch {
      /* manifest 坏了就退回整目录删除 */
      fs.rmSync(out, { recursive: true, force: true });
    }
    fs.rmSync(manifest, { force: true });
  }
  fs.mkdirSync(out, { recursive: true });
}

export function build({ out = path.join(ROOT, "dist"), raw = false } = {}) {
  cleanOut(out);
  const skills = loadSkills({ raw });
  const body = renderIndex(skills);
  const desc = `红队技能库索引：${skills.length} 个技能，命中任务时读取 skills/<name>/SKILL.md`;
  const files = [];

  const shared = [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    "CODEBUDDY.md",
    "WORKBUDDY.md",
    "CONVENTIONS.md",
    "WARP.md",
    "QWEN.md",
    ".github/copilot-instructions.md",
    ".trae/rules/project_rules.md",
    ".junie/guidelines.md",
    ".idx/airules.md",
    ".goosehints",
    ".rules",
  ];
  for (const rel of shared) files.push(ruleFile({ rel, body }));

  const dedicated = [
    {
      rel: ".cursor/rules/00-redteam.mdc",
      fm: `---\ndescription: ${desc}\nglobs:\nalwaysApply: true\n---`,
    },
    {
      rel: ".windsurf/rules/00-redteam.md",
      fm: `---\ntrigger: always_on\ndescription: ${desc}\n---`,
    },
    { rel: ".clinerules/00-redteam.md", fm: "" },
    {
      rel: ".kiro/steering/redteam-skills.md",
      fm: `---\ninclusion: always\nname: redteam-skills\ndescription: ${desc}\n---`,
    },
    {
      rel: ".qoder/rules/redteam-skills.md",
      fm: `---\ntrigger: always_on\nalwaysApply: true\nenabled: true\n---`,
    },
    { rel: ".roo/rules/00-redteam.md", fm: "" },
    {
      rel: ".continue/rules/redteam-skills.md",
      fm: `---\ndescription: ${desc}\nalwaysApply: true\n---`,
    },
    {
      rel: ".codebuddy/rules/redteam-skills/RULE.mdc",
      fm: `---\ndescription: ${desc}\nglobs:\nalwaysApply: true\n---`,
    },
    {
      rel: ".codebuddy/general/rules/redteam-skills/RULE.mdc",
      fm: `---\ndescription: ${desc}\nglobs:\nalwaysApply: true\n---`,
    },
    { rel: ".devin/rules/redteam-skills.md", fm: "" },
    { rel: ".agents/rules/redteam-skills.md", fm: "" },
    { rel: ".amazonq/rules/redteam-skills.md", fm: "" },
    { rel: ".augment/rules/redteam-skills.md", fm: "" },
    { rel: ".kilocode/rules/redteam-skills.md", fm: "" },
  ];
  for (const d of dedicated) {
    files.push(ruleFile({ rel: d.rel, frontmatter: d.fm, body }));
  }

  for (const f of files) {
    const full = path.join(out, f.rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.content, "utf8");
  }

  // 技能正文：只写一份真身，其余宿主目录由 install.mjs 建链接/复制
  const written = files.map((f) => f.rel);
  for (const s of skills) {
    const dir = path.join(out, "skills", s.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), s.text, "utf8");
    written.push(path.join("skills", s.name, "SKILL.md"));
  }

  // 记录库随技能一起分发
  const libDir = path.join(out, "lib");
  fs.mkdirSync(libDir, { recursive: true });
  for (const f of fs.readdirSync(LIB)) {
    if (!/\.(sh|mjs|md)$/.test(f)) continue;
    fs.copyFileSync(path.join(LIB, f), path.join(libDir, f));
    fs.chmodSync(path.join(libDir, f), 0o755);
    written.push(path.join("lib", f));
  }

  fs.writeFileSync(
    path.join(out, ".redteam-manifest.json"),
    JSON.stringify({ version: VERSION, generatedAt: new Date().toISOString(), files: written }, null, 2)
  );

  return { out, skills, files };
}

/** 入口判定：必须走 realpath，否则 /tmp → /private/tmp 这类软链会让脚本静默不执行 */
function isEntry() {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(arg);
  } catch {
    return false;
  }
}

if (isEntry()) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  const out = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(ROOT, "dist");
  const raw = argv.includes("--raw");
  const { skills, files } = build({ out, raw });
  const tot = skills.reduce(
    (a, s) => ({ toolkit: a.toolkit + s.stats.toolkit, toolcall: a.toolcall + s.stats.toolcall, setup: a.setup + s.stats.setup, env: a.env + s.stats.env }),
    { toolkit: 0, toolcall: 0, setup: 0, env: 0 }
  );
  console.log(`已生成 ${skills.length} 个技能 / ${files.length} 个规则入口${raw ? "（--raw，未移植）" : ""}`);
  for (const f of files) console.log(`  + ${f.rel}`);
  if (!raw) {
    console.log(`  + skills/（${skills.length} 份 SKILL.md 真身）`);
    console.log(`  + lib/（record.sh 记录库）`);
    console.log(
      `\n移植统计：工具路径 ${tot.toolkit} 处 · redteam_* 工具调用 ${tot.toolcall} 处 · setup.sh ${tot.setup} 处 · 变量归一 ${tot.env} 处`
    );
  }
  console.log(`输出：${out}`);
}
