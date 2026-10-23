#!/usr/bin/env node
/**
 * 把技能库装进指定项目，按 IDE 写入原生规则入口。
 * 用法：
 *   node install.mjs --list
 *   node install.mjs --target . --ide auto
 *   node install.mjs --target . --ide all
 *   node install.mjs --target . --ide cursor,claude,qoder
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, VERSION } from "./build.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const MARK_START = "<!-- redteam-skills:start -->";
const MARK_END = "<!-- redteam-skills:end -->";

export const TARGETS = {
  agents: { label: "AGENTS.md 通用入口", shared: "AGENTS.md", detect: ["AGENTS.md"] },
  claude: { label: "Claude Code", shared: "CLAUDE.md", skills: ".claude/skills", detect: ["CLAUDE.md", ".claude"] },
  gemini: { label: "Gemini CLI", shared: "GEMINI.md", detect: ["GEMINI.md", ".gemini"] },
  cursor: { label: "Cursor", dedicated: ".cursor/rules/00-redteam.mdc", detect: [".cursor"] },
  windsurf: { label: "Windsurf", dedicated: ".windsurf/rules/00-redteam.md", detect: [".windsurf"] },
  cline: { label: "Cline", dedicated: ".clinerules/00-redteam.md", detect: [".clinerules"] },
  copilot: { label: "GitHub Copilot", shared: ".github/copilot-instructions.md", detect: [".github"] },
  kiro: { label: "Kiro", dedicated: ".kiro/steering/redteam-skills.md", detect: [".kiro"] },
  qoder: { label: "Qoder", dedicated: ".qoder/rules/redteam-skills.md", skills: ".qoder/skills", detect: [".qoder"] },
  roo: { label: "Roo Code", dedicated: ".roo/rules/00-redteam.md", detect: [".roo"] },
  trae: { label: "Trae", shared: ".trae/rules/project_rules.md", detect: [".trae"] },
  continue: { label: "Continue", dedicated: ".continue/rules/redteam-skills.md", detect: [".continue"] },
  zed: { label: "Zed", shared: ".rules", detect: [".rules"] },
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function upsertBlock(file, body, dryRun) {
  const block = `${MARK_START}\n${body.trimEnd()}\n${MARK_END}`;
  let status;
  let next;
  if (!fs.existsSync(file)) {
    next = `${block}\n`;
    status = "created";
  } else {
    const cur = fs.readFileSync(file, "utf8");
    const re = new RegExp(`${esc(MARK_START)}[\\s\\S]*?${esc(MARK_END)}`);
    if (re.test(cur)) {
      next = cur.replace(re, block);
      status = "updated";
    } else {
      next = `${cur.trimEnd()}\n\n${block}\n`;
      status = "appended";
    }
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, next, "utf8");
  }
  return status;
}

function copyDir(src, dst, dryRun) {
  if (!fs.existsSync(src)) return;
  if (dryRun) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, force: true });
}

function detect(target) {
  const hit = Object.entries(TARGETS)
    .filter(([, t]) => t.detect.some((p) => fs.existsSync(path.join(target, p))))
    .map(([k]) => k);
  return hit.length ? hit : ["agents"];
}

function main() {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const dryRun = argv.includes("--dry-run");

  if (argv.includes("--list") || argv.includes("-l")) {
    console.log(`redteam-skills-portable v${VERSION}\n`);
    console.log("IDE       写入位置");
    console.log("--------- ---------------------------------------------");
    for (const [k, t] of Object.entries(TARGETS)) {
      const where = t.dedicated || t.shared;
      const mirror = t.skills ? `  + ${t.skills}/` : "";
      console.log(`${k.padEnd(9)} ${where}${mirror}`);
    }
    console.log(`\n通用技能目录：skills/<name>/SKILL.md（所有 IDE 共用）`);
    return;
  }

  const target = path.resolve(get("--target") || process.cwd());
  const ideArg = (get("--ide") || "auto").toLowerCase();
  const ids =
    ideArg === "all"
      ? Object.keys(TARGETS)
      : ideArg === "auto"
        ? detect(target)
        : ideArg.split(",").map((s) => s.trim()).filter(Boolean);

  const unknown = ids.filter((k) => !TARGETS[k]);
  if (unknown.length) {
    console.error(`未知 IDE：${unknown.join(", ")}`);
    console.error(`可选：${Object.keys(TARGETS).join(", ")}, all, auto`);
    process.exit(1);
  }

  build({ out: DIST });
  const body = fs.existsSync(path.join(DIST, "AGENTS.md"))
    ? fs.readFileSync(path.join(DIST, "AGENTS.md"), "utf8")
    : "";

  console.log(`redteam-skills-portable v${VERSION}${dryRun ? " [dry-run]" : ""}`);
  console.log(`目标：${target}`);
  console.log(`IDE：${ids.join(", ")}\n`);

  copyDir(path.join(DIST, "skills"), path.join(target, "skills"), dryRun);
  console.log(`  + skills/（23 个 SKILL.md）`);

  for (const id of ids) {
    const t = TARGETS[id];
    if (t.dedicated) {
      const src = path.join(DIST, t.dedicated);
      const dst = path.join(target, t.dedicated);
      if (!dryRun) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(src, dst);
      }
      console.log(`  + ${t.dedicated}  (${t.label})`);
    } else {
      const status = upsertBlock(path.join(target, t.shared), body, dryRun);
      console.log(`  ${status === "created" ? "+" : "~"} ${t.shared}  (${t.label}, ${status})`);
    }
    if (t.skills) {
      copyDir(path.join(DIST, t.skills), path.join(target, t.skills), dryRun);
      console.log(`  + ${t.skills}/  (${t.label} 原生技能目录)`);
    }
  }

  console.log(`\n完成。入口先读索引，命中任务再打开 skills/<name>/SKILL.md。`);
  if (ids.includes("agents")) console.log("提示：AGENTS.md 可被 Codex / Cursor / Copilot / Gemini CLI 等直接读取。");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
