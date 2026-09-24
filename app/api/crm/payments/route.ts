import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

const METHODS = ["cash", "card", "transfer", "etc"] as const;

/**
 * GET /api/crm/payments?member_id=&pass_id=&membership_id=&outstanding=1
 *
 * 결제 내역 조회.
 * outstanding=1 → 미수금이 있는 회원만 (passes/memberships 기준)
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const memberId = url.searchParams.get("member_id");
  const passId = url.searchParams.get("pass_id");
  const membershipId = url.searchParams.get("membership_id");
  const outstandingOnly = url.searchParams.get("outstanding") === "1";

  // H2: 센터 전체 결제원장/미수금 조회는 재무 열람 권한 필수.
  //   - 특정 회원/상품 스코프(member_id·pass_id·membership_id)면 허용(회원 상세 결제탭).
  //   - 필터 없는 전체 조회 또는 outstanding=1(미수금 개요)은 stats.view 필요.
  const isCenterWide = !memberId && !passId && !membershipId;
  if ((isCenterWide || outstandingOnly) && !(await ctxHasPermission(ctx, "stats.view"))) {
    return NextResponse.json({ error: "통계 열람 권한이 없습니다" }, { status: 403 });
  }

  // 미수금 회원 + 미수액 총합 모드
  if (outstandingOnly) {
    const [passesRes, mbRes] = await Promise.all([
      supabase
        .from("crm_passes")
        .select("member_id, outstanding_won, lesson_kind")
        .eq("center_id", ctx.centerId)
        .gt("outstanding_won", 0)
        .in("status", ["valid", "expired"]),
      supabase
        .from("crm_memberships")
        .select("member_id, outstanding_won, plan_name")
        .eq("center_id", ctx.centerId)
        .gt("outstanding_won", 0)
        .in("status", ["valid", "expired"]),
    ]);
    const map = new Map<
      number,
      { member_id: number; total: number; items: { kind: string; outstanding: number }[] }
    >();
    for (const p of passesRes.data ?? []) {
      const cur = map.get(p.member_id) ?? { member_id: p.member_id, total: 0, items: [] };
      cur.total += p.outstanding_won;
      cur.items.push({ kind: p.lesson_kind, outstanding: p.outstanding_won });
      map.set(p.member_id, cur);
    }
    for (const m of mbRes.data ?? []) {
      const cur = map.get(m.member_id) ?? { member_id: m.member_id, total: 0, items: [] };
      cur.total += m.outstanding_won;
      cur.items.push({ kind: m.plan_name, outstanding: m.outstanding_won });
      map.set(m.member_id, cur);
    }
    const memberIds = Array.from(map.keys());
    const { data: members } = memberIds.length
      ? await supabase
          .from("crm_members")
          .select("id, name, phone")
          .in("id", memberIds)
          .eq("center_id", ctx.centerId)
      : { data: [] };
    const memberMap = new Map((members ?? []).map((m) => [m.id, m]));
    const rows = Array.from(map.values())
      .map((v) => ({
        member_id: v.member_id,
        name: memberMap.get(v.member_id)?.name ?? "",
        phone: memberMap.get(v.member_id)?.phone ?? "",
        total_outstanding: v.total,
        items: v.items,
      }))
      .sort((a, b) => b.total_outstanding - a.total_outstanding);
    return NextResponse.json({ outstanding: rows });
  }

  let q = supabase
    .from("crm_payments")
    // ⚠️ 한 줄 리터럴로 유지 — 문자열을 이어붙이면 Supabase 타입 추론이 깨진다
    .select(
      "id, member_id, pass_id, membership_id, rental_id, amount_won, method, method_custom, paid_at, note, status, created_at, recorded_by_uid, source, order_id"
    )
    .eq("center_id", ctx.centerId)
    .order("paid_at", { ascending: false })
    .limit(200);

  if (memberId) q = q.eq("member_id", Number(memberId));
  if (passId) q = q.eq("pass_id", Number(passId));
  if (membershipId) q = q.eq("membership_id", Number(membershipId));

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  // 결제에 연결된 상품 이름(수강권 종류 / 회원권명) 을 붙여준다. (#id 대신 사람이 읽을 이름)
  const rows = data ?? [];
  const passIds = Array.from(
    new Set(rows.map((r) => r.pass_id).filter((v): v is number => !!v))
  );
  const membershipIds = Array.from(
    new Set(rows.map((r) => r.membership_id).filter((v): v is number => !!v))
  );
  const rentalIds = Array.from(
    new Set(rows.map((r) => r.rental_id).filter((v): v is number => !!v))
  );
  const passNameMap = new Map<number, string>();
  const membershipNameMap = new Map<number, string>();
  const rentalNameMap = new Map<number, string>();
  // 상품을 결제 받은 판매 직원(seller_member_id) 매핑
  const passSellerMap = new Map<number, number | null>();
  const membershipSellerMap = new Map<number, number | null>();
  const rentalSellerMap = new Map<number, number | null>();
  if (passIds.length > 0) {
    const { data: passes } = await supabase
      .from("crm_passes")
      .select("id, lesson_kind, seller_member_id")
      .eq("center_id", ctx.centerId)
      .in("id", passIds);
    for (const p of passes ?? []) {
      passNameMap.set(p.id, p.lesson_kind);
      passSellerMap.set(p.id, p.seller_member_id);
    }
  }
  if (membershipIds.length > 0) {
    const { data: memberships } = await supabase
      .from("crm_memberships")
      .select("id, plan_name, seller_member_id")
      .eq("center_id", ctx.centerId)
      .in("id", membershipIds);
    for (const m of memberships ?? []) {
      membershipNameMap.set(m.id, m.plan_name);
      membershipSellerMap.set(m.id, m.seller_member_id);
    }
  }
  if (rentalIds.length > 0) {
    const { data: rentals } = await supabase
      .from("crm_rentals")
      .select("id, item_name, seller_member_id")
      .eq("center_id", ctx.centerId)
      .in("id", rentalIds);
    for (const r of rentals ?? []) {
      rentalNameMap.set(r.id, r.item_name);
      rentalSellerMap.set(r.id, r.seller_member_id);
    }
  }

  // 판매 직원 id → 이름, 그리고 결제를 기록한 직원(recorded_by_uid) → 이름 매핑.
  // 담당 직원(결제 받은 직원) = 상품 판매 직원 우선, 없으면 결제 기록 직원.
  const sellerIds = Array.from(
    new Set(
      [...passSellerMap.values(), ...membershipSellerMap.values(), ...rentalSellerMap.values()].filter(
        (v): v is number => !!v
      )
    )
  );
  const recorderUids = Array.from(
    new Set(rows.map((r) => r.recorded_by_uid).filter((v): v is string => !!v))
  );
  const staffByIdMap = new Map<number, string>();
  const staffByUidMap = new Map<string, string>();
  if (sellerIds.length > 0) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("id, display_name")
      .eq("center_id", ctx.centerId)
      .in("id", sellerIds);
    for (const s of staff ?? []) staffByIdMap.set(s.id, s.display_name);
  }
  if (recorderUids.length > 0) {
    const { data: staff } = await supabase
      .from("crm_center_members")
      .select("firebase_uid, display_name")
      .eq("center_id", ctx.centerId)
      .in("firebase_uid", recorderUids);
    for (const s of staff ?? []) {
      if (s.firebase_uid) staffByUidMap.set(s.firebase_uid, s.display_name);
    }
  }

  /* ── 온라인(PG) 결제 정보 ────────────────────────────────────────
     어디서 결제됐고 어디서 환불됐는지 구분해 보여주기 위해 주문을 함께 읽는다.
     환불로 상품이 회수되면 payments 의 상품 연결이 끊겨 상품명이 비는데,
     주문에 남은 스냅샷 이름을 대신 쓴다. */
  const orderIds = Array.from(
    new Set(rows.map((r) => r.order_id).filter((v): v is number => !!v))
  );
  const orderMap = new Map<
    number,
    { product_name: string; channel: string; pg_provider: string; refunded_at: string | null }
  >();
  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from("crm_orders")
      .select("id, product_name, channel, pg_provider, refunded_at")
      .eq("center_id", ctx.centerId)
      .in("id", orderIds);
    for (const o of (orders ?? []) as {
      id: number;
      product_name: string;
      channel: string;
      pg_provider: string;
      refunded_at: string | null;
    }[]) {
      orderMap.set(o.id, {
        product_name: o.product_name,
        channel: o.channel,
        pg_provider: o.pg_provider,
        refunded_at: o.refunded_at,
      });
    }
  }

  /* ── 환불 이력 ───────────────────────────────────────────────────
     결제내역은 원장이다. 결제 행 하나의 상태만 보여주면 언제 얼마가 어떻게
     돌아갔는지 알 수 없다. 결제 행 아래에 환불 이벤트를 붙여 보여준다.
     결제원장이 지워진 환불(상품 회수 등)도 order_id 로 이어붙인다. */
  const refundsByPayment = new Map<number, RefundRow[]>();
  const refundsByOrder = new Map<number, RefundRow[]>();
  type RefundRow = {
    id: number;
    amount_won: number;
    refunded_at: string;
    source: string;
    provider: string | null;
    is_partial: boolean;
    reason: string | null;
    actor_name: string | null;
  };
  {
    const paymentIds = rows.map((r) => r.id);
    const ordIds = rows.map((r) => r.order_id).filter((v): v is number => !!v);
    if (paymentIds.length > 0) {
      const { data: refunds } = await supabase
        .from("crm_payment_refunds")
        .select("id, payment_id, order_id, amount_won, refunded_at, source, provider, is_partial, reason, actor_uid")
        .eq("center_id", ctx.centerId)
        .or(
          [
            `payment_id.in.(${paymentIds.join(",")})`,
            ordIds.length ? `order_id.in.(${ordIds.join(",")})` : "",
          ]
            .filter(Boolean)
            .join(",")
        )
        .order("refunded_at", { ascending: true });

      const list = (refunds ?? []) as unknown as (RefundRow & {
        payment_id: number | null;
        order_id: number | null;
        actor_uid: string | null;
      })[];

      // 센터 환불을 누른 직원 이름
      const actorUids = Array.from(
        new Set(list.map((r) => r.actor_uid).filter((v): v is string => !!v))
      );
      const actorMap = new Map<string, string>();
      if (actorUids.length > 0) {
        const { data: staff } = await supabase
          .from("crm_center_members")
          .select("firebase_uid, display_name")
          .eq("center_id", ctx.centerId)
          .in("firebase_uid", actorUids);
        for (const st of (staff ?? []) as { firebase_uid: string; display_name: string }[]) {
          actorMap.set(st.firebase_uid, st.display_name);
        }
      }

      for (const r of list) {
        const item: RefundRow = {
          id: r.id,
          amount_won: r.amount_won,
          refunded_at: r.refunded_at,
          source: r.source,
          provider: r.provider,
          is_partial: r.is_partial,
          reason: r.reason,
          actor_name: r.actor_uid ? actorMap.get(r.actor_uid) ?? null : null,
        };
        if (r.payment_id) {
          const arr = refundsByPayment.get(r.payment_id) ?? [];
          arr.push(item);
          refundsByPayment.set(r.payment_id, arr);
        } else if (r.order_id) {
          const arr = refundsByOrder.get(r.order_id) ?? [];
          arr.push(item);
          refundsByOrder.set(r.order_id, arr);
        }
      }
    }
  }

  // ── 묶음 상품 판정 ──────────────────────────────────────────────
  // '상품 관리'에서 구성 상품(components)을 달아둔 상품만 묶음으로 본다.
  // 장바구니에 여러 개 담아 한 번에 결제한 건은 묶음이 아니다.
  // 구성 상품은 발급 시 별도 마커가 없어 '부모 상품과 같은 시각(±3초) + 구성 상품명 일치'로 연결한다.
  const { data: bundleProducts } = await supabase
    .from("crm_products")
    .select("name, components")
    .eq("center_id", ctx.centerId)
    .not("components", "is", null);
  /** 이름 정규화 — 수강권은 발급 시 뒤에 '(N회)' 가 붙는다 */
  const normName = (v: string | null | undefined) =>
    (v ?? "").replace(/\s*\(\d+\s*회\)\s*$/, "").trim();
  const componentsByParent = new Map<string, Set<string>>();
  for (const bp of (bundleProducts ?? []) as { name: string; components: unknown }[]) {
    const comps = Array.isArray(bp.components) ? (bp.components as { name?: string }[]) : [];
    const names = comps.map((c) => normName(c?.name)).filter(Boolean);
    if (names.length === 0) continue;
    const key = normName(bp.name);
    const set = componentsByParent.get(key) ?? new Set<string>();
    names.forEach((n) => set.add(n));
    componentsByParent.set(key, set);
  }

  const nameOf = (r: (typeof rows)[number]): string =>
    normName(
      r.pass_id
        ? passNameMap.get(r.pass_id)
        : r.membership_id
          ? membershipNameMap.get(r.membership_id)
          : r.rental_id
            ? rentalNameMap.get(r.rental_id)
            : null
    );

  const bundleIds = new Set<number>();
  if (componentsByParent.size > 0) {
    for (const parent of rows) {
      const comps = componentsByParent.get(nameOf(parent));
      if (!comps) continue;
      const pt = Date.parse(parent.created_at);
      const children = rows.filter(
        (c) =>
          c.id !== parent.id &&
          c.member_id === parent.member_id &&
          Math.abs(Date.parse(c.created_at) - pt) <= 3000 &&
          comps.has(nameOf(c))
      );
      if (children.length === 0) continue; // 구성 상품이 함께 발급되지 않았으면 묶음 표시 안 함
      bundleIds.add(parent.id);
      children.forEach((c) => bundleIds.add(c.id));
    }
  }

  const payments = rows.map((r) => {
    const sellerId = r.pass_id
      ? passSellerMap.get(r.pass_id) ?? null
      : r.membership_id
        ? membershipSellerMap.get(r.membership_id) ?? null
        : r.rental_id
          ? rentalSellerMap.get(r.rental_id) ?? null
          : null;
    const handlerName =
      (sellerId ? staffByIdMap.get(sellerId) : null) ??
      (r.recorded_by_uid ? staffByUidMap.get(r.recorded_by_uid) : null) ??
      null;
    const ord = r.order_id ? orderMap.get(r.order_id) ?? null : null;
    return {
      ...r,
      product_name: r.pass_id
        ? passNameMap.get(r.pass_id) ?? "수강권"
        : r.membership_id
          ? membershipNameMap.get(r.membership_id) ?? "회원권"
          : r.rental_id
            ? rentalNameMap.get(r.rental_id) ?? "대여"
            : // 환불로 상품이 회수된 온라인 결제 — 주문에 남은 이름을 쓴다
              ord?.product_name ?? null,
      handler_name: handlerName,
      /** 온라인 결제면 어디서 결제됐는지. 직원 발급이면 null */
      pg: ord
        ? {
            provider: ord.pg_provider,
            channel: ord.channel, // web | app
            /** PG 쪽에서 취소된 시각. 값이 있으면 '센터 환불' 이 아니라 'PG 환불' */
            refundedAt: ord.refunded_at,
          }
        : null,
      /** 상품 관리의 묶음 상품(부모 또는 그 구성 상품)으로 결제된 건 */
      bundle: bundleIds.has(r.id),
      /** 이 결제에 발생한 환불 이벤트들 (시간 오름차순) */
      refunds: [
        ...(refundsByPayment.get(r.id) ?? []),
        ...(r.order_id ? refundsByOrder.get(r.order_id) ?? [] : []),
      ].sort((a, b) => a.refunded_at.localeCompare(b.refunded_at)),
    };
  });

  return NextResponse.json({ payments });
}

