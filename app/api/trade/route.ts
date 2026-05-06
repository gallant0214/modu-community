import { supabase } from "@/app/lib/supabase";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { invalidateCache } from "@/app/lib/cache";
import { getBlockedUidsForRequest } from "@/app/lib/block-filter";
import type { Database } from "@/app/lib/database.types";

type TradePostInsert = Database["public"]["Tables"]["trade_posts"]["Insert"];

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────
// GET /api/trade — 거래 글 목록
// 쿼리: category(equipment|center|all), q(검색어), sigungu, page, limit, sort
// ─────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") || "all"; // all | equipment | center
    const q = url.searchParams.get("q")?.trim() || "";
    const sido = url.searchParams.get("sido")?.trim() || "";
    const sigungu = url.searchParams.get("sigungu")?.trim() || "";
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = Math.min(50, Number(url.searchParams.get("limit")) || 20);
    const sort = url.searchParams.get("sort") || "latest"; // latest | popular

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let qb = supabase
      .from("trade_posts")
      .select("*", { count: "exact" })
      .eq("status", "active");

    if (category === "equipment" || category === "center") qb = qb.eq("category", category);
    if (sido) qb = qb.eq("region_sido", sido);
    if (sigungu) qb = qb.eq("region_sigungu", sigungu);
    if (q) {
      // 제목/본문/제품명/센터명 부분일치 (최대 50자 제한)
      const safe = q.slice(0, 50).replace(/[%,]/g, "");
      qb = qb.or(
        `title.ilike.%${safe}%,body.ilike.%${safe}%,product_name.ilike.%${safe}%,center_name.ilike.%${safe}%`
      );
    }

    if (sort === "popular") {
      qb = qb.order("view_count", { ascending: false }).order("created_at", { ascending: false });
    } else {
      qb = qb.order("created_at", { ascending: false });
    }

    qb = qb.range(from, to);

    const { data, count, error } = await qb;
    if (error) throw error;

    // 차단 사용자 글 후처리 필터
    const blocked = await getBlockedUidsForRequest(request);
    const posts = blocked.length
      ? (data || []).filter((p: { firebase_uid: string }) => !blocked.includes(p.firebase_uid))
      : (data || []);

    return NextResponse.json({
      posts,
      total: count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > to + 1,
    });
  } catch (e) {
    console.error("GET /api/trade error:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────
// POST /api/trade — 거래 글 작성 (인증 필수)
// ─────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const {
    category,                    // 'equipment' | 'center'
    title,
    body: content,               // 리치에디터 HTML 또는 일반 텍스트
    region_sido,
    region_sigungu,
    region_detail,               // 중고거래 필수, 센터매매 선택
    contact_phone,
    image_urls,                  // string[]
    // equipment 전용
    product_name,
    condition_text,
    price_manwon,
    center_name,
    equipment_info,              // JSON: { trade_methods: [...] }
    // center 전용
    center_info,                 // JSON
    // 동의
    agreed_to_terms,
  } = body;

  // 공통 필수
  if (!category || (category !== "equipment" && category !== "center")) {
    return NextResponse.json({ error: "카테고리가 올바르지 않습니다" }, { status: 400 });
  }
  if (!title?.trim()) return NextResponse.json({ error: "제목을 입력해주세요" }, { status: 400 });
  if (!region_sido?.trim() || !region_sigungu?.trim()) {
    return NextResponse.json({ error: "지역(시·군·구까지)을 선택해주세요" }, { status: 400 });
  }
  if (!contact_phone?.trim()) {
    return NextResponse.json({ error: "연락처를 입력해주세요" }, { status: 400 });
  }
  if (!agreed_to_terms) {
    return NextResponse.json({ error: "등록 전 안내사항에 동의해주세요" }, { status: 400 });
  }

  // 카테고리별 필수
  if (category === "equipment") {
    if (!product_name?.trim() || !condition_text?.trim() || price_manwon === undefined || price_manwon === null || !center_name?.trim()) {
      return NextResponse.json({ error: "중고거래 필수 항목을 모두 입력해주세요" }, { status: 400 });
    }
    if (!region_detail?.trim()) {
      return NextResponse.json({ error: "중고거래는 상세 주소(만남 장소·동·번지 등)를 입력해주세요" }, { status: 400 });
    }
  } else {
    // category === 'center'
    if (!center_info || typeof center_info !== "object") {
      return NextResponse.json({ error: "센터 매매 상세 정보를 입력해주세요" }, { status: 400 });
    }
    const ci = center_info as Record<string, unknown>;
    if (!ci.industry || !ci.store_type || !ci.area_pyeong) {
      return NextResponse.json({ error: "센터 매매 필수 항목을 모두 입력해주세요" }, { status: 400 });
    }
  }

  // 이미지 1~10장
  const imgs: string[] = Array.isArray(image_urls) ? image_urls.filter((u: unknown) => typeof u === "string") : [];
  if (imgs.length < 1) {
    return NextResponse.json({ error: "사진을 최소 1장 이상 등록해주세요" }, { status: 400 });
  }
  if (imgs.length > 10) {
    return NextResponse.json({ error: "사진은 최대 10장까지 등록할 수 있습니다" }, { status: 400 });
  }

  const h = await headers();
  const ipAddr = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || ip || "unknown";

  const insertRow: TradePostInsert = {
    firebase_uid: user.uid,
    category,
    title: sanitize(validateLength(title.trim(), 200)),
    body: content ? sanitize(validateLength(String(content).trim(), 10000)) : null,
    region_sido: sanitize(validateLength(region_sido.trim(), 50)),
    region_sigungu: sanitize(validateLength(region_sigungu.trim(), 50)),
    contact_phone: sanitize(validateLength(contact_phone.trim(), 30)),
    image_urls: imgs,
    agreed_to_terms: true,
  };

  if (category === "equipment") {
    insertRow.product_name = sanitize(validateLength(String(product_name).trim(), 100));
    insertRow.condition_text = sanitize(validateLength(String(condition_text).trim(), 100));
    insertRow.price_manwon = Math.max(0, Math.floor(Number(price_manwon)));
    insertRow.center_name = sanitize(validateLength(String(center_name).trim(), 100));
    insertRow.equipment_info = equipment_info ?? null;
  } else {
    insertRow.center_info = center_info;
    // 센터매매에서 중고용 컬럼은 비움
    insertRow.center_name = null;
  }

  const { data, error } = await supabase
    .from("trade_posts")
    .insert(insertRow)
    .select("id")
    .single();

  if (error) {
    console.error("POST /api/trade insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await invalidateCache("trade:*").catch(() => {});

  // ipAddr는 로깅 용도로만 — 컬럼은 없음
  void ipAddr;

  return NextResponse.json({ success: true, id: data.id });
}
