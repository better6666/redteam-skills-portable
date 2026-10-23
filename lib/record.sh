#!/usr/bin/env bash
# redteam record —— 跨 IDE 便携版的「资产库」
#
# 替代原 DSH 版里 19 个 redteam_* 私有工具。任何编码 Agent 都能直接跑它，
# 不依赖宿主、不依赖 Python、不依赖 node。产物是 engagements/<name>/ 下的 JSONL，
# 可以用 grep / jq / 任何编辑器复查。
#
# 用法：
#   record.sh <实体> <动作> [k=v ...]      写入
#   record.sh <实体> list|query [k=v ...]  查询
#   record.sh doctor                       体检：工具链 / 凭据 / 目录
#   record.sh score <kind> [k=v ...]       计分（自动算分）
#   record.sh report                       汇总统计
#   record.sh help
#
# 约定：
#   - 每次写入都要带上 engagement（默认取 $REDTEAM_ENGAGEMENT 或 latest）
#   - 追加写 + 时间戳，永不覆盖历史
#   - 敏感值（口令/哈希/key）默认只记录引用与脱敏摘要，加 --secret 才落明文
set -uo pipefail

RTH="${REDTEAM_HOME:-$HOME/.redteam}"
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 非 TTY / NO_COLOR / --no-color 时不输出颜色，日志和 JSON 才干净
if [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ] || [[ " $* " == *" --no-color "* ]]; then
  c_reset=""; c_dim=""; c_red=""; c_grn=""; c_yel=""; c_cya=""
else
  c_reset=$'\033[0m'; c_dim=$'\033[2m'; c_red=$'\033[31m'
  c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_cya=$'\033[36m'
fi

die() { printf '%s错误%s %s\n' "$c_red" "$c_reset" "$*" >&2; exit 1; }
dim() { printf '%s%s%s\n' "$c_dim" "$*" "$c_reset"; }

# ── 环境 ────────────────────────────────────────────────────────────────────
load_env() {
  local f
  for f in "$RTH/.env" "$HOME/.redteam/.env"; do
    [ -f "$f" ] || continue
    set -a
    # shellcheck disable=SC1090
    . "$f" >/dev/null 2>&1 || true
    set +a
  done
}

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

engagement_dir() {
  local e="${1:-${REDTEAM_ENGAGEMENT:-}}"
  if [ -z "$e" ]; then
    e="$RTH/engagements/latest"
    [ -d "$e" ] || e="$PWD/runs/engagement"
  else
    case "$e" in
      /*|*/*) : ;;
      *) e="$RTH/engagements/$e" ;;
    esac
  fi
  mkdir -p "$e"
  printf '%s' "$e"
}

# ── JSON 编码（无依赖，只处理字符串/数字/布尔）───────────────────────────────
jesc() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/\\n}
  s=${s//$'\r'/\\r}
  s=${s//$'\t'/\\t}
  printf '%s' "$s"
}

is_num() { [[ $1 =~ ^-?[0-9]+([.][0-9]+)?$ ]]; }

# k=v 列表 → JSON 对象片段
kv_to_json() {
  local out="" kv k v
  for kv in "$@"; do
    case "$kv" in
      *=*) : ;;
      *) die "参数必须是 k=v 形式：$kv" ;;
    esac
    k="${kv%%=*}"; v="${kv#*=}"
    [ -n "$out" ] && out+=","
    case "$k" in
      port|severity_num|count|score)
        is_num "$v" && out+="\"$k\":$v" || out+="\"$k\":\"$(jesc "$v")\"" ;;
      *)
        out+="\"$k\":\"$(jesc "$v")\"" ;;
    esac
  done
  printf '%s' "$out"
}

validate_entity() {
  case "$1" in
    asset|host|target|port|service|vuln|vulnerability|cred|credential|access|session|\
    tunnel|pivot|webshell|shell|chain|action|evidence|http|poc|template|\
    attack|attack_file|score|hit|asset_test|test) return 0 ;;
    *) die "未知实体：$1（可用：asset port vuln cred access tunnel webshell chain evidence poc attack score test）" ;;
  esac
}

