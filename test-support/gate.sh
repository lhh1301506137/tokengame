#!/usr/bin/env bash
# 门禁：完整测试 + 全部变异规格。结果无条件落盘，包括失败的那些。
#
# 放在 test-support/ 而不是 artifacts/：artifacts/ 是 gitignore 的，而这个脚本要能在
# 全新 checkout 里复跑——复核者拿到的必须是同一个判定口径，不是一段抄在报告里的命令。
# 输出仍然落在 artifacts/ 下（那里该被忽略），脚本本身进仓库。
#
# 用法：bash test-support/gate.sh   或   npm run gate
set -u
OUT="artifacts/gate-run"
mkdir -p "$OUT"

echo "=== npm test ==="
npm test > "$OUT/npm-test.txt" 2>&1
NPM_EXIT=$?
echo "NPM_TEST_EXIT=$NPM_EXIT"
grep -E "^ℹ (tests|pass|fail)" "$OUT/npm-test.txt"
grep -E "^✖ " "$OUT/npm-test.txt" | head -10

echo
echo "=== mutation specs ==="
TOTAL=0
KILLED=0
SURVIVED=0
SKIPPED=0
for spec in test-support/mutations/*.json; do
  name=$(basename "$spec")
  node test-support/mutate-suite.cjs "$spec" > "$OUT/mut-$name.txt" 2>&1
  line=$(grep -E "^合计 " "$OUT/mut-$name.txt" | tail -1)
  printf '%-40s %s\n' "$name" "${line:-无合计行（跑失败了）}"
  t=$(sed -n 's/^合计 \([0-9]*\)：杀掉 \([0-9]*\)，存活 \([0-9]*\)，未评估 \([0-9]*\).*/\1/p' <<<"$line")
  k=$(sed -n 's/^合计 \([0-9]*\)：杀掉 \([0-9]*\)，存活 \([0-9]*\)，未评估 \([0-9]*\).*/\2/p' <<<"$line")
  s=$(sed -n 's/^合计 \([0-9]*\)：杀掉 \([0-9]*\)，存活 \([0-9]*\)，未评估 \([0-9]*\).*/\3/p' <<<"$line")
  u=$(sed -n 's/^合计 \([0-9]*\)：杀掉 \([0-9]*\)，存活 \([0-9]*\)，未评估 \([0-9]*\).*/\4/p' <<<"$line")
  TOTAL=$((TOTAL + ${t:-0}))
  KILLED=$((KILLED + ${k:-0}))
  SURVIVED=$((SURVIVED + ${s:-0}))
  SKIPPED=$((SKIPPED + ${u:-0}))
  grep -E "^存活：|^未评估：" "$OUT/mut-$name.txt" | sed 's/^/    /'
done

echo
echo "MUTATION_TOTAL=$TOTAL KILLED=$KILLED SURVIVED=$SURVIVED SKIPPED=$SKIPPED"

# 未评估必须和存活一样刺眼。
#
# 这一条是本轮两次踩到的坑：改实现会让某条变异的查找串失配，那条变异于是根本没跑，
# 而它既不计入存活也不计入杀掉——聚合行显示 SURVIVED=0，复核者看一眼就过了。
# WEB-15 和 F5-26 都是这么溜过去的。未评估的变异不是「通过」，是「没测」。
if [ "$SKIPPED" -ne 0 ] || [ "$SURVIVED" -ne 0 ]; then
  echo "GATE=FAIL 存活 $SURVIVED 条，未评估 $SKIPPED 条（未评估等于没测，不算通过）"
  exit 1
fi
if [ "$TOTAL" -ne "$KILLED" ]; then
  echo "GATE=FAIL 合计 $TOTAL 与杀掉 $KILLED 不一致，聚合逻辑或某个规格的合计行有问题"
  exit 1
fi
if [ "$NPM_EXIT" -ne 0 ]; then
  echo "GATE=FAIL npm test 退出码 $NPM_EXIT"
  exit 1
fi
echo "GATE=PASS"
