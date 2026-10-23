#!/usr/bin/env node
/**
 * 把技能库装进项目或用户目录，按 IDE 写入原生规则入口。
 *
 *   node install.mjs --list
 *   node install.mjs --target . --ide auto
 *   node install.mjs --target . --ide all
 *   node install.mjs --target . --ide cursor,claude,qoder
 *   node install.mjs --global --ide all          # 装到 ~/.codex 等全局目录
 *   node install.mjs --global --skills-only      # 只装 skills，不写规则
 *   node install.mjs --target . --uninstall      # 只撤本工具装的，不动用户已有内容
 *
 * 技能真身只有一份：<target>/skills/。各宿主的原生技能目录一律建相对 symlink
 * （Windows 或 --copy 时降级为复制）。这样改一处不会出现 9 份不同步的副本。
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
const MANIFEST_NAME = ".redteam-manifest.json";
const LOCK_NAME = ".skill-lock.json";

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
    label: "CodeBuddy（国际版）",
    shared: "CODEBUDDY.md",
    dedicated: ".codebuddy/rules/redteam-skills/RULE.mdc",
    skillsDir: ".codebuddy/skills",
    detect: ["CODEBUDDY.md", ".codebuddy"],
  },
  codebuddycn: {
    label: "CodeBuddy（国内版 .codebuddycn）",
    shared: "CODEBUDDY.md",
    dedicated: ".codebuddy/general/rules/redteam-skills/RULE.mdc",
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
  qoder: {
    label: "Qoder",
    rule: ".qoder/rules/redteam-skills.md",
    source: ".qoder/rules/redteam-skills.md",
    mode: "dedicated",
    skills: ".qoder/skills",
  },
  kiro: {
    label: "Kiro",
    rule: ".kiro/steering/redteam-skills.md",
    source: ".kiro/steering/redteam-skills.md",
    mode: "dedicated",
  },
  agents: { label: "通用 .agents", skills: ".agents/skills" },
  dsh: { label: "DeepSeek Harness", skills: ".dsh/skills" },
  trae: { label: "Trae", skills: ".trae/skills" },
  codebuddy: { label: "CodeBuddy 国际版", skills: ".codebuddy/skills" },
  codebuddycn: { label: "CodeBuddy 国内版", skills: ".codebuddycn/skills" },
  workbuddy: { label: "WorkBuddy", skills: ".workbuddy/skills" },
  zcode: { label: "ZCode", skills: ".zcode/skills" },
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── 标记块：幂等写入 ────────────────────────────────────────────────────────
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

function removeBlock(file, dryRun) {
  if (!fs.existsSync(file)) return "absent";
  const cur = fs.readFileSync(file, "utf8");
  const re = new RegExp(`\\n*${esc(MARK_START)}[\\s\\S]*?${esc(MARK_END)}\\n*`);
  if (!re.test(cur)) return "absent";
  let next = cur.replace(re, "\n");
  // build.mjs 写在标记块内的生成头，块删掉后可能露在外面，一并收走
  next = next
    .split("\n")
    .filter((l) => !/^<!-- 由 build\.mjs 生成/.test(l.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  if (next.trim() === "") {
    if (!dryRun) fs.rmSync(file, { force: true });
    return "removed";
  }
  if (!dryRun) fs.writeFileSync(file, next + "\n", "utf8");
  return "removed";
}

// ── 技能真身：一份 + 相对 symlink ──────────────────────────────────────────
function linkOrCopy(canonicalDir, dst, { dryRun, copy }) {
  const skillNames = fs.existsSync(canonicalDir)
    ? fs.readdirSync(canonicalDir).filter((n) => fs.existsSync(path.join(canonicalDir, n, "SKILL.md")))
    : [];

  // 清掉上一次留下的同名目录/链接，避免 EEXIST
  if (!dryRun && fs.existsSync(dst)) {
    for (const n of fs.readdirSync(dst)) {
      if (!skillNames.includes(n)) continue;
      const p = path.join(dst, n);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink() || st.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
    }
  }
  if (dryRun) return { mode: copy ? "copy" : "link", count: skillNames.length };

  fs.mkdirSync(dst, { recursive: true });
  let mode = copy ? "copy" : "link";
  for (const n of skillNames) {
    const target = path.join(dst, n);
    const rel = path.relative(dst, path.join(canonicalDir, n));
    if (copy) {
      fs.cpSync(path.join(canonicalDir, n), target, { recursive: true, force: true });
      continue;
    }
    try {
      fs.symlinkSync(rel, target, "dir");
    } catch {
      // Windows 无符号链接权限 / 已有同名项 → 降级复制
      fs.cpSync(path.join(canonicalDir, n), target, { recursive: true, force: true });
      mode = "copy";
    }
  }
  return { mode, count: skillNames.length };
}

// ── 清单：记住自己装过什么，卸载才有依据 ────────────────────────────────────
function newManifest() {
  return { version: VERSION, targets: [], rules: [], skillDirs: [], files: [], blocks: [] };
}

function loadManifest(root) {
  const f = path.join(root, MANIFEST_NAME);
  if (!fs.existsSync(f)) return newManifest();
  try {
    return { ...newManifest(), ...JSON.parse(fs.readFileSync(f, "utf8")) };
  } catch {
    return newManifest();
  }
}

function saveManifest(root, m, dryRun) {
  if (dryRun) return;
  m.version = VERSION;
  m.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(root, MANIFEST_NAME), JSON.stringify(m, null, 2));
}

/** 写宿主技能注册表，免得出现「有目录但没人认领」的孤目录 */
function updateSkillLock(home, skillNames, { dryRun, remove = false }) {
  const dir = path.join(home, ".agents");
  const lockPath = path.join(dir, LOCK_NAME);
  let lock = { version: 3, skills: {} };
  if (fs.existsSync(lockPath)) {
    try {
      const cur = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      lock = { version: 3, ...cur, skills: { ...(cur.skills || {}) } };
    } catch {
      /* 坏了就重建，不覆盖别人的条目（下面只增删我们自己的） */
    }
  }
  const stamp = new Date().toISOString();
  for (const n of skillNames) {
    if (remove) {
      if (lock.skills[n]?.source === "redteam-skills-portable") delete lock.skills[n];
      continue;
    }
    if (lock.skills[n] && lock.skills[n].source !== "redteam-skills-portable") continue; // 不抢别人的
    lock.skills[n] = {
      source: "redteam-skills-portable",
      sourceType: "local",
      sourceUrl: path.join(home, ".agents", "skills", n),
      skillPath: `skills/${n}/SKILL.md`,
      installedAt: lock.skills[n]?.installedAt || stamp,
      updatedAt: stamp,
    };
  }
  if (!Object.keys(lock.skills).length) {
    if (fs.existsSync(lockPath) && !dryRun) fs.rmSync(lockPath, { force: true });
    return 0;
  }
  if (!dryRun) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  }
  return Object.keys(lock.skills).length;
}

