import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/dashboard/no-contract-members
 * 유효회원(유효 회원권 또는 수강권 보유) 중 **서명된 전자계약서가 없는** 회원 목록.
 * 대시보드 '계약서 미작성 회원' 카드 → 클릭 시 리스트 표시.
 * 센터 집계라 trainer 는 제외(데이터 격리). owner/admin/manager/fc/alba 등 센터 직원.
 */
async function gather<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const out: T[] = [];
  const SIZE = 1000;
  for (let page = 0; page < 50; page++) {
    const from = page * SIZE;
    const { data } = await build(from, from + SIZE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < SIZE) break;
  }
  return out;
}

export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  // 데이터 격리: trainer(강사·fc·알바 매핑) 는 센터 집계 금지
  if (ctx.role === "trainer") {
    return NextResponse.json({ error: "권한이 없습니다" }, { status: 403 });
  }

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 1) 유효회원 member_id (유효 회원권 또는 수강권, 만료일 >= 오늘)
  const validIds = new Set<number>();
  const mships = await gather<{ member_id: number; expires_at: string }>((from, to) =>
    supabase
      .from("crm_memberships")
      .select("member_id, expires_at")
      .eq("center_id", ctx.centerId)
      .eq("status", "valid")
      .range(from, to)
  );
  for (const m of mships) if (m.member_id && m.expires_at >= today) validIds.add(m.member_id);
  const passes = await gather<{ member_id: number; expires_at: string }>((from, to) =>
    supabase
      .from("crm_passes")
      .select("member_id, expires_at")
      .eq("center_id", ctx.centerId)
      .eq("status", "valid")
      .range(from, to)
  );
  for (const p of passes) if (p.member_id && p.expires_at >= today) validIds.add(p.member_id);

  if (validIds.size === 0) return NextResponse.json({ members: [] });

  // 2) 서명된 계약서가 있는 member_id
  const signed = await gather<{ member_id: number | null }>((from, to) =>
    supabase
      .from("crm_signed_contracts")
      .select("member_id")
      .eq("center_id", ctx.centerId)
      .eq("status", "signed")
      .not("member_id", "is", null)
      .range(from, to)
  );
  const hasContract = new Set<number>();
  for (const s of signed) if (s.member_id) hasContract.add(s.member_id);

  // 3) 유효회원 - 계약서 보유 = 미작성
  const missingIds = Array.from(validIds).filter((id) => !hasContract.has(id));
  if (missingIds.length === 0) return NextResponse.json({ members: [] });

  // 4) 이름·연락처 조회 (in 은 안전하게 청크)
  const members: { id: number; name: string; phone: string | null }[] = [];
  for (let i = 0; i < missingIds.length; i += 300) {
    const chunk = missingIds.slice(i, i + 300);
    const { data } = await supabase
      .from("crm_members")
      .select("id, name, phone")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .in("id", chunk);
    for (const m of data ?? []) members.push({ id: m.id, name: m.name, phone: m.phone ?? null });
  }
  members.sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return NextResponse.json({ members });
}
