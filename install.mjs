#!/usr/bin/env node
/**
 * 把技能库装进项目或用户目录，按 IDE 写入原生规则入口。
 *
 *   node install.mjs --list
 *   node install.mjs --target . --ide auto
 *   node install.mjs --target . --ide all
 *   node install.mjs --target . --ide cursor,claude,qoder
 *   node install.mjs --global --ide all        # 装到 ~/.codex 等全局目录
 *   node install.mjs --global --skills-only    # 只装全局 skills
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { build, VERSION } from "./build.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const MARK_START = "<!-- redteam-skills:start -->";
const MARK_END = "<!-- redteam-skills:end -->";

export const TARGETS = {
  agents: {
    label: "通用 AGENTS.md（Codex / Antigravity / Devin / Trae / Qoder / CodeBuddy / WorkBuddy / ZCode / Cursor / Copilot）",
    shared: "AGENTS.md",
    detect: ["AGENTS.md"],
  },
  codex: { label: "Codex", shared: "AGENTS.md", skillsDir: ".codex/skills", detect: [".codex"] },
  claude: { label: "Claude Code", shared: "CLAUDE.md", skillsDir: ".claude/skills", detect: ["CLAUDE.md", ".claude"] },
  gemini: { label: "Gemini CLI", shared: "GEMINI.md", detect: ["GEMINI.md", ".gemini"] },
  cursor: { label: "Cursor", dedicated: ".cursor/rules/00-redteam.mdc", detect: [".cursor"] },
  windsurf: { label: "Windsurf", dedicated: ".windsurf/rules/00-redteam.md", detect: [".windsurf"] },
  cline: { label: "Cline", dedicated: ".clinerules/00-redteam.md", detect: [".clinerules"] },
  copilot: { label: "GitHub Copilot", shared: ".github/copilot-instructions.md", detect: [".github"] },
  kiro: { label: "Kiro", dedicated: ".kiro/steering/redteam-skills.md", detect: [".kiro"] },
  qoder: { label: "Qoder", dedicated: ".qoder/rules/redteam-skills.md", skillsDir: ".qoder/skills", detect: [".qoder"] },
  roo: { label: "Roo Code", dedicated: ".roo/rules/00-redteam.md", detect: [".roo"] },
  trae: { label: "Trae（国际版/国内版）", shared: ".trae/rules/project_rules.md", skillsDir: ".trae/skills", detect: [".trae"] },
  continue: { label: "Continue", dedicated: ".continue/rules/redteam-skills.md", detect: [".continue"] },
  zed: { label: "Zed", shared: ".rules", detect: [".rules"] },
  codebuddy: {
    label: "CodeBuddy（国际版/国内版）",
    shared: "CODEBUDDY.md",
    dedicated: ".codebuddy/rules/redteam-skills/RULE.mdc",
    skillsDir: ".codebuddy/skills",
    detect: ["CODEBUDDY.md", ".codebuddy"],
  },
  codebuddycn: {
    label: "CodeBuddy 国内版（.codebuddycn）",
    shared: "CODEBUDDY.md",
    dedicated: ".codebuddy/rules/redteam-skills/RULE.mdc",
    skillsDir: ".codebuddycn/skills",
    detect: [".codebuddycn"],
  },
  workbuddy: { label: "WorkBuddy", shared: "WORKBUDDY.md", skillsDir: ".workbuddy/skills", detect: ["WORKBUDDY.md", ".workbuddy"] },
  zcode: { label: "ZCode", shared: "AGENTS.md", skillsDir: ".zcode/skills", detect: [".zcode"] },
  devin: { label: "Devin", shared: "AGENTS.md", dedicated: ".devin/rules/redteam-skills.md", detect: [".devin"] },
  antigravity: {
    label: "Google Antigravity",
    shared: "AGENTS.md",
    dedicated: ".agents/rules/redteam-skills.md",
    skillsDir: ".agents/skills",
    detect: [".agents"],
  },
  dsh: { label: "DeepSeek Harness", shared: "AGENTS.md", skillsDir: ".agents/skills", detect: [".dsh"] },
  amazonq: { label: "Amazon Q Developer", dedicated: ".amazonq/rules/redteam-skills.md", detect: [".amazonq"] },
  junie: { label: "JetBrains Junie", shared: ".junie/guidelines.md", detect: [".junie"] },
  augment: { label: "Augment Code", dedicated: ".augment/rules/redteam-skills.md", detect: [".augment"] },
  kilo: { label: "Kilo Code", dedicated: ".kilocode/rules/redteam-skills.md", detect: [".kilocode"] },
  aider: { label: "Aider", shared: "CONVENTIONS.md", detect: ["CONVENTIONS.md", ".aider.conf.yml"] },
  warp: { label: "Warp", shared: "WARP.md", detect: ["WARP.md", ".warp"] },
  qwen: { label: "Qwen Code", shared: "QWEN.md", detect: ["QWEN.md"] },
  firebase: { label: "Firebase Studio", shared: ".idx/airules.md", detect: [".idx"] },
  goose: { label: "Goose", shared: ".goosehints", detect: [".goosehints"] },
};

export const GLOBAL_TARGETS = {
  codex: { label: "Codex", rule: ".codex/AGENTS.md", source: "AGENTS.md", mode: "shared", skills: ".codex/skills" },
  claude: { label: "Claude Code", rule: ".claude/CLAUDE.md", source: "CLAUDE.md", mode: "shared", skills: ".claude/skills" },
  gemini: { label: "Gemini CLI", rule: ".gemini/GEMINI.md", source: "GEMINI.md", mode: "shared" },
  qoder: { label: "Qoder", rule: ".qoder/rules/redteam-skills.md", source: ".qoder/rules/redteam-skills.md", mode: "dedicated", skills: ".qoder/skills" },
  kiro: { label: "Kiro", rule: ".kiro/steering/redteam-skills.md", source: ".kiro/steering/redteam-skills.md", mode: "dedicated" },
  agents: { label: "通用 .agents", skills: ".agents/skills" },
  dsh: { label: "DeepSeek Harness", skills: ".dsh/skills" },
  trae: { label: "Trae", skills: ".trae/skills" },
  codebuddy: { label: "CodeBuddy", skills: ".codebuddy/skills" },
  codebuddycn: { label: "CodeBuddy 国内版", skills: ".codebuddycn/skills" },
  workbuddy: { label: "WorkBuddy", skills: ".workbuddy/skills" },
  zcode: { label: "ZCode", skills: ".zcode/skills" },
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

function parseIds(arg, table) {
  const ids =
    arg === "all"
      ? Object.keys(table)
      : arg === "auto"
        ? null
        : arg.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = (ids || []).filter((k) => !table[k]);
  if (unknown.length) {
    console.error(`未知 IDE：${unknown.join(", ")}`);
    console.error(`可选：${Object.keys(table).join(", ")}, all, auto`);
    process.exit(1);
  }
  return ids;
}

function printList() {
  console.log(`redteam-skills-portable v${VERSION}\n`);
  console.log("项目级：");
  console.log("IDE          写入位置");
  console.log("-----------  ------------------------------------------------------------");
  for (const [k, t] of Object.entries(TARGETS)) {
    const where = [t.shared, t.dedicated, t.skillsDir ? `${t.skillsDir}/` : null].filter(Boolean).join("  + ");
    console.log(`${k.padEnd(12)} ${where}`);
  }
  console.log("\n全局（--global）：");
  for (const [k, t] of Object.entries(GLOBAL_TARGETS)) {
    const where = [t.rule || "", t.skills ? `${t.skills}/` : ""].filter(Boolean).join("  + ") || "-";
    console.log(`${k.padEnd(12)} ~/${where}`);
  }
  console.log("\n通用技能目录：skills/<name>/SKILL.md（所有 IDE 共用）");
}

function main() {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const dryRun = argv.includes("--dry-run");
  const global = argv.includes("--global");
  const skillsOnly = argv.includes("--skills-only");

  if (argv.includes("--list") || argv.includes("-l")) {
    printList();
    return;
  }

  if (!dryRun) build({ out: DIST });
  else if (!fs.existsSync(path.join(DIST, "AGENTS.md"))) build({ out: DIST });

  const body = fs.readFileSync(path.join(DIST, "AGENTS.md"), "utf8");
  const ideArg = (get("--ide") || (global ? "all" : "auto")).toLowerCase();
  const modeLabel = global ? "全局" : "项目";

  if (global) {
    const home = os.homedir();
    const ids = parseIds(ideArg, GLOBAL_TARGETS) || Object.keys(GLOBAL_TARGETS);
    console.log(`redteam-skills-portable v${VERSION} [全局]${dryRun ? " [dry-run]" : ""}`);
    console.log(`HOME：${home}`);
    console.log(`目标：${ids.join(", ")}\n`);

    const skillDirsDone = new Set();
    for (const id of ids) {
      const t = GLOBAL_TARGETS[id];
      if (!skillsOnly && t.rule) {
        const dest = path.join(home, t.rule);
        if (t.mode === "shared") {
          const status = upsertBlock(dest, body, dryRun);
          console.log(`  ${status === "created" ? "+" : "~"} ~/${t.rule}  (${t.label}, ${status})`);
        } else {
          if (!dryRun) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(path.join(DIST, t.source), dest);
          }
          console.log(`  + ~/${t.rule}  (${t.label})`);
        }
      }
      if (t.skills && !skillDirsDone.has(t.skills)) {
        skillDirsDone.add(t.skills);
        copyDir(path.join(DIST, "skills"), path.join(home, t.skills), dryRun);
        console.log(`  + ~/${t.skills}/  (${t.label})`);
      }
    }
    console.log(`\n完成。全局规则会在所有项目生效；只要某个 IDE 的规则就删掉对应文件。`);
    return;
  }

  const target = path.resolve(get("--target") || process.cwd());
  const ids = parseIds(ideArg, TARGETS) || detect(target);

  console.log(`redteam-skills-portable v${VERSION}${dryRun ? " [dry-run]" : ""}`);
  console.log(`目标：${target}`);
  console.log(`IDE：${ids.join(", ")}\n`);

  copyDir(path.join(DIST, "skills"), path.join(target, "skills"), dryRun);
  console.log(`  + skills/（23 个 SKILL.md）`);

  const sharedDone = new Set();
  const skillsDone = new Set();

  for (const id of ids) {
    const t = TARGETS[id];
    if (t.shared && !sharedDone.has(t.shared)) {
      sharedDone.add(t.shared);
      const status = upsertBlock(path.join(target, t.shared), body, dryRun);
      console.log(`  ${status === "created" ? "+" : "~"} ${t.shared}  (${status})`);
    }
    if (t.dedicated) {
      const dst = path.join(target, t.dedicated);
      if (!dryRun) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(DIST, t.dedicated), dst);
      }
      console.log(`  + ${t.dedicated}  (${t.label})`);
    }
    if (t.skillsDir && !skillsDone.has(t.skillsDir)) {
      skillsDone.add(t.skillsDir);
      copyDir(path.join(DIST, "skills"), path.join(target, t.skillsDir), dryRun);
      console.log(`  + ${t.skillsDir}/  (${t.label} 原生技能目录)`);
    }
  }

  console.log(`\n完成。入口先读索引，命中任务再打开 skills/<name>/SKILL.md。`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
