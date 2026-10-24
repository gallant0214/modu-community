import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/stats/trainer-revenue-detail?trainer_member_id=N&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * 한 강사(직원)의 기간 매출 상세 — 강사 상세 화면 '매출' 탭.
 *
 * 귀속·날짜 기준은 강사별 월별 매출 그래프(/api/crm/stats/trainer-revenue)와 동일해야
 * 두 화면 숫자가 어긋나지 않는다:
 *  - 수강권(crm_passes)       : trainer_member_id(담당강사), issued_at
 *  - 회원권(crm_memberships)  : seller_member_id(판매 직원), purchased_at ?? start_date
 *  - 대여권(crm_rentals)      : seller_member_id(판매 직원), start_date
 * ⚠️ 판매 직원 미지정 건은 귀속 불가 → 집계에서 빠진다.
 * ⚠️ 환불된 건(status='refunded')은 제외 — 그래프와 동일 기준.
 *
 * 카테고리:
 *  membership 회원권 / personal 개인 레슨(정원 1) / group 그룹 수업(정원 2+)
 *  locker 락커(대여권 중 이름에 '락커') / goods 운동 용품(그 외 대여권)
 */

type Category = "membership" | "personal" | "group" | "locker" | "goods";

interface RevenueItem {
  id: string;
  category: Category;
  date: string;
  member_id: number | null;
  member_name: string | null;
  member_phone: string | null;
  product_name: string;
  amount_won: number;
  discount_won: number;
  outstanding_won: number;
  payment_method: string | null;
  payment_method_custom: string | null;
  memo: string | null;
}

