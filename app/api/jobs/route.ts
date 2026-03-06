import { sql } from "@/app/lib/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/jobs?region_code=GUMI&sort=latest&page=1&q=&searchType=title
export async function GET(request: Request) {
  const url = new URL(request.url);
  const regionCode = url.searchParams.get("region_code") || "";
  const sort = url.searchParams.get("sort") || "latest";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;
  const q = url.searchParams.get("q")?.trim() || "";
  const searchType = url.searchParams.get("searchType") || "title";

  let whereClause = "WHERE 1=1";
  const params: unknown[] = [];
  let paramIdx = 1;

  if (regionCode) {
    whereClause += ` AND region_code = $${paramIdx++}`;
    params.push(regionCode);
  }

  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const like = `%${word}%`;
      switch (searchType) {
        case "sport":
          whereClause += ` AND sport ILIKE $${paramIdx++}`;
          break;
        case "title":
          whereClause += ` AND title ILIKE $${paramIdx++}`;
          break;
        case "author":
          whereClause += ` AND center_name ILIKE $${paramIdx++}`;
          break;
        case "content":
          whereClause += ` AND description ILIKE $${paramIdx++}`;
          break;
        case "title_content":
          whereClause += ` AND (title ILIKE $${paramIdx} OR description ILIKE $${paramIdx++})`;
          break;
        default:
          whereClause += ` AND title ILIKE $${paramIdx++}`;
      }
      params.push(like);
    }
  }

  let orderBy = "ORDER BY created_at DESC";
  if (sort === "popular") orderBy = "ORDER BY views DESC, created_at DESC";
  if (sort === "likes") orderBy = "ORDER BY likes DESC, created_at DESC";

  const countQuery = `SELECT COUNT(*) as total FROM job_posts ${whereClause}`;
  const dataQuery = `SELECT * FROM job_posts ${whereClause} ${orderBy} LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;

  params.push(limit, offset);

  const [countResult, rows] = await Promise.all([
    sql(countQuery, params.slice(0, paramIdx - 3)),
    sql(dataQuery, params),
  ]);

  const total = Number(countResult[0].total);

  return NextResponse.json({
    posts: rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
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
