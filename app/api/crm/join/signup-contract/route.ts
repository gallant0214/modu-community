import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";

export const dynamic = "force-dynamic";

interface Section {
  key: string;
  title: string;
  body: string;
  required: boolean;
}

/** body 안의 [제목] 헤더로 섹션 분리 (sections 컬럼이 비었을 때 폴백) */
function parseSectionsFromBody(rawBody: string): Section[] {
  if (!rawBody) return [];
  const lines = rawBody.split("\n");
  const parsed: Section[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];
  let index = 0;
  const push = () => {
    const bodyText = currentBody.join("\n").trim();
    if (currentTitle || bodyText) {
      const isOptional = /광고/.test(currentTitle);
      parsed.push({
        key: `s${index + 1}`,
        title: currentTitle || `섹션 ${index + 1}`,
        body: bodyText,
        required: !isOptional,
      });
      index += 1;
    }
  };
  for (const line of lines) {
    const m = line.match(/^\s*\[(.+?)\]\s*$/);
    if (m) {
      push();
      currentTitle = m[1].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  push();
  return parsed;
}

/**
 * GET /api/crm/join/signup-contract?token=  (공개·무인증)
 * QR 신규 회원 가입용 전자계약서 — 센터가 '신규가입 계약서'로 지정(signup_enabled=true)한
 * 최신 활성 양식 1건을 섹션 단위로 반환. 지정 양식이 없으면 { template: null }.
 * (센터양식만 원칙 — 기본 폴백 양식 없음)
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "가입 링크가 필요합니다" }, { status: 400 });

  const { data: link } = await supabase
    .from("crm_center_join_links")
    .select("center_id")
    .eq("token", token)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "유효하지 않은 가입 링크예요" }, { status: 404 });

  const { data: tpl } = await supabase
    .from("crm_contract_templates")
    .select("id, title, body, sections")
    .eq("center_id", link.center_id)
    .eq("status", "active")
    .eq("signup_enabled", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!tpl) {
    return NextResponse.json({ template: null });
  }

  let sections: Section[] =
    Array.isArray(tpl.sections) && tpl.sections.length > 0
      ? (tpl.sections as Section[])
      : parseSectionsFromBody(tpl.body ?? "");
  if (sections.length === 0) {
    sections = [{ key: "default", title: tpl.title, body: tpl.body ?? "", required: true }];
  }
  const hasContent = sections.some((s) => (s.body ?? "").trim().length > 0);
  if (!hasContent) {
    // 본문이 비면 서명 불가 — 없는 것으로 처리
    return NextResponse.json({ template: null });
  }

  return NextResponse.json({
    template: { id: tpl.id, title: tpl.title, sections },
  });
}