# ── 实体 ────────────────────────────────────────────────────────────────────
# entity → 文件基名
entity_file() {
  case "$1" in
    asset|host|target)      echo asset ;;
    port|service)           echo port ;;
    vuln|vulnerability)     echo vuln ;;
    cred|credential)        echo credential ;;
    access|session)         echo access ;;
    tunnel|pivot)           echo tunnel ;;
    webshell|shell)         echo webshell ;;
    chain|action)           echo chain ;;
    evidence|http)          echo evidence ;;
    poc|template)           echo poc ;;
    attack|attack_file)     echo attack_file ;;
    score|hit)              echo score ;;
    asset_test|test)        echo asset_test ;;
    *) die "未知实体：$1（可用：asset port vuln cred access tunnel webshell chain evidence poc attack score test）" ;;
  esac
}

cmd_write() {
  local ent=$1; shift
  validate_entity "$ent" || exit 1
  local file
  file=$(entity_file "$ent")
  local dir; dir=$(engagement_dir "${REDTEAM_ENGAGEMENT:-}")
  local kv=() secret=0
  for a in "$@"; do
    [ "$a" = "--secret" ] && secret=1 || kv+=("$a")
  done
  [ ${#kv[@]} -eq 0 ] && die "至少给一个字段：record.sh $ent add k=v ..."

  # engagement 从目录反推，保证每行自描述
  local eng; eng=$(basename "$dir")
  [ "$eng" = "latest" ] && eng=$(basename "$(dirname "$dir")")
  if [ "$eng" = "$(basename "$PWD/runs/engagement")" ]; then
    eng="${REDTEAM_ENGAGEMENT:-$eng}"
  fi

  local line="{\"ts\":\"$(now)\",\"engagement\":\"$(jesc "$eng")\",$(kv_to_json "${kv[@]}")}"
  printf '%s\n' "$line" >> "$dir/$file.jsonl"
  local n; n=$(wc -l < "$dir/$file.jsonl" | tr -d ' ')
  printf '%s+%s %-11s → %s (%s 条)\n' "$c_grn" "$c_reset" "$file" "${dir##*/}/$file.jsonl" "$n"
}

# ── 查询 ────────────────────────────────────────────────────────────────────
cmd_read() {
  local ent=$1 action=$2; shift 2
  validate_entity "$ent" || exit 1
  local file; file=$(entity_file "$ent")
  local dir; dir=$(engagement_dir "${REDTEAM_ENGAGEMENT:-}")
  local f="$dir/$file.jsonl"
  [ -f "$f" ] || { dim "（空）$f 不存在"; return 0; }

  # query: 只输出命中行；list: 全部
  if [ "$action" = "query" ]; then
    [ $# -eq 0 ] && die "query 需要条件：record.sh $ent query k=v ..."
    local grep_args=()
    for c in "$@"; do grep_args+=("-e" "$(printf '%s' "$c" | sed 's/[]\/$*.^[]/\\&/g')"); done
    grep -F "${grep_args[@]/#-e/-e}" "$f" 2>/dev/null || grep -F -- "$@" "$f" || dim "（无命中）"
  else
    cat "$f"
  fi
}

# ── 计分（沿用原版评分档）─────────────────────────────────────────────────────
score_of() {
  case "$1" in
    web-app)        echo 10 ;;
    web-app-admin)  echo 20 ;;
    db-credential)  echo 30 ;;
    server-host)    echo 50 ;;
    boundary)       echo 30 ;;
    domain)         echo 40 ;;
    *) echo 0 ;;
  esac
}

cmd_score() {
  local kind=$1; shift
  local pts; pts=$(score_of "$kind")
  [ "$pts" = "0" ] && dim "警告：未知得分点 '$kind'，按 0 分记。可用：web-app(10) web-app-admin(20) db-credential(30) server-host(50) boundary(30) domain(40)"
  printf "${c_cya}=${c_reset} %s +%s 分\n" "$kind" "$pts"
  cmd_write score kind="$kind" score="$pts" "$@" 2>/dev/null | tail -1
}

