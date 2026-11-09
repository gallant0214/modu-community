#!/usr/bin/env node
/**
 * CRM '숨은 권한' 검사 — 빌드 전에 실행(package.json prebuild).
 *
 * 왜: 역할(owner/admin/manager/trainer)로 기능을 막으면 직급권한 화면에 스위치가 없는 '숨은 제한'이 된다.
 *   2026-11-09 사고 — 아르바이트가 PT 상담지를 저장하자 화면에 없는 '강사는 담당 상담만' 규칙에 걸려
 *   자기 상담지를 못 열었다(저장은 됐지만 사라진 것처럼 보임). 관리자 열에서 끈 권한이 무시되는 문제도 함께 발견.
 *
 * 규칙: app/api/crm·app/crm 에서 아래 패턴은 금지. 권한은 ctxHasPermission / requirePermission
 *   (app/lib/crm-permissions.ts) + 직급권한 항목(app/crm/_components/role-permissions.ts)으로만 판정한다.
 *   - needRole:
 *   - <무엇>.role === "owner" | role !== "trainer" ... (문자열 역할 비교)
 *   - base_role === "..."
 *   - accessLevel === "..."
 * 예외: 권한 판정이 아닌 구조적 규칙(대표자 보호·권한 상승 방지·표시용 라벨 등)은
 *   같은 줄이나 바로 위 2줄 안에 `perm-gate-ok: <이유>` 를 적는다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIRS = ["app/api/crm", "app/crm"];
const SKIP = new Set(["app/crm/_components/role-permissions.ts"]);

const PATTERNS = [
  { re: /\bneedRole\s*:/, what: "needRole" },
  { re: /\.role\s*[!=]==\s*["'`]/, what: "역할 문자열 비교(.role)" },
  { re: /\brole\s*[!=]==\s*["'`](owner|admin|manager|trainer|fc|alba)["'`]/, what: "역할 문자열 비교(role)" },
  { re: /\bbase_role\s*[!=]==\s*["'`]/, what: "base_role 비교" },
  { re: /\baccessLevel\s*[!=]==\s*["'`]/, what: "accessLevel 비교" },
];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const d of DIRS) {
  for (const file of walk(join(ROOT, d), [])) {
    const rel = relative(ROOT, file);
    if (SKIP.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
      const hit = PATTERNS.find((p) => p.re.test(line));
      if (!hit) return;
      const near = [line, lines[i - 1] ?? "", lines[i - 2] ?? ""].join("\n");
      if (near.includes("perm-gate-ok")) return;
      problems.push(`${rel}:${i + 1}  [${hit.what}]  ${t.slice(0, 120)}`);
    });
  }
}

if (problems.length) {
  console.error(
    "\n🚨 CRM 숨은 권한 검사 실패 — 역할로 기능을 막지 말고 직급권한(ctxHasPermission/requirePermission)으로 판정하세요.\n" +
      "   권한 판정이 아닌 구조적 규칙이면 그 줄(또는 바로 위)에 `perm-gate-ok: <이유>` 를 적으세요.\n"
  );
  for (const p of problems) console.error("  " + p);
  console.error(`\n  ${problems.length}건\n`);
  process.exit(1);
}
console.log("✓ CRM 숨은 권한 검사 통과");