/**
 * POST /api/crm/payments
 *
 * 결제 기록(추가 회수). 해당 수강권/회원권의 outstanding_won 을 차감하고
 * payment_status 를 paid/partial 로 갱신한다.
 *
 * Body: { pass_id?, membership_id?, amount_won, method, method_custom?, paid_at?, note? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: {
    pass_id?: number;
    membership_id?: number;
    amount_won?: number;
    method?: string;
    method_custom?: string;
    paid_at?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const passId = body.pass_id ? Number(body.pass_id) : null;
  const mbId = body.membership_id ? Number(body.membership_id) : null;
  if ((!passId && !mbId) || (passId && mbId)) {
    return NextResponse.json({ error: "수강권 또는 회원권 중 하나만 선택해 주세요" }, { status: 400 });
  }
  const amount = Math.floor(Number(body.amount_won) || 0);
  if (amount <= 0) {
    return NextResponse.json({ error: "결제 금액을 입력해 주세요" }, { status: 400 });
  }
  const method =
    body.method && METHODS.includes(body.method as (typeof METHODS)[number]) ? body.method : "cash";

  // 1) 대상 row 의 outstanding 확인 + 잠금 (member_id 도 같이 구함)
  const table = passId ? "crm_passes" : "crm_memberships";
  const targetId = (passId ?? mbId) as number;
  const { data: target, error: targetErr } = await supabase
    .from(table)
    .select("id, member_id, outstanding_won, price_won")
    .eq("id", targetId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (targetErr || !target) {
    return NextResponse.json({ error: "대상을 찾을 수 없습니다" }, { status: 404 });
  }
  if (amount > target.outstanding_won) {
    return NextResponse.json(
      { error: `미수금(${target.outstanding_won.toLocaleString("ko-KR")}원) 보다 큰 금액은 입력할 수 없습니다` },
      { status: 400 }
    );
  }

  // 2) payment 기록
  const { error: payErr } = await supabase.from("crm_payments").insert({
    center_id: ctx.centerId,
    member_id: target.member_id,
    pass_id: passId,
    membership_id: mbId,
    amount_won: amount,
    method,
    method_custom: body.method_custom?.trim() || null,
    paid_at: body.paid_at || new Date().toISOString(),
    recorded_by_uid: ctx.uid,
    note: body.note?.trim() || null,
    status: "completed",
  });
  if (payErr) {
    return NextResponse.json({ error: "결제 기록 실패", detail: payErr.message }, { status: 500 });
  }

  // 3) outstanding 차감 + payment_status 갱신
  const newOutstanding = target.outstanding_won - amount;
  const newStatus =
    newOutstanding <= 0 ? "paid" : newOutstanding < target.price_won ? "partial" : "unpaid";
  const { error: updErr } = await supabase
    .from(table)
    .update({ outstanding_won: newOutstanding, payment_status: newStatus } as never)
    .eq("id", targetId);
  if (updErr) {
    return NextResponse.json({ error: "상태 갱신 실패", detail: updErr.message }, { status: 500 });
  }

  // 4) 감사 로그
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "payment.create",
    entity_type: passId ? "crm_passes" : "crm_memberships",
    entity_id: targetId,
    payload: { amount_won: amount, method, member_id: target.member_id } as never,
  });

  return NextResponse.json({ ok: true, outstanding_won: newOutstanding, payment_status: newStatus });
}
