#!/usr/bin/env bash
# moducm-practical 리포 → 이 리포(app/lib/data/)로 실기·구술 데이터 동기화
# 사용법: bash scripts/sync-practical-data.sh
#
# 동작:
#   1) gallant0214/moducm-practical:master 의 src/data/{oral,practical,practical_sports}.ts 다운로드
#   2) app/lib/data/ 에 덮어쓰기 (단, practical.ts 의 referenceCategoriesSet export 라인은 보존)
#   3) 변경사항 있으면 git add + commit + push (origin/main)

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/gallant0214/moducm-practical/master/src/data"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="$ROOT/app/lib/data"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$ROOT"

# 1. 다운로드
echo "→ moducm-practical 에서 데이터 파일 다운로드 중..."
for f in oral.ts practical.ts practical_sports.ts; do
  curl -fsSL "$REPO_RAW/$f" -o "$TMP_DIR/$f"
  printf "  ✓ %s (%s bytes)\n" "$f" "$(wc -c < "$TMP_DIR/$f")"
done

# 2. practical.ts 에 referenceCategoriesSet 라인이 있으면 다운로드 받은 파일에 다시 추가
REF_LINE='export const referenceCategoriesSet = new Set(["남자 핏모델", "여자 핏모델"]);'
if grep -qF "$REF_LINE" "$DATA_DIR/practical.ts" 2>/dev/null; then
  if ! grep -qF "$REF_LINE" "$TMP_DIR/practical.ts"; then
    printf '\n%s\n' "$REF_LINE" >> "$TMP_DIR/practical.ts"
    echo "  ✓ practical.ts: referenceCategoriesSet 라인 보존"
  fi
fi

# 3. 변경사항 있는지 비교 후 복사
CHANGED=()
for f in oral.ts practical.ts practical_sports.ts; do
  if ! cmp -s "$TMP_DIR/$f" "$DATA_DIR/$f"; then
    cp "$TMP_DIR/$f" "$DATA_DIR/$f"
    CHANGED+=("$f")
  fi
done

if [ ${#CHANGED[@]} -eq 0 ]; then
  echo ""
  echo "✓ 변경사항 없음. 이미 최신 상태입니다."
  exit 0
fi

echo ""
echo "→ 변경된 파일: ${CHANGED[*]}"

# 4. 커밋 + 푸시
git add "$DATA_DIR"/oral.ts "$DATA_DIR"/practical.ts "$DATA_DIR"/practical_sports.ts

if git diff --cached --quiet; then
  echo "✓ staged 변경사항 없음 (이미 반영됨)"
  exit 0
fi

DATE_KR=$(date +%Y-%m-%d)
COMMIT_MSG="실기 구술 데이터 동기화 ($DATE_KR, moducm-practical 최신 반영)

변경: ${CHANGED[*]}"

git commit -m "$COMMIT_MSG"
echo ""
echo "→ origin/main 으로 푸시 중..."
git push origin HEAD
echo ""
echo "✓ 완료. Vercel 자동 배포가 시작됩니다."
