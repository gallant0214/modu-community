import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { paginateAll } from "@/app/lib/crm-coupons-db";
import { parsePhoneList } from "@/app/lib/phone-list";

export const dynamic = "force-dynamic";

/** 한 번에 확인할 수 있는 번호 수 */
const MAX_PHONES = 1000;

/**
 * POST /api/crm/coupons/match-phones
 * body: { phones: string[] }  — 쿠폰 발송 '전화번호로 입력'에서 붙여넣은 번호
 *
 * 쿠폰은 회원에게 발급되므로 번호를 이 센터 회원(활성)과 맞춰 본다.
 * 회원 연락처는 하이픈 유무가 섞여 있어 숫자만 비교한다.
 * 한 번호에 회원이 여러 명(가족 등)이면 모두 돌려주고, 화면 명단에서 직원이 뺄 수 있다.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "coupons.send"))) {
    return NextResponse.json({ error: "쿠폰 발송 권한이 없습니다" }, { status: 403 });
  }

  let body: { phones?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const raw = Array.isArray(body.phones) ? body.phones.filter((p): p is string => typeof p === "string") : [];
  const phones = parsePhoneList(raw.join("\n"));
  if (phones.length > MAX_PHONES) {
    return NextResponse.json({ error: `번호는 한 번에 ${MAX_PHONES}개까지 확인할 수 있어요` }, { status: 400 });
  }
  if (phones.length === 0) return NextResponse.json({ matches: [], unmatched: [] });

  const members = await paginateAll<{ id: number; name: string; phone: string | null }>((f, t) =>
    supabase
      .from("crm_members")
      .select("id, name, phone")
      .eq("center_id", ctx.centerId)
      .eq("status", "active")
      .not("phone", "is", null)
      .order("id", { ascending: true })
      .range(f, t)
  );
  const byPhone = new Map<string, { id: number; name: string; phone: string | null }[]>();
  for (const m of members) {
    const d = (m.phone ?? "").replace(/\D/g, "");
    if (!d) continue;
    const list = byPhone.get(d) ?? [];
    list.push(m);
    byPhone.set(d, list);
  }

  const matches: { phone: string; members: { id: number; name: string; phone: string | null }[] }[] = [];
  const unmatched: string[] = [];
  for (const p of phones) {
    const hit = byPhone.get(p);
    if (hit?.length) matches.push({ phone: p, members: hit });
    else unmatched.push(p);
  }
  return NextResponse.json({ matches, unmatched });
}