export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const canViewAllStats = (await ctxHasPermission(ctx, "stats.view")) || !!ctx.isSoloOwner;

  const url = new URL(request.url);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!ymd.test(from) || !ymd.test(to)) {
    return NextResponse.json({ error: "기간(from/to)이 필요합니다" }, { status: 400 });
  }
  if (from > to) {
    return NextResponse.json({ error: "시작일이 종료일보다 늦습니다" }, { status: 400 });
  }
  // to 는 포함(inclusive) → 다음날 미만으로 비교
  const toDate = new Date(`${to}T00:00:00Z`);
  toDate.setUTCDate(toDate.getUTCDate() + 1);
  const endExcl = toDate.toISOString().slice(0, 10);

  const trainerId = Number(url.searchParams.get("trainer_member_id")) || 0;
  if (!trainerId) {
    return NextResponse.json({ error: "강사(trainer_member_id)가 필요합니다" }, { status: 400 });
  }
  // 데이터 격리: 전체 통계 권한이 없으면 본인 것만
  if (!canViewAllStats && trainerId !== ctx.centerMemberId) {
    return NextResponse.json({ error: "다른 직원의 매출을 볼 권한이 없습니다" }, { status: 403 });
  }

  try {
    const [passRes, membershipRes, rentalRes] = await Promise.all([
      supabase
        .from("crm_passes")
        .select(
          "id, member_id, lesson_kind, price_won, discount_won, outstanding_won, payment_method, payment_method_custom, memo, issued_at, group_capacity, status"
        )
        .eq("center_id", ctx.centerId)
        .eq("trainer_member_id", trainerId)
        .neq("status", "refunded")
        .gte("issued_at", from)
        .lt("issued_at", endExcl)
        .limit(2000),
      supabase
        .from("crm_memberships")
        .select(
          "id, member_id, plan_name, price_won, discount_won, outstanding_won, payment_method, payment_method_custom, memo, purchased_at, start_date, status"
        )
        .eq("center_id", ctx.centerId)
        .eq("seller_member_id", trainerId)
        .neq("status", "refunded")
        .or(
          `and(purchased_at.gte.${from},purchased_at.lt.${endExcl}),` +
            `and(purchased_at.is.null,start_date.gte.${from},start_date.lt.${endExcl})`
        )
        .limit(2000),
      supabase
        .from("crm_rentals")
        .select(
          "id, member_id, item_name, price_won, discount_won, payment_method, payment_method_custom, memo, start_date, status"
        )
        .eq("center_id", ctx.centerId)
        .eq("seller_member_id", trainerId)
        .neq("status", "refunded")
        .gte("start_date", from)
        .lt("start_date", endExcl)
        .limit(2000),
    ]);
    const firstErr = passRes.error || membershipRes.error || rentalRes.error;
    if (firstErr) {
      return NextResponse.json({ error: "조회 실패", detail: firstErr.message }, { status: 500 });
    }

    const items: RevenueItem[] = [];

    for (const p of passRes.data ?? []) {
      if (!p.issued_at) continue;
      items.push({
        id: `pass:${p.id}`,
        category: (p.group_capacity ?? 1) > 1 ? "group" : "personal",
        date: p.issued_at,
        member_id: p.member_id,
        member_name: null,
        member_phone: null,
        product_name: p.lesson_kind || "수강권",
        amount_won: p.price_won ?? 0,
        discount_won: p.discount_won ?? 0,
        outstanding_won: p.outstanding_won ?? 0,
        payment_method: p.payment_method,
        payment_method_custom: p.payment_method_custom,
        memo: p.memo,
      });
    }
    for (const m of membershipRes.data ?? []) {
      const when = m.purchased_at ?? m.start_date;
      if (!when) continue;
      items.push({
        id: `membership:${m.id}`,
        category: "membership",
        date: when,
        member_id: m.member_id,
        member_name: null,
        member_phone: null,
        product_name: m.plan_name || "회원권",
        amount_won: m.price_won ?? 0,
        discount_won: m.discount_won ?? 0,
        outstanding_won: m.outstanding_won ?? 0,
        payment_method: m.payment_method,
        payment_method_custom: m.payment_method_custom,
        memo: m.memo,
      });
    }
    for (const r of rentalRes.data ?? []) {
      if (!r.start_date) continue;
      const name = r.item_name || "대여권";
      items.push({
        id: `rental:${r.id}`,
        category: name.includes("락커") ? "locker" : "goods",
        date: r.start_date,
        member_id: r.member_id,
        member_name: null,
        member_phone: null,
        product_name: name,
        amount_won: r.price_won ?? 0,
        discount_won: r.discount_won ?? 0,
        outstanding_won: 0, // 대여권에는 미수금 컬럼이 없다
        payment_method: r.payment_method,
        payment_method_custom: r.payment_method_custom,
        memo: r.memo,
      });
    }

    // 회원 이름·연락처 매핑
    const memberIds = Array.from(
      new Set(items.map((i) => i.member_id).filter((v): v is number => !!v))
    );
    if (memberIds.length > 0) {
      const { data: members } = await supabase
        .from("crm_members")
        .select("id, name, phone")
        .eq("center_id", ctx.centerId)
        .in("id", memberIds);
      const map = new Map((members ?? []).map((m) => [m.id, m]));
      for (const i of items) {
        const m = i.member_id ? map.get(i.member_id) : null;
        if (m) {
          i.member_name = m.name;
          i.member_phone = m.phone;
        }
      }
    }

    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const emptyBucket = () => ({ revenue: 0, outstanding: 0, count: 0 });
    const categories: Record<Category, { revenue: number; outstanding: number; count: number }> = {
      membership: emptyBucket(),
      personal: emptyBucket(),
      group: emptyBucket(),
      locker: emptyBucket(),
      goods: emptyBucket(),
    };
    for (const i of items) {
      const b = categories[i.category];
      b.revenue += i.amount_won;
      b.outstanding += i.outstanding_won;
      b.count += 1;
    }
    const total = {
      revenue: items.reduce((s, i) => s + i.amount_won, 0),
      outstanding: items.reduce((s, i) => s + i.outstanding_won, 0),
      count: items.length,
    };

    return NextResponse.json({ from, to, total, categories, items });
  } catch (e) {
    return NextResponse.json(
      { error: "조회 실패", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