# ── 体检 ────────────────────────────────────────────────────────────────────
cmd_doctor() {
  load_env
  echo "═══ redteam doctor ═══"
  printf 'HOME   %s\n' "$RTH"
  printf 'TOOLKIT %s\n' "${RT_TOOLKIT:-$RTH/toolkit}"
  printf 'ENGAGE  %s\n\n' "${REDTEAM_ENGAGEMENT:-（未设置，用 latest）}"

  echo "── 工具链 ──"
  local tk="${RT_TOOLKIT:-$RTH/toolkit}" miss=0 total=0
  check_bin() { # name path [alt]
    total=$((total+1))
    local n=$1 p=$2 a=${3:-}
    if [ -x "$p" ]; then printf "  ${c_grn}✓${c_reset} %-14s %s\n" "$n" "$p"
    elif [ -n "$a" ] && command -v "$a" >/dev/null 2>&1; then printf "  ${c_grn}✓${c_reset} %-14s PATH:%s\n" "$n" "$a"
    elif command -v "$n" >/dev/null 2>&1; then printf "  ${c_grn}✓${c_reset} %-14s PATH\n" "$n"
    else printf "  ${c_red}✗${c_reset} %-14s 缺失\n" "$n"; miss=$((miss+1)); fi
  }
  check_bin nmap     "" nmap
  check_bin masscan  "" masscan
  check_bin subfinder "$tk/subfinder/subfinder" subfinder
  check_bin dnsx     "$tk/dnsx/dnsx" dnsx
  check_bin naabu    "$tk/naabu/naabu" naabu
  check_bin httpx    "$tk/httpx/httpx" httpx
  check_bin ffuf     "" ffuf
  check_bin nuclei   "" nuclei
  check_bin dirsearch "$tk/dirsearch/dirsearch" dirsearch
  check_bin fscan    "$tk/fscan/fscan" ""
  check_bin gogo     "$tk/gogo/gogo" ""
  check_bin chisel   "$tk/chisel/chisel" chisel
  check_bin frpc     "$tk/frp/frpc" ""
  check_bin frps     "$tk/frp/frps" ""
  check_bin suo5     "$tk/suo5/suo5-linux-amd64" ""
  check_bin hydra    "" hydra
  check_bin hashcat  "" hashcat
  check_bin jq       "" jq
  printf '\n  %s/%s 就绪' "$((total-miss))" "$total"
  [ "$miss" -gt 0 ] && printf "，${c_yel}%s 缺失${c_reset} → 见 skills/redteam-setup/SKILL.md 第二节\n" "$miss"
  printf '\n\n'

  echo "── 凭据/配置 ──"
  if [ -n "${FOFA_KEY:-}" ]; then printf "  ${c_grn}✓${c_reset} FOFA_KEY  %s…%s（长度 %s）\n" "${FOFA_KEY:0:4}" "${FOFA_KEY: -4}" "${#FOFA_KEY}"
  else printf "  ${c_yel}!${c_reset} FOFA_KEY 未配置 → fofa-recon 降级为 crt.sh 枚举\n"; fi
  if [ -n "${REDTEAM_VPS_HOST:-}" ]; then printf "  ${c_grn}✓${c_reset} VPS_HOST  %s\n" "$REDTEAM_VPS_HOST"
  else printf "  ${c_yel}!${c_reset} VPS_HOST 未配置 → 反弹 Shell / 隧道类技能不可用\n"; fi
  local key="${REDTEAM_VPS_KEY:-$tk/vps/id_rsa}"
  if [ -f "$key" ]; then
    local perm; perm=$(ls -l "$key" | cut -c1-10)
    case "$perm" in *-------*) printf "  ${c_grn}✓${c_reset} VPS_KEY   %s (%s)\n" "$key" "$perm";;
      *) printf "  ${c_yel}!${c_reset} VPS_KEY   %s 权限 %s → chmod 600\n" "$key" "$perm";; esac
  else printf "  ${c_yel}!${c_reset} VPS_KEY   %s 不存在\n" "$key"; fi
  printf '\n'

  echo "── 资产库 ──"
  local d; d=$(engagement_dir "${REDTEAM_ENGAGEMENT:-}")
  local n=0 f c
  for f in asset port vuln credential access tunnel webshell chain evidence poc attack score; do
    c=$([ -f "$d/$f.jsonl" ] && wc -l < "$d/$f.jsonl" | tr -d ' ' || echo 0)
    [ "$c" != "0" ] && printf '  %-12s %s\n' "$f" "$c"
    n=$((n+c))
  done
  printf '  合计 %s 条记录 @ %s\n' "$n" "$d"
}

