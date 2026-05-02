import { supabase } from "@/app/lib/supabase";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { sendKeywordAlerts } from "@/app/lib/notifications";
import { invalidateCache } from "@/app/lib/cache";
import { fetchJobsPage } from "@/app/lib/jobs-query";
import { getBlockedUidsForRequest } from "@/app/lib/block-filter";

export const dynamic = "force-dynamic";

// GET /api/jobs — 구인글 목록 (공유 모듈 fetchJobsPage)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const blocked = await getBlockedUidsForRequest(request);
    const blockedSet = new Set(blocked);
    const baseLimit = Number(url.searchParams.get("limit")) || 20;
    // 차단 글 후처리 시 부족분 보충용으로 약간 더 가져옴
    const fetchLimit = baseLimit + Math.min(blocked.length, 20);

    const result = await fetchJobsPage({
      regionCode: url.searchParams.get("region_code") || "",
      sort: url.searchParams.get("sort") || "latest",
      page: Number(url.searchParams.get("page")) || 1,
      limit: fetchLimit,
      q: url.searchParams.get("q")?.trim() || "",
      searchType: url.searchParams.get("searchType") || "all",
      employmentType: url.searchParams.get("employment_type") || "",
      hideClosed: url.searchParams.get("hide_closed") === "true",
      sportFilter: url.searchParams.get("sport") || "",
    });

    if (blocked.length > 0) {
      result.posts = result.posts
        .filter((p) => !p.firebase_uid || !blockedSet.has(p.firebase_uid))
        .slice(0, baseLimit);
    } else {
      result.posts = result.posts.slice(0, baseLimit);
    }

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

  const { data, error } = await supabase
    .from("job_posts")
    .insert({
      title: sanitize(validateLength(title.trim(), 200)),
      description: sanitize(validateLength(description.trim(), 10000)),
      center_name: sanitize(validateLength(center_name.trim(), 100)),
      address: sanitize(validateLength((address || "").trim(), 200)),
      author_role: sanitize(validateLength((author_role || "").trim(), 50)),
      author_name: sanitize(validateLength((author_name || "").trim(), 50)),
      contact_type: contact_type || "연락처",
      contact: sanitize(validateLength(contact.trim(), 100)),
      sport: sanitize(validateLength(sport.trim(), 50)),
      region_name: sanitize(validateLength((region_name || "").trim(), 50)),
      region_code: (region_code || "").trim().toLowerCase(),
      employment_type: sanitize(validateLength((employment_type || "").trim(), 50)),
      salary: sanitize(validateLength((salary || "").trim(), 100)),
      headcount: sanitize(validateLength((headcount || "").trim(), 50)),
      benefits: sanitize(validateLength((benefits || "").trim(), 500)),
      preferences: sanitize(validateLength((preferences || "").trim(), 500)),
      deadline: (deadline || "").trim(),
      ip_address: ipAddr,
      firebase_uid: user.uid,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await invalidateCache("jobs:*").catch(() => {});

  sendKeywordAlerts(
    title.trim(),
    (description || "").trim(),
    "job",
    data.id,
    user.uid,
  ).catch(() => {});

  return NextResponse.json({ success: true, id: data.id });
}
