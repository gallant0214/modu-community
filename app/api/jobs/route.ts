import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";
import { sendKeywordAlerts } from "@/app/lib/notifications";

export const dynamic = "force-dynamic";

/* ── helpers ── */

type SortCol = "created_at" | "views" | "likes";

function getSortCol(sort: string): SortCol {
  if (sort === "popular") return "views";
  if (sort === "likes") return "likes";
  return "created_at";
}

/**
 * 통합 검색(all): title OR sport OR center_name OR description
 * 기존 타입별 검색도 하위 호환 유지
 */
async function queryJobs(opts: {
  regionCode: string;
  searchPattern: string;
  searchType: string;
  employmentType: string;
  sportFilter: string;
  hideClosed: boolean;
  limit: number;
  offset: number;
  orderCol: SortCol;
}) {
  const { regionCode, searchPattern, searchType, employmentType, sportFilter, hideClosed, limit, offset, orderCol } = opts;

  // neon()은 tagged template literal만 지원하므로
  // 모든 조건 조합을 WHERE 절 하나로 처리.
  // 조건이 비어있으면 TRUE로 처리하여 무시
  const rCode = regionCode || "";
  const sPat = searchPattern || "";
  const eType = employmentType || "";
  const sFilter = sportFilter || "";

  // 통합 검색 조건 빌드
  // searchType === "all" → title OR sport OR center_name OR description
  const isAll = searchType === "all";
  const isTitleContent = searchType === "title_content";
  const isSport = searchType === "sport";
  const isAuthor = searchType === "author";
  const isContent = searchType === "content";
  const isTitle = !isAll && !isTitleContent && !isSport && !isAuthor && !isContent;

  const countResult = await sql`
    SELECT COUNT(*) as total FROM job_posts
    WHERE
      (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}))
      AND (${eType} = '' OR employment_type = ${eType})
      AND (${sFilter} = '' OR sport = ${sFilter})
      AND (${!hideClosed} OR is_closed = false OR is_closed IS NULL)
      AND (
        ${sPat} = ''
        OR (${isAll} AND (title ILIKE ${sPat} OR sport ILIKE ${sPat} OR center_name ILIKE ${sPat} OR description ILIKE ${sPat}))
        OR (${isTitleContent} AND (title ILIKE ${sPat} OR description ILIKE ${sPat}))
        OR (${isSport} AND sport ILIKE ${sPat})
        OR (${isAuthor} AND center_name ILIKE ${sPat})
        OR (${isContent} AND description ILIKE ${sPat})
        OR (${isTitle} AND title ILIKE ${sPat})
      )
  `;

  let rows;
  if (orderCol === "views") {
    rows = await sql`
      SELECT * FROM job_posts
      WHERE
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}))
        AND (${eType} = '' OR employment_type = ${eType})
        AND (${sFilter} = '' OR sport = ${sFilter})
        AND (${!hideClosed} OR is_closed = false OR is_closed IS NULL)
        AND (
          ${sPat} = ''
          OR (${isAll} AND (title ILIKE ${sPat} OR sport ILIKE ${sPat} OR center_name ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isTitleContent} AND (title ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isSport} AND sport ILIKE ${sPat})
          OR (${isAuthor} AND center_name ILIKE ${sPat})
          OR (${isContent} AND description ILIKE ${sPat})
          OR (${isTitle} AND title ILIKE ${sPat})
        )
      ORDER BY views DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (orderCol === "likes") {
    rows = await sql`
      SELECT * FROM job_posts
      WHERE
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}))
        AND (${eType} = '' OR employment_type = ${eType})
        AND (${sFilter} = '' OR sport = ${sFilter})
        AND (${!hideClosed} OR is_closed = false OR is_closed IS NULL)
        AND (
          ${sPat} = ''
          OR (${isAll} AND (title ILIKE ${sPat} OR sport ILIKE ${sPat} OR center_name ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isTitleContent} AND (title ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isSport} AND sport ILIKE ${sPat})
          OR (${isAuthor} AND center_name ILIKE ${sPat})
          OR (${isContent} AND description ILIKE ${sPat})
          OR (${isTitle} AND title ILIKE ${sPat})
        )
      ORDER BY likes DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    rows = await sql`
      SELECT * FROM job_posts
      WHERE
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}))
        AND (${eType} = '' OR employment_type = ${eType})
        AND (${sFilter} = '' OR sport = ${sFilter})
        AND (${!hideClosed} OR is_closed = false OR is_closed IS NULL)
        AND (
          ${sPat} = ''
          OR (${isAll} AND (title ILIKE ${sPat} OR sport ILIKE ${sPat} OR center_name ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isTitleContent} AND (title ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isSport} AND sport ILIKE ${sPat})
          OR (${isAuthor} AND center_name ILIKE ${sPat})
          OR (${isContent} AND description ILIKE ${sPat})
          OR (${isTitle} AND title ILIKE ${sPat})
        )
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return { countResult, rows };
}

// GET /api/jobs
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const regionCode = url.searchParams.get("region_code") || "";
    const sort = url.searchParams.get("sort") || "latest";
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const q = url.searchParams.get("q")?.trim() || "";
    const searchType = url.searchParams.get("searchType") || "all";
    const employmentType = url.searchParams.get("employment_type") || "";
    const hideClosed = url.searchParams.get("hide_closed") === "true";
    const sportFilter = url.searchParams.get("sport") || "";

    const searchPattern = q ? `%${q}%` : "";
    const orderCol = getSortCol(sort);

    const { countResult, rows } = await queryJobs({
      regionCode, searchPattern, searchType,
      employmentType, sportFilter, hideClosed,
      limit, offset, orderCol,
    });

    const total = Number(countResult[0].total);

    return NextResponse.json({
      posts: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
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

  await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;

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
