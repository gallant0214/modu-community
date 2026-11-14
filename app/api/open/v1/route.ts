import { NextResponse } from "next/server";
import { requireApiKey } from "@/app/lib/crm-api-key-auth";
import { API_KEY_SCOPES, OPEN_API_ENDPOINTS } from "@/app/lib/crm-api-keys";

export const dynamic = "force-dynamic";

/**
 * GET /api/open/v1 — 연결 확인. 키가 맞으면 센터 이름·키 이름·볼 수 있는 데이터·주소 목록을 돌려준다.
 * 외부 연동 API 는 전부 조회 전용(GET)이다 — 데이터를 바꾸는 주소는 만들지 않는다(사용자 결정 2026-11-14).
 */
export async function GET(request: Request) {
  const key = await requireApiKey(request, null);
  if (key instanceof NextResponse) return key;
  return NextResponse.json(
    {
      ok: true,
      center: key.centerName,
      key_name: key.keyName,
      scopes: API_KEY_SCOPES.filter((s) => key.scopes.includes(s.key)).map((s) => ({ key: s.key, label: s.label })),
      endpoints: OPEN_API_ENDPOINTS.filter((e) => !e.scope || key.scopes.includes(e.scope)).map((e) => ({
        path: e.path,
        label: e.label,
        desc: e.desc,
      })),
      formats: "JSON 기본 · ?format=csv 면 엑셀·구글 시트용 CSV",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
