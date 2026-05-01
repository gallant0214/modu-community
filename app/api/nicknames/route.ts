export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, validateLength } from "@/app/lib/security";

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

// GET /api/nicknames?uid=xxx  — 닉네임 + 변경가능 여부 조회
// GET /api/nicknames?name=xxx — 중복 확인
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid")?.trim();
  const name = req.nextUrl.searchParams.get("name")?.trim();

  if (uid) {
    // active_region_* 컬럼은 마이그레이션 후 추가 — 런타임엔 존재. 타입 우회.
    const { data } = await (supabase as any)
      .from("nicknames")
      .select("name, changed_at, active_region_code, active_region_name")
      .eq("firebase_uid", uid)
      .maybeSingle();
    if (data) {
      const changedAt = data.changed_at ? new Date(data.changed_at).getTime() : 0;
      const canChange =
        changedAt === 0 || Date.now() - changedAt >= THREE_WEEKS_MS;
      const remainingDays = canChange
        ? 0
        : Math.ceil((THREE_WEEKS_MS - (Date.now() - changedAt)) / (24 * 60 * 60 * 1000));
      return NextResponse.json({
        nickname: data.name,
        canChange,
        remainingDays,
        activeRegionCode: data.active_region_code || "",
        activeRegionName: data.active_region_name || "",
      });
    }
    return NextResponse.json({ nickname: null, canChange: true, remainingDays: 0, activeRegionCode: "", activeRegionName: "" });
  }

  if (name) {
    const { data } = await supabase
      .from("nicknames")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    return NextResponse.json({ available: !data });
  }

  return NextResponse.json({ error: "uid or name required" }, { status: 400 });
}

// POST /api/nicknames — 닉네임 등록/변경 (Firebase 인증 필수)
export async function POST(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const rawName = (body.nickname || body.name || "").trim();
  const isFirstSetup = body.firstSetup === true;

  if (!rawName) {
    return NextResponse.json({ success: false, error: "닉네임을 입력해주세요" }, { status: 400 });
  }

  if (rawName.length < 2) {
    return NextResponse.json({ success: false, error: "닉네임은 2글자 이상이어야 합니다" }, { status: 400 });
  }

  if (rawName.length > 8) {
    return NextResponse.json({ success: false, error: "닉네임은 8글자 이하여야 합니다" }, { status: 400 });
  }

  const name = sanitize(validateLength(rawName, 50));

  // 기존 닉네임 확인
  const { data: current } = await supabase
    .from("nicknames")
    .select("name, changed_at")
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  if (!isFirstSetup && current?.changed_at) {
    const changedAt = new Date(current.changed_at).getTime();
    if (Date.now() - changedAt < THREE_WEEKS_MS) {
      const remainingDays = Math.ceil(
        (THREE_WEEKS_MS - (Date.now() - changedAt)) / (24 * 60 * 60 * 1000),
      );
      return NextResponse.json(
        {
          success: false,
          error: `닉네임 변경은 ${remainingDays}일 후에 가능합니다`,
        },
        { status: 429 },
      );
    }
  }

  if (current?.name === name) {
    return NextResponse.json({ success: true, nickname: name });
  }

  // 중복 확인
  const { data: existing } = await supabase
    .from("nicknames")
    .select("firebase_uid")
    .eq("name", name)
    .maybeSingle();
  if (existing && existing.firebase_uid && existing.firebase_uid !== user.uid) {
    return NextResponse.json(
      { success: false, error: "중복된 닉네임입니다. 다른 닉네임을 사용해주세요." },
      { status: 409 },
    );
  }

  // 기존 닉네임 삭제
  await supabase.from("nicknames").delete().eq("firebase_uid", user.uid);
  await supabase.from("nicknames").delete().eq("name", name);

  // 새 닉네임 등록
  const { error } = await supabase.from("nicknames").insert({
    name,
    firebase_uid: user.uid,
    changed_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, nickname: name });
}

// PUT /api/nicknames — 활동 지역(active_region_code/name) 갱신 (Firebase 인증 필수)
export async function PUT(req: NextRequest) {
  const user = await verifyAuth(req);
  if (!user) {
    return NextResponse.json({ success: false, error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const regionCodeRaw = typeof body.activeRegionCode === "string" ? body.activeRegionCode.trim() : "";
  const regionNameRaw = typeof body.activeRegionName === "string" ? body.activeRegionName.trim() : "";
  const regionCode = sanitize(validateLength(regionCodeRaw, 50));
  const regionName = sanitize(validateLength(regionNameRaw, 100));

  // 닉네임 row가 이미 있는 경우 update, 없으면 빈 row 생성
  const { data: existing } = await supabase
    .from("nicknames")
    .select("id")
    .eq("firebase_uid", user.uid)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ success: false, error: "닉네임을 먼저 설정해주세요" }, { status: 400 });
  }

  const { error } = await (supabase as any)
    .from("nicknames")
    .update({
      active_region_code: regionCode || null,
      active_region_name: regionName || null,
    })
    .eq("firebase_uid", user.uid);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    activeRegionCode: regionCode,
    activeRegionName: regionName,
  });
}
