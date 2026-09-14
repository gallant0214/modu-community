import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/holidays?year=2026  또는  ?years=2026,2027
 * 한국천문연구원 특일정보(getRestDeInfo) 기반 공휴일(법정+대체+임시) 맵.
 * 응답: { holidays: { "YYYY-MM-DD": "이름", ... } }
 *
 * - 근로자의날(노동절)·제헌절은 '관공서 공휴일(빨간날)'이 아니라 제외.
 * - 전국동시지방선거 등 임시공휴일은 API 가 isHoliday=Y 로 주므로 자동 포함.
 * - 연 단위 1회 호출로 그 해 전체가 오며, 인스턴스 메모리에 12시간 캐시.
 */
const BASE =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
// 빨간날(관공서 공휴일) 아님 → 표시 제외
const EXCLUDE = ["노동절", "근로자의 날", "제헌절"];

type Cached = { at: number; map: Record<string, string> };
const cache = new Map<number, Cached>();
const TTL = 12 * 3600 * 1000;

async function fetchYear(year: number): Promise<Record<string, string>> {
  const hit = cache.get(year);
  if (hit && Date.now() - hit.at < TTL) return hit.map;
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return hit?.map ?? {};
  try {
    // key 는 이미 URL 인코딩된 값(Encoding) → 문자열에 그대로 삽입(재인코딩 금지)
    const url = `${BASE}?serviceKey=${key}&solYear=${year}&_type=json&numOfRows=100`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return hit?.map ?? {};
    const j = await res.json();
    const raw = j?.response?.body?.items?.item;
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const map: Record<string, string> = {};
    for (const it of items) {
      if (it?.isHoliday !== "Y") continue;
      const name = String(it?.dateName ?? "");
      if (EXCLUDE.some((e) => name.includes(e))) continue;
      const loc = String(it?.locdate ?? "");
      if (!/^\d{8}$/.test(loc)) continue;
      map[`${loc.slice(0, 4)}-${loc.slice(4, 6)}-${loc.slice(6, 8)}`] = name;
    }
    if (items.length > 0) cache.set(year, { at: Date.now(), map });
    return items.length > 0 ? map : hit?.map ?? {};
  } catch {
    return hit?.map ?? {};
  }
}

export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const nowY = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  const param = url.searchParams.get("years") || url.searchParams.get("year") || String(nowY);
  const years = Array.from(
    new Set(
      param
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100)
    )
  ).slice(0, 5);

  const merged: Record<string, string> = {};
  await Promise.all(
    years.map(async (y) => {
      Object.assign(merged, await fetchYear(y));
    })
  );
  return NextResponse.json({ holidays: merged });
}
