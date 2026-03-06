import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

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

// POST /api/jobs — 구인 글 등록
export async function POST(request: Request) {
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
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";

  const rows = await sql`
    INSERT INTO job_posts (
      title, description, center_name, address,
      author_role, author_name, contact_type, contact,
      sport, region_name, region_code,
      employment_type, salary, headcount,
      benefits, preferences, deadline, ip_address
    ) VALUES (
      ${title.trim()}, ${description.trim()}, ${center_name.trim()}, ${(address || "").trim()},
      ${(author_role || "").trim()}, ${(author_name || "").trim()}, ${contact_type || "연락처"}, ${contact.trim()},
      ${sport.trim()}, ${(region_name || "").trim()}, ${(region_code || "").trim()},
      ${(employment_type || "").trim()}, ${(salary || "").trim()}, ${(headcount || "").trim()},
      ${(benefits || "").trim()}, ${(preferences || "").trim()}, ${(deadline || "").trim()}, ${ip}
    ) RETURNING id
  `;

  return NextResponse.json({ success: true, id: rows[0].id });
}
