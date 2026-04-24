// ⚠️ 임시 디버그 엔드포인트 — W24 API 가 실제로 phnNo/mblePhnNo/emlAddr 같은
// 연락처 필드를 주는지 확인하기 위한 1회용. 확인 끝나면 이 파일 삭제.
//
// 호출: GET /api/admin/w24-debug?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.WORK24_API_KEY || "";
const BASE_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!API_KEY) return NextResponse.json({ error: "WORK24_API_KEY not set" }, { status: 500 });

  // 직종 622000(스포츠) 1건만 가져옴
  const apiUrl = `${BASE_URL}?authKey=${API_KEY}&callTp=L&returnType=XML&startPage=1&display=3&occupation=622000`;
  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
  const xmlText = await res.text();

  // 첫 wanted 블록
  const firstMatch = xmlText.match(/<wanted>([\s\S]*?)<\/wanted>/);
  const firstWanted = firstMatch ? firstMatch[0] : "(no wanted block)";

  // 전체 응답에 등장하는 모든 태그 이름 (어떤 필드들이 있는지)
  const allTags = Array.from(new Set(xmlText.match(/<([a-zA-Z][a-zA-Z0-9]*)>/g) || []))
    .map(t => t.replace(/[<>]/g, ""))
    .sort();

  // 연락처 관련으로 의심되는 태그만 필터
  const contactTagCandidates = allTags.filter(t =>
    /phn|phone|tel|mob|mble|eml|email|mail|cont/i.test(t)
  );

  return NextResponse.json({
    responseBytes: xmlText.length,
    allTagsCount: allTags.length,
    allTags,
    contactTagCandidates,
    firstWantedBlock: firstWanted,
  });
}
