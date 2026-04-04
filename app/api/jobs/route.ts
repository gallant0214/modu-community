import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { sanitize, checkRateLimit, getClientIp, validateLength } from "@/app/lib/security";

export const dynamic = "force-dynamic";

async function queryWithSearch(
  regionCode: string,
  searchPattern: string,
  searchType: string,
  limit: number,
  offset: number,
  orderCol: string,
) {
  if (searchType === "title_content") {
    if (regionCode) {
      const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE region_code = ${regionCode} AND (title ILIKE ${searchPattern} OR description ILIKE ${searchPattern})`;
      const rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND (title ILIKE ${searchPattern} OR description ILIKE ${searchPattern}) ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND (title ILIKE ${searchPattern} OR description ILIKE ${searchPattern}) ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND (title ILIKE ${searchPattern} OR description ILIKE ${searchPattern}) ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return [countResult, rows];
    } else {
      const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE title ILIKE ${searchPattern} OR description ILIKE ${searchPattern}`;
      const rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE title ILIKE ${searchPattern} OR description ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE title ILIKE ${searchPattern} OR description ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE title ILIKE ${searchPattern} OR description ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return [countResult, rows];
    }
  }

  if (searchType === "sport") {
    if (regionCode) {
      const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE region_code = ${regionCode} AND sport ILIKE ${searchPattern}`;
      const rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND sport ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND sport ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND sport ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return [countResult, rows];
    } else {
      const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE sport ILIKE ${searchPattern}`;
      const rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE sport ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE sport ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE sport ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return [countResult, rows];
    }
  }

  if (searchType === "author") {
    if (regionCode) {
      const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE region_code = ${regionCode} AND center_name ILIKE ${searchPattern}`;
      const rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND center_name ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND center_name ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND center_name ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return [countResult, rows];
    } else {
      const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE center_name ILIKE ${searchPattern}`;
      const rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE center_name ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE center_name ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE center_name ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return [countResult, rows];
    }
  }

  if (searchType === "content") {
    if (regionCode) {
      const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE region_code = ${regionCode} AND description ILIKE ${searchPattern}`;
      const rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND description ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND description ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND description ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return [countResult, rows];
    } else {
      const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE description ILIKE ${searchPattern}`;
      const rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE description ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE description ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE description ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
      return [countResult, rows];
    }
  }

  // Default: title search
  if (regionCode) {
    const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE region_code = ${regionCode} AND title ILIKE ${searchPattern}`;
    const rows = orderCol === "views"
      ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND title ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
      : orderCol === "likes"
      ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND title ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
      : await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} AND title ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return [countResult, rows];
  } else {
    const countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE title ILIKE ${searchPattern}`;
    const rows = orderCol === "views"
      ? await sql`SELECT * FROM job_posts WHERE title ILIKE ${searchPattern} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
      : orderCol === "likes"
      ? await sql`SELECT * FROM job_posts WHERE title ILIKE ${searchPattern} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
      : await sql`SELECT * FROM job_posts WHERE title ILIKE ${searchPattern} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    return [countResult, rows];
  }
}

// GET /api/jobs?region_code=GUMI&sort=latest&page=1&q=&searchType=title
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const regionCode = url.searchParams.get("region_code") || "";
    const sort = url.searchParams.get("sort") || "latest";
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    const q = url.searchParams.get("q")?.trim() || "";
    const searchType = url.searchParams.get("searchType") || "title";

    const searchPattern = q ? `%${q}%` : "";
    const orderCol = sort === "popular" ? "views" : sort === "likes" ? "likes" : "created_at";

    let countResult;
    let rows;

    if (searchPattern) {
      [countResult, rows] = await queryWithSearch(regionCode, searchPattern, searchType, limit, offset, orderCol);
    } else if (regionCode) {
      countResult = await sql`SELECT COUNT(*) as total FROM job_posts WHERE region_code = ${regionCode}`;
      rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts WHERE region_code = ${regionCode} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    } else {
      countResult = await sql`SELECT COUNT(*) as total FROM job_posts`;
      rows = orderCol === "views"
        ? await sql`SELECT * FROM job_posts ORDER BY views DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : orderCol === "likes"
        ? await sql`SELECT * FROM job_posts ORDER BY likes DESC, created_at DESC LIMIT ${limit} OFFSET ${offset}`
        : await sql`SELECT * FROM job_posts ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    }

    const total = Number(countResult[0].total);

    return NextResponse.json({
      posts: rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error("GET /api/jobs error:", e);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// POST /api/jobs — 구인 글 등록 (인증 필수)
export async function POST(request: Request) {
  // 인증 확인
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  // Rate limiting
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

  // firebase_uid 컬럼이 없으면 추가
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
      ${sanitize(validateLength(sport.trim(), 50))}, ${sanitize(validateLength((region_name || "").trim(), 50))}, ${(region_code || "").trim()},
      ${sanitize(validateLength((employment_type || "").trim(), 50))}, ${sanitize(validateLength((salary || "").trim(), 100))}, ${sanitize(validateLength((headcount || "").trim(), 50))},
      ${sanitize(validateLength((benefits || "").trim(), 500))}, ${sanitize(validateLength((preferences || "").trim(), 500))}, ${(deadline || "").trim()}, ${ipAddr}, ${user.uid}
    ) RETURNING id
  `;

  return NextResponse.json({ success: true, id: rows[0].id });
}
