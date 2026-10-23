#!/usr/bin/env node
/**
 * 从 skills/<name>/SKILL.md 单一源生成各 IDE 的规则入口。
 * 用法：node build.mjs [--out dist]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "skills");

export const ROLE_ORDER = ["plan", "recon", "vuln-scan", "exploit", "internal"];
const ROLE_LABEL = {
  plan: "准备",
  recon: "侦察",
  "vuln-scan": "漏洞扫描",
  exploit: "利用",
  internal: "内网",
};

export const VERSION = "1.0.0";

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

export function loadSkills(src = SRC) {
  if (!fs.existsSync(src)) throw new Error(`缺少技能源目录：${src}`);
  const dirs = fs
    .readdirSync(src, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(src, name, "SKILL.md")));

  const skills = dirs.map((dir) => {
    const file = path.join(src, dir, "SKILL.md");
    const raw = fs.readFileSync(file, "utf8");
    const fm = parseFrontmatter(raw);
    if (fm.name && fm.name !== dir) {
      throw new Error(`frontmatter name 与目录名不一致：${dir} -> ${fm.name}`);
    }
    return {
      name: dir,
      description: fm.description || "",
      whenToUse: fm.whenToUse || fm.when_to_use || "",
      role: fm.role || "other",
      file: path.relative(ROOT, file),
      raw,
    };
  });

  if (!skills.length) throw new Error(`技能目录为空：${src}`);
  const seen = new Set();
  for (const s of skills) {
    if (seen.has(s.name)) throw new Error(`技能重名：${s.name}`);
    seen.add(s.name);
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
      `| \`${s.name}\` | ${ROLE_LABEL[s.role] || s.role} | ${cell(s.description) || "-"} | ${cell(s.whenToUse) || "-"} |`
  );
  return [
    `# 红队技能库（跨 IDE 便携版 v${VERSION}）`,
    "",
    `> ${skills.length} 个技能。命中任务时先读 \`skills/<name>/SKILL.md\` 全文再执行，不要凭记忆下命令。`,
    "> 仅用于已获授权的安全测试；授权范围未确认的资产先停手确认。",
    "> 命令中的 `<target>`、`<cidr>`、`<domain>` 等占位符需替换为实际值。",
    "",
    "## 使用约定",
    "",
    "1. 先按下表定位技能，再读对应 `SKILL.md` 的「前置检查」和「命令」两节。",
    "2. 一次任务命中多个技能时，按 侦察 → 漏洞扫描 → 利用 → 内网 的顺序执行。",
    "3. 工具路径默认取自原版 DSH 工具箱（`~/.dsh/redteam/toolkit`）。换机器时按实际安装路径替换，或导出 `RT_TOOLKIT` 指到工具箱根目录。",
    "4. 扫描/爆破类命令必须带限速参数，先在授权时间窗口内确认目标存活。",
    "",
    "## 技能索引",
    "",
    "| 技能 | 角色 | 用途 | 何时用 |",
    "| --- | --- | --- | --- |",
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

export function build({ out = path.join(ROOT, "dist") } = {}) {
  const skills = loadSkills();
  const body = renderIndex(skills);
  const desc = `红队技能库索引：${skills.length} 个技能，命中任务时读取 skills/<name>/SKILL.md`;
  const files = [];

  const shared = [
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".github/copilot-instructions.md",
    ".trae/rules/project_rules.md",
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
  ];
  for (const d of dedicated) {
    files.push(ruleFile({ rel: d.rel, frontmatter: d.fm, body }));
  }

  for (const f of files) {
    const full = path.join(out, f.rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, f.content, "utf8");
  }

  for (const s of skills) {
    for (const base of ["skills", ".claude/skills", ".qoder/skills"]) {
      const dir = path.join(out, base, s.name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), s.raw, "utf8");
    }
  }

  return { out, skills, files };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  const out = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(ROOT, "dist");
  const { skills, files } = build({ out });
  console.log(`已生成 ${skills.length} 个技能 / ${files.length} 个规则入口`);
  for (const f of files) console.log(`  + ${f.rel}`);
  console.log(`  + skills/ .claude/skills/ .qoder/skills/（各 ${skills.length} 份 SKILL.md）`);
  console.log(`输出：${out}`);
}
