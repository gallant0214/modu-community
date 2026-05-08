import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAuth, isAdminUid } from "@/app/lib/firebase-admin";
import { invalidateCache } from "@/app/lib/cache";
import { sanitize, validateLength } from "@/app/lib/security";
import type { Database } from "@/app/lib/database.types";

type TradePostUpdate = Database["public"]["Tables"]["trade_posts"]["Update"];

export const dynamic = "force-dynamic";

async function checkAdminEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const { count } = await supabase
    .from("admin_emails")
    .select("id", { count: "exact", head: true })
    .eq("email", email.toLowerCase());
  return (count ?? 0) > 0;
}

async function checkIsAdmin(uid: string, email: string | null | undefined): Promise<boolean> {
  if (isAdminUid(uid)) return true;
  return await checkAdminEmail(email);
}

// GET /api/trade/[tradeId] — 단건 조회 (+ 로그인 시 is_bookmarked 동기화)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const { tradeId } = await params;
  const id = Number(tradeId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
  }

  const { data: post, error } = await supabase
    .from("trade_posts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !post) {
    return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });
  }

  // 작성자 닉네임 조회 (nicknames 테이블 — placeholder 닉네임 제외)
  let author_nickname: string | null = null;
  if (post.firebase_uid) {
    const { data: nick } = await supabase
      .from("nicknames")
      .select("name")
      .eq("firebase_uid", post.firebase_uid)
      .maybeSingle();
    if (nick?.name && !nick.name.startsWith("__pending_")) {
      author_nickname = nick.name;
    }
  }

  let is_bookmarked = false;
  const user = await verifyAuth(request).catch(() => null);
  if (user) {
    const { data: b } = await supabase
      .from("trade_post_bookmarks")
      .select("id")
      .eq("trade_post_id", id)
      .eq("firebase_uid", user.uid)
      .maybeSingle();
    is_bookmarked = !!b;
  }

  const is_owner = !!user && user.uid === post.firebase_uid;
  const is_admin = !!user && (await checkIsAdmin(user.uid, user.email));
  return NextResponse.json({ ...post, author_nickname, is_bookmarked, is_owner, is_admin });
}

// DELETE /api/trade/[tradeId] — 본인 또는 관리자만 삭제 (소프트 = status='deleted')
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { tradeId } = await params;
  const id = Number(tradeId);

  const { data: post } = await supabase
    .from("trade_posts")
    .select("firebase_uid")
    .eq("id", id)
    .single();

  if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });
  const isOwner = post.firebase_uid === user.uid;
  const isAdmin = await checkIsAdmin(user.uid, user.email);
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "본인 글만 삭제할 수 있습니다" }, { status: 403 });
  }

  const { error } = await supabase
    .from("trade_posts")
    .update({ status: "deleted" })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await invalidateCache("trade:*").catch(() => {});
  return NextResponse.json({ success: true });
}

// PATCH /api/trade/[tradeId] — 본인만 수정
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tradeId: string }> }
) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const { tradeId } = await params;
  const id = Number(tradeId);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("trade_posts")
    .select("firebase_uid, category")
    .eq("id", id)
    .single();

  if (!existing) return NextResponse.json({ error: "글을 찾을 수 없습니다" }, { status: 404 });
  const isOwnerEdit = existing.firebase_uid === user.uid;
  const isAdminEdit = await checkIsAdmin(user.uid, user.email);
  if (!isOwnerEdit && !isAdminEdit) {
    return NextResponse.json({ error: "본인 글만 수정할 수 있습니다" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const {
    title,
    body: content,
    region_sido,
    region_sigungu,
    region_detail,
    contact_phone,
    image_urls,
    product_name,
    condition_text,
    price_manwon,
    center_name,
    equipment_info,
    center_info,
  } = body;

  const category = existing.category as "equipment" | "center";

  // 공통 필수 검증
  if (!title?.trim()) return NextResponse.json({ error: "제목을 입력해주세요" }, { status: 400 });
  if (!region_sido?.trim() || !region_sigungu?.trim()) {
    return NextResponse.json({ error: "지역을 선택해주세요" }, { status: 400 });
  }
  if (!contact_phone?.trim()) return NextResponse.json({ error: "연락처를 입력해주세요" }, { status: 400 });
  const imgs: string[] = Array.isArray(image_urls) ? image_urls.filter((u: unknown) => typeof u === "string") : [];
  if (category === "equipment" && imgs.length < 1) return NextResponse.json({ error: "사기 방지를 위해 실제 판매하시는 물품 사진을 1장 이상 첨부해 주세요." }, { status: 400 });
  if (imgs.length > 10) return NextResponse.json({ error: "사진은 최대 10장까지" }, { status: 400 });

  if (category === "equipment") {
    if (!product_name?.trim() || !condition_text?.trim() || price_manwon === undefined || price_manwon === null || !center_name?.trim()) {
      return NextResponse.json({ error: "중고거래 필수 항목을 모두 입력해주세요" }, { status: 400 });
    }
    if (!region_detail?.trim()) {
      return NextResponse.json({ error: "중고거래는 상세 주소를 입력해주세요" }, { status: 400 });
    }
  } else {
    if (!center_info || typeof center_info !== "object") {
      return NextResponse.json({ error: "센터 매매 상세 정보를 입력해주세요" }, { status: 400 });
    }
    const ci = center_info as Record<string, unknown>;
    if (!ci.store_type || !ci.area_pyeong) {
      return NextResponse.json({ error: "센터 매매 필수 항목을 모두 입력해주세요" }, { status: 400 });
    }
  }

  const updateRow: TradePostUpdate = {
    title: sanitize(validateLength(title.trim(), 200)),
    body: content ? sanitize(validateLength(String(content).trim(), 10000)) : null,
    region_sido: sanitize(validateLength(region_sido.trim(), 50)),
    region_sigungu: sanitize(validateLength(region_sigungu.trim(), 50)),
    region_detail: region_detail?.trim() ? sanitize(validateLength(String(region_detail).trim(), 200)) : null,
    contact_phone: sanitize(validateLength(contact_phone.trim(), 30)),
    image_urls: imgs,
  };

  if (category === "equipment") {
    updateRow.product_name = sanitize(validateLength(String(product_name).trim(), 100));
    updateRow.condition_text = sanitize(validateLength(String(condition_text).trim(), 100));
    updateRow.price_manwon = Math.max(0, Math.floor(Number(price_manwon)));
    updateRow.center_name = sanitize(validateLength(String(center_name).trim(), 100));
    updateRow.equipment_info = equipment_info ?? null;
  } else {
    updateRow.center_info = center_info;
  }

  const { error } = await supabase
    .from("trade_posts")
    .update(updateRow)
    .eq("id", id);

  if (error) {
    console.error("PATCH /api/trade insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await invalidateCache("trade:*").catch(() => {});
  return NextResponse.json({ success: true, id });
}
