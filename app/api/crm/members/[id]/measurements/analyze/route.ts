import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/crm/members/[id]/measurements/analyze
 * 인바디 결과지 사진(base64)을 Claude 비전으로 분석해 측정 항목을 추출한다.
 * 사진은 저장하지 않는다(추출 후 폐기). 추출값은 폼 프리필용으로만 반환.
 *
 * body: { image_base64: string, media_type?: string }
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "members.records"))) {
    return NextResponse.json({ error: "운동기록·체성분 수정 권한이 없습니다" }, { status: 403 });
  }
  await params; // memberId 는 사용 안 함(추출만)

  let body: { image_base64?: string; media_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const raw = body.image_base64 ?? "";
  // data URL 접두사 제거
  const b64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (!b64 || b64.length < 100) {
    return NextResponse.json({ error: "이미지가 없습니다" }, { status: 400 });
  }
  const mediaType = /^(image\/(jpeg|png|webp|gif))$/.test(body.media_type ?? "") ? (body.media_type as string) : "image/jpeg";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI 분석 키(ANTHROPIC_API_KEY)가 설정되지 않았습니다. 관리자에게 문의하세요." },
      { status: 503 }
    );
  }
  const model = process.env.INBODY_VISION_MODEL || "claude-sonnet-5";

  const prompt = `이 이미지는 인바디(InBody) 체성분 분석 결과지입니다. 아래 항목을 정확히 읽어 JSON 하나만 출력하세요. 설명·코드펜스 없이 순수 JSON 만.
숫자는 단위 없이 숫자로, 못 읽으면 null.
{
  "measured_at": "검사일시의 날짜(YYYY-MM-DD)",
  "height_cm": 신장(cm),
  "weight_kg": 체중(kg),
  "muscle_kg": 골격근량 Skeletal Muscle Mass(kg),
  "body_fat_kg": 체지방량 Body Fat Mass(kg),
  "body_fat_pct": 체지방률 Percent Body Fat(%),
  "bmi": BMI,
  "visceral_fat": 내장지방레벨 Visceral Fat Level(정수),
  "basal_metabolism": 기초대사량(kcal)
}`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return NextResponse.json({ error: "AI 분석 실패", detail: detail.slice(0, 300) }, { status: 502 });
    }
    const data = (await resp.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).map((c) => c.text ?? "").join("").trim();
    // JSON 부분만 추출
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json({ error: "분석 결과를 해석할 수 없습니다" }, { status: 502 });
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return NextResponse.json({ error: "분석 결과 형식 오류" }, { status: 502 });
    }
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === "") return null;
      const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const ymd = (() => {
      const s = String(parsed.measured_at ?? "").replace(/[.\s]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const mm = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (!mm) return null;
      return `${mm[1]}-${mm[2].padStart(2, "0")}-${mm[3].padStart(2, "0")}`;
    })();

    return NextResponse.json({
      ok: true,
      extracted: {
        measured_at: ymd,
        height_cm: num(parsed.height_cm),
        weight_kg: num(parsed.weight_kg),
        muscle_kg: num(parsed.muscle_kg),
        body_fat_kg: num(parsed.body_fat_kg),
        body_fat_pct: num(parsed.body_fat_pct),
        bmi: num(parsed.bmi),
        visceral_fat: num(parsed.visceral_fat),
        basal_metabolism: num(parsed.basal_metabolism),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "네트워크 오류" }, { status: 500 });
  }
}
