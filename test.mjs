#!/usr/bin/env node
/**
 * test.mjs —— 端到端验收，把「看起来能用」变成「跑过才算数」。
 *
 *   node test.mjs          全部跑一遍
 *   node test.mjs -v       打印每步细节
 *
 * 覆盖：移植残留 / 构建幂等 / 安装 / 链接 / 卸载 / 全局 / lock 保护 / 记录库 / 错误处理
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERBOSE = process.argv.includes("-v");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rt-test-"));

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = "") {
  pass++;
  console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`);
}
function bad(name, detail = "") {
  fail++;
  failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `  ${detail}` : ""}`);
}
function check(name, cond, detail = "") {
  cond ? ok(name, detail) : bad(name, detail);
}
function section(t) {
  console.log(`\n\x1b[36m${t}\x1b[0m`);
}
function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: VERBOSE ? "inherit" : "pipe", ...opts });
}
function shOut(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
  } catch (e) {
    return `__ERR__${e.status}:${(e.stderr || e.message || "").slice(0, 200)}`;
  }
}
const exists = (p) => fs.existsSync(p);
const isLink = (p) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};
const countSkill = (dir) =>
  exists(dir) ? fs.readdirSync(dir).filter((n) => exists(path.join(dir, n, "SKILL.md"))).length : 0;

const NODE = process.execPath;
const BUILD = path.join(ROOT, "build.mjs");
const INSTALL = path.join(ROOT, "install.mjs");
const RECORD = path.join(ROOT, "lib", "record.sh");

// ═══ 1. 移植 ══════════════════════════════════════════════════════════════
section("1. 移植：宿主私有依赖是否清零");

const ported = await import(path.join(ROOT, "lib", "port.mjs"));
const skills = (await import(path.join(ROOT, "build.mjs"))).loadSkills();
check(`加载 ${skills.length} 个技能`, skills.length === 23, `期望 23`);

const residue = skills.filter((s) => s.problems.length);
check("无宿主私有残留", residue.length === 0, residue.map((s) => `${s.name}:${s.problems}`).join("; "));

const forbidden = [
  [/\bredteam_(?!skills)[a-z]+_(add|list|query|search|get|hit|upsert|link|update|check)\b/, "DSH 私有工具调用"],
  [/\$DSH_HOME|\$\{DSH_HOME\}/, "DSH_HOME 变量"],
  [/dsh-redteam-mode/, "DSH 包名"],
  [/<你的VPS_IP>|<VPS_IP>/, "VPS 占位符"],
];
let violations = [];
for (const s of skills) {
  for (const [re, why] of forbidden) {
    const m = s.text.match(re);
    if (m) violations.push(`${s.name}: ${why} → ${m[0]}`);
  }
}
check("23 份正文零违规", violations.length === 0, violations.slice(0, 3).join("; "));

const hasPreamble = skills.filter((s) => s.text.includes("前置：工具与环境")).length;
check("每份都有环境前置段", hasPreamble === 23, `${hasPreamble}/23`);

const needsToolkit = skills.filter((s) => s.text.includes("RT_TOOLKIT")).length;
check("工具路径统一走 RT_TOOLKIT", needsToolkit > 0, `${needsToolkit} 份引用`);

const descOk = skills.filter((s) => /USE WHEN:/.test(s.description)).length;
check("whenToUse 已并入 description", descOk === 23, `${descOk}/23`);

// ═══ 2. 构建 ══════════════════════════════════════════════════════════════
section("2. 构建：可复现、幂等、不误删");

const DIST = path.join(ROOT, "dist");
sh(`"${NODE}" "${BUILD}"`);
check("dist/AGENTS.md 生成", exists(path.join(DIST, "AGENTS.md")));
check("dist/lib/record.sh 生成", exists(path.join(DIST, "lib", "record.sh")));
check("dist/skills 有 23 份", countSkill(path.join(DIST, "skills")) === 23);

const snapOf = () =>
  shOut(`cd "${DIST}" && find . -type f ! -name '.redteam-manifest.json' -exec md5 -q {} \\; | sort | md5`);
const snap1 = snapOf();
sh(`"${NODE}" "${BUILD}"`);
const snap2 = snapOf();
check("二次构建结果一致", snap1 === snap2, `${snap1} vs ${snap2}`);

// --out 到外部目录：不残留、不误删用户文件
const OUT = path.join(TMP, "custom-out");
sh(`"${NODE}" "${BUILD}" --out "${OUT}"`);
fs.writeFileSync(path.join(OUT, "USER_FILE.txt"), "mine");
sh(`"${NODE}" "${BUILD}" --out "${OUT}"`);
check("--out 不残留旧产物", !exists(path.join(OUT, "STALE.md")));
check("--out 不误删用户文件", exists(path.join(OUT, "USER_FILE.txt")));

// 构建失败守卫
const guardSkill = path.join(ROOT, "skills", "__guard__");
fs.mkdirSync(guardSkill, { recursive: true });
fs.writeFileSync(
  path.join(guardSkill, "SKILL.md"),
  "---\nname: __guard__\ndescription: 残留测试\n---\n\n调用 redteam_unmapped_tool 落库。\n"
);
let guardOut = "";
let guardExit = 0;
try {
  guardOut = execSync(`"${NODE}" "${BUILD}" --out "${path.join(TMP, "guard")}" 2>&1`, {
    encoding: "utf8",
    stdio: "pipe",
  });
} catch (e) {
  guardExit = e.status ?? 1;
  guardOut = `${e.stdout || ""}${e.stderr || ""}`;
}
fs.rmSync(guardSkill, { recursive: true, force: true });
check("未映射工具时构建失败", guardExit !== 0, `exit=${guardExit}`);
check(
  "失败原因说明残留",
  /移植后仍有宿主私有残留|未映射的 redteam_/.test(guardOut),
  guardOut.split("\n").find((l) => l.includes("redteam")) || guardOut.split("\n")[0]
);

// ═══ 3. 项目级安装 ════════════════════════════════════════════════════════
section("3. 项目级安装：链接、幂等、内容正确");

const PROJ = path.join(TMP, "proj");
fs.mkdirSync(PROJ, { recursive: true });
sh(`"${NODE}" "${INSTALL}" --target "${PROJ}" --ide all`);

check("skills/ 真身 23 份", countSkill(path.join(PROJ, "skills")) === 23);
check("lib/record.sh 就位", exists(path.join(PROJ, "lib", "record.sh")));
check("record.sh 可执行", (fs.statSync(path.join(PROJ, "lib", "record.sh")).mode & 0o111) !== 0);

const hostDirs = [
  ".claude/skills",
  ".codex/skills",
  ".qoder/skills",
  ".trae/skills",
  ".codebuddy/skills",
  ".codebuddycn/skills",
  ".workbuddy/skills",
  ".zcode/skills",
  ".agents/skills",
];
let linkOk = 0;
let readableOk = 0;
for (const d of hostDirs) {
  const p = path.join(PROJ, d, "active-scan");
  if (isLink(p)) linkOk++;
  if (exists(path.join(p, "SKILL.md"))) readableOk++;
}
check(`${hostDirs.length} 个宿主目录全是 symlink`, linkOk === hostDirs.length, `${linkOk}/${hostDirs.length}`);
check("链接目标全部可读", readableOk === hostDirs.length, `${readableOk}/${hostDirs.length}`);
check(
  "链接指向项目内 skills/ 而非 dist/",
  shOut(`readlink "${path.join(PROJ, ".claude/skills/active-scan")}"`) === "../../skills/active-scan",
  shOut(`readlink "${path.join(PROJ, ".claude/skills/active-scan")}"`)
);

const ruleCount = shOut(`find "${PROJ}" -maxdepth 3 -name "*.md" -o -maxdepth 3 -name ".rules" -o -maxdepth 3 -name ".goosehints" | wc -l`);
check("规则入口已写入", parseInt(ruleCount) >= 20, `${ruleCount.trim()} 个`);

// 幂等
sh(`"${NODE}" "${INSTALL}" --target "${PROJ}" --ide all`);
const markerCount = fs.readFileSync(path.join(PROJ, "AGENTS.md"), "utf8").split("redteam-skills:start").length - 1;
check("二次安装不叠加标记块", markerCount === 1, `${markerCount} 个`);

// 不破坏用户内容
fs.writeFileSync(path.join(PROJ, "CLAUDE.md"), "# 我的项目\n\n自定义规则。\n");
sh(`"${NODE}" "${INSTALL}" --target "${PROJ}" --ide claude`);
const claudeTxt = fs.readFileSync(path.join(PROJ, "CLAUDE.md"), "utf8");
check("用户已有内容保留", claudeTxt.startsWith("# 我的项目"));
check("追加而非覆盖", claudeTxt.includes("自定义规则") && claudeTxt.includes("redteam-skills:start"));

// --copy 降级
const CP = path.join(TMP, "copy-proj");
fs.mkdirSync(CP, { recursive: true });
sh(`"${NODE}" "${INSTALL}" --target "${CP}" --ide claude --copy`);
check("--copy 模式生成真实文件", !isLink(path.join(CP, ".claude/skills/active-scan")));
check("--copy 内容正确", exists(path.join(CP, ".claude/skills/active-scan/SKILL.md")));

// dry-run
const DR = path.join(TMP, "dry-proj");
fs.mkdirSync(DR, { recursive: true });
sh(`"${NODE}" "${INSTALL}" --target "${DR}" --ide all --dry-run`);
check("--dry-run 不落盘", fs.readdirSync(DR).length === 0, `${fs.readdirSync(DR).join(",") || "空"}`);

// ═══ 4. 记录库 ════════════════════════════════════════════════════════════
section("4. 记录库：12 实体 / 查询 / 计分 / 转义");

const RK = path.join(TMP, "record-work");
fs.mkdirSync(RK, { recursive: true });
const rec = (args, env = {}) =>
  shOut(`cd "${RK}" && NO_COLOR=1 REDTEAM_HOME="${path.join(TMP, "rh")}" bash "${RECORD}" ${args}`, {
    env: { ...process.env, ...env },
  });

const entities = [
  "asset add target=10.0.0.5 source=nmap tags=internal",
  "port add host=10.0.0.5 port=22 service=ssh",
  "vuln add target=10.0.0.5 name=CVE-2024-0001 severity=high",
  "cred add host=10.0.0.5 username=root secret_type=password --secret secret_value=toor",
  "access add host=10.0.0.5 method=ssh privilege=root",
  "tunnel add kind=frp listen=127.0.0.1:1080 reach=10.0.0.0/24",
  "webshell add url=http://10.0.0.5/s.jsp shell_type=godzilla",
  "chain add stage_code=internal tool=ssh result=ok",
  "evidence add target=10.0.0.5 request=GET response=200",
  "poc add name=redis-exp verified=true",
  "attack add name=exp.py path=runs/exp.py",
  "test add target=10.0.0.5 status=tested",
];
let writeOk = 0;
for (const e of entities) {
  const r = rec(e);
  if (!r.startsWith("__ERR__") && r.includes("→")) writeOk++;
}
check("12 个实体全部可写", writeOk === entities.length, `${writeOk}/12`);

const files = fs.readdirSync(path.join(RK, "runs", "engagement")).filter((f) => f.endsWith(".jsonl"));
check("生成 12 个 jsonl", files.length === 12, `${files.length} 个`);

// JSON 合法性
let jsonOk = true;
let jsonBad = "";
for (const f of files) {
  for (const line of fs.readFileSync(path.join(RK, "runs", "engagement", f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      JSON.parse(line);
    } catch {
      jsonOk = false;
      jsonBad = `${f}: ${line.slice(0, 60)}`;
    }
  }
}
check("输出全是合法 JSON", jsonOk, jsonBad);

// 转义
rec(`chain add stage_code=esc tool='echo "hi" | grep -E "a\\"b"' result='含"引号"和\\反斜杠'`);
const chainLines = fs
  .readFileSync(path.join(RK, "runs", "engagement", "chain.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const escLine = chainLines.find((l) => l.stage_code === "esc");
check("引号/反斜杠转义正确", escLine && escLine.tool.includes('grep -E "a\\"b"'), escLine?.tool);

// 查询
const q = rec("asset query 10.0.0.5");
check("query 命中", q.includes("10.0.0.5") && !q.startsWith("__ERR__"));
const qMiss = rec("asset query 192.168.99.99");
check("query 无命中不报错", qMiss.includes("无命中") || qMiss === "");

// 计分
const s1 = rec("score server-host target=10.0.0.5");
check("计分 server-host = 50", s1.includes("+50"));
const s2 = rec("score web-app-admin target=10.0.0.5");
check("计分 web-app-admin = 20", s2.includes("+20"));
const s3 = rec("score bogus-kind target=x");
check("未知得分点给警告不崩", s3.includes("未知得分点") || s3.includes("0 分"));

const rep = rec("report");
check("report 汇总总分 70", rep.includes("总分 70"), rep.split("\n").pop());

// doctor
const doc = rec("doctor");
check("doctor 输出工具链", doc.includes("工具链") && doc.includes("凭据/配置"));
check("doctor 无 ANSI 残留", !doc.includes("\x1b["));
check("doctor 无未展开变量", !/\$\{c_[a-z]+\}/.test(doc), (doc.match(/\$\{c_[a-z]+\}/) || [])[0]);
// 颜色逻辑本身：源文件里所有 ${c_*} 必须在双引号格式串里（单引号不展开）
const recSrc = fs.readFileSync(RECORD, "utf8");
const badQuoting = recSrc
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .filter((l) => /\$\{c_[a-z]+\}/.test(l))
  .filter((l) => {
    // 该行里 ${c_*} 出现在 printf 的单引号格式串中 → 不会展开
    const m = l.match(/printf\s+'([^']*\$\{c_[a-z]+\}[^']*)'/);
    return !!m;
  });
check("颜色变量不在单引号格式串里", badQuoting.length === 0, badQuoting[0]?.trim().slice(0, 60));

// 错误处理
const e1 = rec("badent add a=b");
check("未知实体报错", e1.includes("未知实体"));
const e2 = rec("asset badact");
check("未知动作报错", e2.includes("未知动作"));
const e3 = rec("asset add");
check("缺字段报错", e3.includes("至少给一个字段"));
const stray = fs.readdirSync(path.join(RK, "runs", "engagement")).filter((f) => f.startsWith(".") || f === ".jsonl");
check("错误路径不留杂散文件", stray.length === 0, stray.join(","));

// ═══ 5. 卸载 ══════════════════════════════════════════════════════════════
section("5. 卸载：精确回滚，不动用户文件");

const UN = path.join(TMP, "uninstall-proj");
fs.mkdirSync(UN, { recursive: true });
fs.writeFileSync(path.join(UN, "AGENTS.md"), "# 我的项目\n\n自定义规则。\n");
sh(`"${NODE}" "${INSTALL}" --target "${UN}" --ide all`);
// 用户自己的技能
const mineDir = path.join(UN, "skills", "my-own-skill");
fs.mkdirSync(mineDir, { recursive: true });
fs.writeFileSync(path.join(mineDir, "SKILL.md"), "---\nname: my-own-skill\ndescription: mine\n---\n");
fs.mkdirSync(path.join(UN, "runs"), { recursive: true });
fs.writeFileSync(path.join(UN, "runs", "keep.txt"), "keep");

sh(`"${NODE}" "${INSTALL}" --target "${UN}" --uninstall`);

check("红队技能已移除", !exists(path.join(UN, "skills", "active-scan")));
check("用户自己的技能保留", exists(path.join(UN, "skills", "my-own-skill", "SKILL.md")));
check("runs/ 保留", exists(path.join(UN, "runs", "keep.txt")));
check("宿主链接已清", !exists(path.join(UN, ".claude", "skills", "active-scan")));
check("lib/ 已清", !exists(path.join(UN, "lib", "record.sh")));
check("manifest 已清", !exists(path.join(UN, ".redteam-manifest.json")));
const agentsTxt = fs.readFileSync(path.join(UN, "AGENTS.md"), "utf8");
check("用户内容完好", agentsTxt.includes("# 我的项目") && agentsTxt.includes("自定义规则"));
check("标记块已移除", !agentsTxt.includes("redteam-skills:start"));
check("无生成头残留", !agentsTxt.includes("由 build.mjs 生成"));
const leftover = fs.readdirSync(UN).filter((f) => !["AGENTS.md", "skills", "runs"].includes(f));
check("无空壳目录残留", leftover.length === 0, leftover.join(","));

// ═══ 6. 全局 ══════════════════════════════════════════════════════════════
section("6. 全局安装：独立副本 + lock 保护");

const HOME = path.join(TMP, "fakehome");
fs.mkdirSync(path.join(HOME, ".agents"), { recursive: true });
fs.writeFileSync(
  path.join(HOME, ".agents", ".skill-lock.json"),
  JSON.stringify({ version: 3, skills: { "user-own": { source: "github", sourceUrl: "https://x/y.git" } } }, null, 2)
);

sh(`HOME="${HOME}" "${NODE}" "${INSTALL}" --global --ide all`);

check("全局 skills 是真实文件", !isLink(path.join(HOME, ".dsh", "skills", "active-scan")));
check("全局技能可读", exists(path.join(HOME, ".dsh", "skills", "active-scan", "SKILL.md")));
const lockAfter = JSON.parse(fs.readFileSync(path.join(HOME, ".agents", ".skill-lock.json"), "utf8"));
check("用户 lock 条目保留", "user-own" in lockAfter.skills);
check(
  "红队技能已注册",
  Object.values(lockAfter.skills).filter((v) => v.source === "redteam-skills-portable").length === 23,
  `${Object.values(lockAfter.skills).filter((v) => v.source === "redteam-skills-portable").length}/23`
);

sh(`HOME="${HOME}" "${NODE}" "${INSTALL}" --global --uninstall`);
const lockFinal = JSON.parse(fs.readFileSync(path.join(HOME, ".agents", ".skill-lock.json"), "utf8"));
check("卸载后只剩用户条目", Object.keys(lockFinal.skills).join(",") === "user-own", Object.keys(lockFinal.skills).join(","));
check("全局技能已清", !exists(path.join(HOME, ".dsh", "skills", "active-scan")));
check("全局规则已清", !exists(path.join(HOME, ".codex", "AGENTS.md")));

// ═══ 7. 跨平台/可移植 ═════════════════════════════════════════════════════
section("7. 可移植性：零依赖、可搬家");

const MOVE = path.join(TMP, "moved-package");
const SKIP = new Set([".git", "dist", "node_modules", "runs"]);
fs.cpSync(ROOT, MOVE, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(ROOT, src);
    if (!rel) return true;
    return !rel.split(path.sep).some((seg) => SKIP.has(seg));
  },
});
check("无 node_modules 依赖", !exists(path.join(MOVE, "node_modules")));
const moveBuild = shOut(`"${NODE}" "${path.join(MOVE, "build.mjs")}" 2>&1`);
check("搬家后仍能构建", moveBuild.includes("已生成"), moveBuild.split("\n").pop());
check("无外部 npm 依赖", !JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).dependencies);

// 装到搬家后的位置，链接仍指向自身
const MP = path.join(TMP, "moved-proj");
fs.mkdirSync(MP, { recursive: true });
sh(`"${NODE}" "${path.join(MOVE, "install.mjs")}" --target "${MP}" --ide claude`);
const mvLink = shOut(`readlink "${path.join(MP, ".claude/skills/active-scan")}"`);
check("搬家后链接指向项目内 skills/", mvLink === "../../skills/active-scan", mvLink);
check("搬家后链接可读", exists(path.join(MP, ".claude/skills/active-scan/SKILL.md")));

// ═══ 汇总 ════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
if (fail === 0) {
  console.log(`\x1b[32m全部通过：${pass} 项\x1b[0m`);
} else {
  console.log(`\x1b[31m${fail} 项失败\x1b[0m / ${pass} 项通过`);
  failures.forEach((f) => console.log(`  \x1b[31m·\x1b[0m ${f}`));
}
console.log(`${"═".repeat(60)}`);

fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