function detect(target) {
  const hit = Object.entries(TARGETS)
    .filter(([, t]) => t.detect.some((p) => fs.existsSync(path.join(target, p))))
    .map(([k]) => k);
  return hit.length ? hit : ["agents"];
}

function parseIds(arg, table) {
  const ids =
    arg === "all" ? Object.keys(table) : arg === "auto" ? null : arg.split(",").map((s) => s.trim()).filter(Boolean);
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
    const where = [t.shared, t.dedicated, t.skillsDir ? `${t.skillsDir}/ → skills/` : null].filter(Boolean).join("  + ");
    console.log(`${k.padEnd(12)} ${where}`);
  }
  console.log("\n全局（--global）：");
  for (const [k, t] of Object.entries(GLOBAL_TARGETS)) {
    const where = [t.rule || "", t.skills ? `${t.skills}/` : ""].filter(Boolean).join("  + ") || "-";
    console.log(`${k.padEnd(12)} ~/${where}`);
  }
  console.log("\n技能真身：skills/<name>/SKILL.md（一份，其余宿主目录指向它）");
  console.log("记录库：  lib/record.sh");
}

// ── 卸载 ────────────────────────────────────────────────────────────────────
function uninstall(root, { dryRun }) {
  const m = loadManifest(root);
  let n = 0;
  console.log(`redteam-skills-portable v${VERSION} [卸载]${dryRun ? " [dry-run]" : ""}`);
  console.log(`目标：${root}\n`);
  for (const rel of m.blocks || []) {
    const s = removeBlock(path.join(root, rel), dryRun);
    console.log(`  ${s === "removed" ? "-" : "·"} ${rel}  (${s})`);
    if (s === "removed") n++;
  }
  for (const rel of m.files || []) {
    const p = path.join(root, rel);
    if (fs.existsSync(p) || isLink(p)) {
      if (!dryRun) fs.rmSync(p, { recursive: true, force: true });
      console.log(`  - ${rel}`);
      n++;
    }
  }
  for (const rel of m.skillDirs || []) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p) && !isLink(p)) continue;

    if (isLink(p)) {
      if (!dryRun) fs.rmSync(p, { recursive: true, force: true });
      console.log(`  - ${rel}/`);
      n++;
      continue;
    }
    // 目录：只删本工具装进来的条目（含真身目录 skills/ 与各宿主链接）
    const ours = new Set(m.installedSkills || []);
    let removed = 0;
    let kept = 0;
    for (const e of fs.readdirSync(p)) {
      const ep = path.join(p, e);
      const mine = ours.has(e) && (isLink(ep) || isDirectory(ep));
      if (mine) {
        if (!dryRun) fs.rmSync(ep, { recursive: true, force: true });
        removed++;
      } else kept++;
    }
    if (kept === 0) {
      if (!dryRun) fs.rmSync(p, { recursive: true, force: true });
      console.log(`  - ${rel}/  (${removed} 项)`);
    } else {
      console.log(`  · ${rel}/  保留 ${kept} 个非本工具项，移除本工具 ${removed} 项`);
    }
    n += removed;
  }
  const libDir = path.join(root, "lib");
  if (fs.existsSync(path.join(libDir, "record.sh"))) {
    if (!dryRun) {
      for (const f of ["record.sh", "port.mjs"]) fs.rmSync(path.join(libDir, f), { force: true });
      if (!fs.readdirSync(libDir).length) fs.rmSync(libDir, { recursive: true, force: true });
    }
    console.log(`  - lib/`);
    n++;
  }
  // 全局安装写了技能注册表，卸载时把我们的条目撤掉
  if ((m.targets || []).includes("__global__")) {
    const left = updateSkillLock(root, m.installedSkills || [], { dryRun, remove: true });
    console.log(`  ~ ~/.agents/${LOCK_NAME}  (剩余 ${left} 个技能)`);
  }

  if (!dryRun) fs.rmSync(path.join(root, MANIFEST_NAME), { force: true });

  // 收起本次安装过程中建出来的空目录（只收空的，非空的一律不动）
  if (!dryRun) {
    // 技能目录 + 独立规则文件所在目录都要收，否则 .cursor/rules 这类空壳会留下
    const seeds = [...(m.skillDirs || []), ...(m.files || []), ...(m.blocks || [])];
    const tidied = pruneEmptyDirs(root, seeds);
    if (tidied) console.log(`  ~ 清理空目录 ${tidied} 个`);
  }

  console.log(`\n移除 ${n} 项${dryRun ? "（dry-run，未落盘）" : ""}。非本工具的文件与 runs/ 一律未删。`);
}

