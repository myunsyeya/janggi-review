#!/bin/zsh
# Hourly research run (launchd: com.myunsyeya.janggi-research, every hour at :17). Claude does one research step following
# research/PROMPT.md, with permissions limited to content/studies and research/ by the settings file below;
# this script then checks every move, deploys (build) and commits/pushes. Anything that fails is set aside
# in a git stash instead of being published.
#   on/off: the settings file exists or not.  test: touch research/.test-run (only checks that claude runs)
set -u
# launchd starts this every hour at :17; a run still going holds the lock and the next one skips
APP="$HOME/janggi-review"
SETTINGS="$HOME/.config/janggi-research/settings.json"
LOGDIR="$HOME/Library/Logs/janggi-research"
export PATH="$HOME/.local/node/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$LOGDIR"
exec >>"$LOGDIR/$(date +%F).log" 2>&1
echo "=== $(date '+%F %T') research run"
cd "$APP" || exit 1

if [[ -f research/.test-run ]]; then
  rm research/.test-run
  claude -p "연결 확인입니다. 'ok' 한 단어만 답하세요." --permission-mode dontAsk --output-format text
  echo "--- test exit $?"
  exit 0
fi
if [[ ! -f "$SETTINGS" ]]; then echo "skip: no $SETTINGS (switched off)"; exit 0; fi
if [[ -n "$(git status --porcelain)" ]]; then echo "skip: working tree has uncommitted changes"; git status --short; exit 0; fi
LOCK="$LOGDIR/.lock"
if ! mkdir "$LOCK" 2>/dev/null; then echo "skip: another run is in progress"; exit 0; fi
trap 'rmdir "$LOCK"' EXIT

# at most 90 minutes
OUT=$(perl -e 'alarm shift; exec @ARGV' 5400 \
  claude -p "$(cat research/PROMPT.md)" --settings "$SETTINGS" --permission-mode dontAsk --output-format text)
CODE=$?
echo "--- claude exit $CODE"
echo "$OUT"

set_aside() {
  echo "set aside: $1"
  git stash push -u -m "research $(date +%F): $1" && echo "(git stash list 로 확인)"
  exit 1
}
if [[ $CODE -ne 0 ]]; then
  [[ -n "$(git status --porcelain)" ]] && set_aside "claude exit $CODE"
  exit 1
fi
if [[ -z "$(git status --porcelain)" ]]; then echo "no changes"; exit 0; fi
OTHER=$(git status --porcelain | awk '{print $2}' | grep -vE '^(content/studies/|research/)')
[[ -n "$OTHER" ]] && set_aside "changed files outside content/studies, research: $OTHER"
npm run build || set_aside "build failed"

MSG=$(echo "$OUT" | sed -n '/[^[:space:]]/{p;q;}' | cut -c1-120)
git add content/studies research && git commit -q -m "${MSG:-연구 노트 $(date +%F)}" && git push -q origin main
echo "published: $(git log --oneline -1)"
