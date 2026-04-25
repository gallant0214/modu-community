import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { sendKeywordAlerts } from "@/app/lib/notifications";
import { invalidateCache } from "@/app/lib/cache";
import { fetchJobsPage } from "@/app/lib/jobs-query";

export const dynamic = "force-dynamic";

// GET /api/jobs — 구인글 목록 (공유 모듈 fetchJobsPage 에서 Neon SQL + Upstash 캐시 처리)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await fetchJobsPage({
      regionCode: url.searchParams.get("region_code") || "",
      sort: url.searchParams.get("sort") || "latest",
      page: Number(url.searchParams.get("page")) || 1,
      limit: Number(url.searchParams.get("limit")) || 20,
      q: url.searchParams.get("q")?.trim() || "",
      searchType: url.searchParams.get("searchType") || "all",
      employmentType: url.searchParams.get("employment_type") || "",
      hideClosed: url.searchParams.get("hide_closed") === "true",
      sportFilter: url.searchParams.get("sport") || "",
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/jobs error:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// POST /api/jobs — 구인 글 등록 (인증 필수)
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rateLimitResponse = checkRateLimit(ip, "write");
  if (rateLimitResponse) return rateLimitResponse;

  const body = await request.json();
  const {
    title, description, center_name, address,
    author_role, author_name, contact_type, contact,
    sport, region_name, region_code,
    employment_type, salary, headcount,
    benefits, preferences, deadline,
  } = body;

  if (!title?.trim() || !description?.trim() || !center_name?.trim() || !contact?.trim() || !sport?.trim()) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요" }, { status: 400 });
  }

  const h = await headers();
  const ipAddr = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const rows = await sql`
    INSERT INTO job_posts (
      title, description, center_name, address,
      author_role, author_name, contact_type, contact,
      sport, region_name, region_code,
      employment_type, salary, headcount,
      benefits, preferences, deadline, ip_address, firebase_uid
    ) VALUES (
      ${sanitize(validateLength(title.trim(), 200))}, ${sanitize(validateLength(description.trim(), 10000))}, ${sanitize(validateLength(center_name.trim(), 100))}, ${sanitize(validateLength((address || "").trim(), 200))},
      ${sanitize(validateLength((author_role || "").trim(), 50))}, ${sanitize(validateLength((author_name || "").trim(), 50))}, ${contact_type || "연락처"}, ${sanitize(validateLength(contact.trim(), 100))},
      ${sanitize(validateLength(sport.trim(), 50))}, ${sanitize(validateLength((region_name || "").trim(), 50))}, ${(region_code || "").trim().toLowerCase()},
      ${sanitize(validateLength((employment_type || "").trim(), 50))}, ${sanitize(validateLength((salary || "").trim(), 100))}, ${sanitize(validateLength((headcount || "").trim(), 50))},
      ${sanitize(validateLength((benefits || "").trim(), 500))}, ${sanitize(validateLength((preferences || "").trim(), 500))}, ${(deadline || "").trim()}, ${ipAddr}, ${user.uid}
    ) RETURNING id
  `;

  // 구인글 목록 캐시 즉시 무효화 (다음 방문자가 바로 새 글 확인)
  await invalidateCache("jobs:*").catch(() => {});

  // 새 구인글 알림 (비동기)
  sendKeywordAlerts(
    title.trim(),
    (description || "").trim(),
    "job",
    rows[0].id,
    user.uid
  ).catch(() => {});

  return NextResponse.json({ success: true, id: rows[0].id });
}