function isDirectory(p) {
  try {
    return fs.lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** 递归删除空目录，只处理宿主壳目录，不越过 root */
function pruneEmptyDirs(root, startDirs) {
  const candidates = new Set();
  for (const rel of startDirs) {
    let d = path.dirname(path.join(root, rel));
    while (d.startsWith(root) && d !== root) {
      candidates.add(d);
      d = path.dirname(d);
    }
  }
  // 由深到浅反复扫：删掉一层后上层可能才变空
  const sorted = [...candidates].sort(
    (a, b) => b.split(path.sep).length - a.split(path.sep).length
  );
  let count = 0;
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of sorted) {
      if (!fs.existsSync(d)) continue;
      try {
        if (fs.readdirSync(d).length === 0) {
          fs.rmdirSync(d);
          count++;
          changed = true;
        }
      } catch {
        /* 非空或权限问题，跳过 */
      }
    }
  }
  return count;
}

// ── main ────────────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const dryRun = argv.includes("--dry-run");
  const global = argv.includes("--global");
  const skillsOnly = argv.includes("--skills-only");
  const copy = argv.includes("--copy");
  const doUninstall = argv.includes("--uninstall");

  if (argv.includes("--list") || argv.includes("-l")) {
    printList();
    return;
  }

  if (!dryRun && !doUninstall) build({ out: DIST });
  else if (!doUninstall && !fs.existsSync(path.join(DIST, "AGENTS.md"))) build({ out: DIST });

  const body = doUninstall ? "" : fs.readFileSync(path.join(DIST, "AGENTS.md"), "utf8");
  const root = global ? os.homedir() : path.resolve(get("--target") || process.cwd());

  if (doUninstall) {
    uninstall(root, { dryRun });
    return;
  }

  const ideArg = (get("--ide") || (global ? "all" : "auto")).toLowerCase();
  const manifest = loadManifest(root);

  if (global) {
    const ids = parseIds(ideArg, GLOBAL_TARGETS) || Object.keys(GLOBAL_TARGETS);
    console.log(`redteam-skills-portable v${VERSION} [全局]${dryRun ? " [dry-run]" : ""}`);
    console.log(`HOME：${root}`);
    console.log(`目标：${ids.join(", ")}\n`);

    const canonical = path.join(DIST, "skills");
    const skillNames = fs.readdirSync(canonical).filter((n) => fs.existsSync(path.join(canonical, n, "SKILL.md")));
    const done = new Set();

    for (const id of ids) {
      const t = GLOBAL_TARGETS[id];
      if (!skillsOnly && t.rule) {
        const dest = path.join(root, t.rule);
        if (t.mode === "dedicated") {
          // dedicated：整文件覆盖，保留 frontmatter（Qoder/Kiro 靠它判定 always_on）
          if (!dryRun) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.copyFileSync(path.join(DIST, t.source), dest);
          }
          console.log(`  + ~/${t.rule}  (${t.label}, dedicated)`);
          if (!manifest.files.includes(t.rule)) manifest.files.push(t.rule);
        } else {
          const status = upsertBlock(dest, body, dryRun);
          console.log(`  ${status === "created" ? "+" : "~"} ~/${t.rule}  (${t.label}, ${status})`);
          if (!manifest.blocks.includes(t.rule)) manifest.blocks.push(t.rule);
        }
      }
      if (t.skills && !done.has(t.skills)) {
        done.add(t.skills);
        // 全局：必须复制成独立副本。指向包内 dist/ 的链接在包被移动/删除后就断了。
        const r = linkOrCopy(canonical, path.join(root, t.skills), { dryRun, copy: true });
        console.log(`  + ~/${t.skills}/  (${t.label}, ${r.count} 个技能, ${r.mode})`);
        if (!manifest.skillDirs.includes(t.skills)) manifest.skillDirs.push(t.skills);
      }
    }

    // 记录库装到 REDTEAM_HOME，全局技能里的 $RT_LIB 才有落点
    const homeLib = path.join(root, ".redteam", "lib");
    if (!dryRun) {
      fs.mkdirSync(homeLib, { recursive: true });
      for (const f of fs.readdirSync(path.join(DIST, "lib"))) {
        fs.copyFileSync(path.join(DIST, "lib", f), path.join(homeLib, f));
        fs.chmodSync(path.join(homeLib, f), 0o755);
      }
    }
    console.log(`  + ~/.redteam/lib/  (记录库, ${fs.readdirSync(path.join(DIST, "lib")).length} 个文件)`);
    if (!manifest.skillDirs.includes(".redteam/lib")) manifest.skillDirs.push(".redteam/lib");

    // 记录装进来的技能名，全局卸载时才能精确识别
    if (!dryRun) manifest.installedSkills = skillNames;

    // 全局技能注册表跟着走，避免孤目录
    if (done.has(".agents/skills")) {
      const total = updateSkillLock(root, skillNames, { dryRun });
      console.log(`  ~ ~/.agents/${LOCK_NAME}  (注册 ${total} 个技能)`);
    }

    if (!manifest.targets.includes("__global__")) manifest.targets.push("__global__");
    saveManifest(root, manifest, dryRun);
    console.log(`\n完成。全局规则会在所有项目生效；只要某个 IDE 的规则就用 --uninstall 撤。`);
    return;
  }

  // 项目级
  const ids = parseIds(ideArg, TARGETS) || detect(root);
  console.log(`redteam-skills-portable v${VERSION}${dryRun ? " [dry-run]" : ""}`);
  console.log(`目标：${root}`);
  console.log(`IDE：${ids.join(", ")}\n`);

  // 技能真身：dist/skills → <target>/skills
  const r0 = linkOrCopy(path.join(DIST, "skills"), path.join(root, "skills"), { dryRun, copy: true });
  console.log(`  + skills/（${r0.count} 个 SKILL.md 真身）`);
  if (!manifest.skillDirs.includes("skills")) manifest.skillDirs.push("skills");
  // 记住装进来的技能名，卸载时才能精确区分「我们的」和「用户自己的」
  if (!dryRun) {
    manifest.installedSkills = fs
      .readdirSync(path.join(root, "skills"))
      .filter((n) => fs.existsSync(path.join(root, "skills", n, "SKILL.md")));
  }

  // 记录库
  if (!dryRun) {
    fs.cpSync(path.join(DIST, "lib"), path.join(root, "lib"), { recursive: true, force: true });
    for (const f of fs.readdirSync(path.join(root, "lib"))) {
      fs.chmodSync(path.join(root, "lib", f), 0o755);
    }
  }
  console.log(`  + lib/（record.sh 记录库）`);

  const sharedDone = new Set();
  const skillsDone = new Set();

  for (const id of ids) {
    const t = TARGETS[id];
    if (t.shared && !sharedDone.has(t.shared)) {
      sharedDone.add(t.shared);
      const status = upsertBlock(path.join(root, t.shared), body, dryRun);
      console.log(`  ${status === "created" ? "+" : "~"} ${t.shared}  (${status})`);
      if (!manifest.blocks.includes(t.shared)) manifest.blocks.push(t.shared);
    }
    if (t.dedicated) {
      const dst = path.join(root, t.dedicated);
      if (!dryRun) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(path.join(DIST, t.dedicated), dst);
      }
      console.log(`  + ${t.dedicated}  (${t.label})`);
      if (!manifest.files.includes(t.dedicated)) manifest.files.push(t.dedicated);
    }
    if (t.skillsDir && !skillsDone.has(t.skillsDir)) {
      skillsDone.add(t.skillsDir);
      // 指向项目内的真身 skills/，而不是包的 dist/——包被移走后链接才不断
      const r = linkOrCopy(path.join(root, "skills"), path.join(root, t.skillsDir), { dryRun, copy });
      console.log(`  + ${t.skillsDir}/  (${t.label}, ${r.count} 个 → skills/, ${r.mode})`);
      if (!manifest.skillDirs.includes(t.skillsDir)) manifest.skillDirs.push(t.skillsDir);
    }
  }

  saveManifest(root, manifest, dryRun);
  const names = fs.readdirSync(path.join(DIST, "skills"));
  console.log(`\n完成。${names.length} 个技能已就位，入口先读索引，命中任务再打开 skills/<name>/SKILL.md。`);
  console.log(`下一步：export RT_LIB="$PWD/lib" && "$RT_LIB/record.sh" doctor`);
  console.log(`卸载：node install.mjs --target ${path.relative(process.cwd(), root) || "."} --uninstall`);
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

if (isEntry()) main();
