import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

// 센터설정 운영시간(crm_centers.operating_hours) JSON → 표시 문자열.
// 규칙: days 0=월 … 6=일, note 항목은 days=[] 로 자유 문구.
function formatOperatingHours(oh: unknown): string | null {
  // operating_hours 는 text 컬럼(JSON 문자열)이라 파싱 필요.
  let arr: unknown = oh;
  if (typeof oh === "string") {
    if (!oh.trim()) return null;
    try { arr = JSON.parse(oh); } catch { return null; }
  }
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
  const lines: string[] = [];
  for (const g of arr as Array<{ days?: number[]; open?: string; close?: string; note?: string }>) {
    const days = Array.isArray(g?.days)
      ? g.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    const time =
      g?.open && g?.close
        ? g.open === g.close
          ? "24시간 운영"
          : `${g.open}~${g.close}`
        : "";
    let dayStr = "";
    if (days.length === 7) dayStr = "매일";
    else if (days.length) dayStr = [...days].sort((a, b) => a - b).map((d) => DAYS[d]).join("·");
    const head = [dayStr, time].filter(Boolean).join(" ");
    const note = typeof g?.note === "string" ? g.note.trim() : "";
    const line = [head, note].filter(Boolean).join(head && note ? " · " : "");
    if (line) lines.push(line);
  }
  return lines.length ? lines.join("\n") : null;
}

/**
 * GET /api/crm/member-app/center?centerId=
 * 내가 소속된 센터의 공개 정보 (센터CRM → 센터설정 → 센터정보 에서 입력한 값).
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const [{ data: c }, { data: s }] = await Promise.all([
    supabase
      .from("crm_centers")
      .select("id, name, phone, address, region_sido, region_sigungu, naver_url, google_url, instagram_id, youtube_url, operating_hours")
      .eq("id", ctx.centerId)
      .maybeSingle(),
    supabase
      .from("crm_center_settings")
      .select("working_hours_start, working_hours_end")
      .eq("center_id", ctx.centerId)
      .maybeSingle(),
  ]);
  if (!c) return NextResponse.json({ error: "센터를 찾을 수 없습니다" }, { status: 404 });

  const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

  // 운영시간: 센터설정에 입력한 operating_hours(요일별) 우선, 없으면 legacy 기본시간.
  const workingHours =
    formatOperatingHours((c as { operating_hours?: unknown }).operating_hours) ??
    (s?.working_hours_start && s?.working_hours_end
      ? `${hhmm(s.working_hours_start)} - ${hhmm(s.working_hours_end)}`
      : null);

  return NextResponse.json({
    center: {
      id: c.id,
      name: c.name,
      phone: c.phone,
      address: c.address,
      region: [c.region_sido, c.region_sigungu].filter(Boolean).join(" ") || null,
      workingHours,
      // 구버전 앱(설치된 빌드) 호환용 — 신버전 앱은 workingHours 사용
      workingHoursStart: hhmm(s?.working_hours_start),
      workingHoursEnd: hhmm(s?.working_hours_end),
      naverUrl: c.naver_url,
      googleUrl: c.google_url,
      instagramId: c.instagram_id,
      youtubeUrl: c.youtube_url,
    },
  });
}
