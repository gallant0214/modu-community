import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { cached } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/holidays?years=2026,2027
 * 공공데이터포털 '특일정보' API(getRestDeInfo)로 법정공휴일·임시공휴일·대체공휴일 조회.
 *
 * - 임시공휴일도 정부 지정 즉시 이 API 에 반영되므로 별도 관리가 필요 없다.
 * - 환경변수 DATA_GO_KR_SERVICE_KEY (공공데이터포털 인증키, Decoding 키) 필요.
 *   키가 없으면 빈 목록 + source:"none" 으로 응답한다(화면은 평소대로 동작).
 * - 공휴일은 거의 바뀌지 않으므로 12시간 캐시.
 */
const BASE =
  "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

interface RestItem {
  dateKind?: string;
  dateName?: string;
  isHoliday?: string; // 'Y' | 'N'
  locdate?: number | string; // 20261003
}

/** 한 해 공휴일 조회 — { 'YYYY-MM-DD': '개천절' } */
async function fetchYear(year: number, serviceKey: string): Promise<Record<string, string>> {
  const url =
    `${BASE}?solYear=${year}&numOfRows=100&_type=json&ServiceKey=${encodeURIComponent(serviceKey)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`특일정보 조회 실패 (${res.status})`);
  const text = await res.text();
  // 키 오류 등은 XML 로 떨어진다 → JSON 파싱 실패 시 원문 일부를 에러로
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`특일정보 응답 오류: ${text.slice(0, 160)}`);
  }
  const body = (json as { response?: { body?: { items?: { item?: RestItem | RestItem[] } } } })
    ?.response?.body;
  const raw = body?.items?.item;
  const items: RestItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: Record<string, string> = {};
  for (const it of items) {
    if ((it.isHoliday ?? "Y") !== "Y") continue;
    const d = String(it.locdate ?? "");
    if (!/^\d{8}$/.test(d)) continue;
    const ymd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    // 같은 날 여러 명칭(예: 설날/대체공휴일)이면 먼저 온 것을 유지
    if (!out[ymd]) out[ymd] = (it.dateName ?? "공휴일").trim();
  }
  return out;
}

export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const thisYear = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  const years = Array.from(
    new Set(
      (url.searchParams.get("years") ?? String(thisYear))
        .split(",")
        .map((y) => Number(y.trim()))
        .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100)
    )
  ).slice(0, 5);
  if (years.length === 0) years.push(thisYear);

  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY || "";
  if (!serviceKey) {
    return NextResponse.json({ holidays: {}, source: "none" });
  }

  try {
    const holidays: Record<string, string> = {};
    for (const y of years) {
      const perYear = await cached(`crm:holidays:${y}`, 60 * 60 * 12, () =>
        fetchYear(y, serviceKey)
      );
      Object.assign(holidays, perYear);
    }
    return NextResponse.json({ holidays, source: "api" });
  } catch (e) {
    // 공휴일은 보조 정보 — 실패해도 스케줄 화면은 그대로 뜨게 한다
    return NextResponse.json({
      holidays: {},
      source: "error",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