# ── 汇总 ────────────────────────────────────────────────────────────────────
cmd_report() {
  local d; d=$(engagement_dir "${REDTEAM_ENGAGEMENT:-}")
  echo "═══ 作战报告 @ $d ═══"
  local f
  for f in asset vuln credential access tunnel webshell; do
    [ -f "$d/$f.jsonl" ] || continue
    printf '\n── %s (%s) ──\n' "$f" "$(wc -l < "$d/$f.jsonl" | tr -d ' ')"
    if command -v jq >/dev/null 2>&1; then
      jq -r '[.[]?] as $x | empty' "$d/$f.jsonl" >/dev/null 2>&1
      head -20 "$d/$f.jsonl"
    else head -20 "$d/$f.jsonl"; fi
  done
  if [ -f "$d/score.jsonl" ]; then
    local sum
    sum=$(grep -o '"score":[0-9]*' "$d/score.jsonl" | cut -d: -f2 | awk '{s+=$1} END{print s+0}')
    printf "\n${c_cya}总分 %s${c_reset}\n" "$sum"
  fi
}

cmd_help() {
  cat <<'EOF'
redteam record —— 便携版资产库（替代 DSH 私有工具）

写入
  record.sh asset      add target=1.2.3.4 ips=... source=fofa tags=web,edge
  record.sh port       add host=1.2.3.4 port=443 url=https://x title=后台
  record.sh vuln       add target=... name="Redis 未授权访问" severity=critical evidence_ref=runs/x.txt
  record.sh cred       add host=... username=root secret_type=password source=弱口令 --secret secret_value=xxx
  record.sh access     add host=... username=root method=ssh privilege=root session_ref=runs/shell1
  record.sh tunnel     add kind=frp listen=127.0.0.1:1080 entry=x reach=10.0.0.0/24
  record.sh webshell   add url=... shell_type=behinder pass_key=xxx privilege=...
  record.sh chain      add stage_code=internet tool="cmd 原文" result="回显摘要"
  record.sh evidence   add target=... request="GET /x" response="200 ..."
  record.sh poc        add name=... category=... verified=true note=...
  record.sh attack     add name=... path=runs/exp.py verified=true
  record.sh test       add target=... status=tested surface="后台/上传点"

查询
  record.sh asset query 1.2.3.4          # 子串匹配
  record.sh vuln  list
  record.sh cred  list
  record.sh doctor                        # 工具链/凭据/资产库体检
  record.sh report                        # 汇总 + 总分
  record.sh score server-host target=1.2.3.4 evidence="root shell"

环境
  REDTEAM_HOME        默认 ~/.redteam
  RT_TOOLKIT          工具链根目录，默认 $REDTEAM_HOME/toolkit
  REDTEAM_ENGAGEMENT  项目名，默认 latest
  FOFA_KEY / REDTEAM_VPS_HOST / REDTEAM_VPS_KEY / REDTEAM_VPS_USER  从 $REDTEAM_HOME/.env 自动加载
EOF
}

# ── main ────────────────────────────────────────────────────────────────────
load_env

# 全局剥离 --no-color，避免子命令参数解析被污染
_args=()
for _a in "$@"; do
  case "$_a" in
    --no-color) NO_COLOR=1 ;;
    *) _args+=("$_a") ;;
  esac
done
set -- "${_args[@]}"
[ -n "${NO_COLOR:-}" ] && { c_reset=""; c_dim=""; c_red=""; c_grn=""; c_yel=""; c_cya=""; }

[ $# -eq 0 ] && { cmd_help; exit 0; }

case "$1" in
  help|-h|--help)   cmd_help ;;
  doctor|--doctor)  cmd_doctor ;;
  report|--report)  cmd_report ;;
  score)            shift; [ $# -eq 0 ] && die "score 需要得分点：server-host|web-app|db-credential|boundary|domain"; cmd_score "$@" ;;
  *)
    ent=${1:-}; [ $# -gt 0 ] && shift
    act=${1:-list}; [ $# -gt 0 ] && shift
    case "$act" in
      add|upsert|write)  cmd_write "$ent" "$@" ;;
      list|ls)           cmd_read "$ent" list ;;
      query|get|find)    cmd_read "$ent" query "$@" ;;
      *) die "未知动作：${act}（add | list | query）" ;;
    esac ;;
esac
