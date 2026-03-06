import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/jobs/[jobId] — 구인글 상세
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const rows = await sql`SELECT * FROM job_posts WHERE id = ${Number(jobId)}`;

  if (rows.length === 0) {
    return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

// PUT /api/jobs/[jobId] — 구인글 수정
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const body = await request.json();
  const {
    title, description, center_name, address,
    contact, sport, employment_type, salary,
    headcount, benefits, preferences, deadline,
  } = body;

  await sql`
    UPDATE job_posts SET
      title = ${title.trim()},
      description = ${description.trim()},
      center_name = ${center_name.trim()},
      address = ${(address || "").trim()},
      contact = ${contact.trim()},
      sport = ${sport.trim()},
      employment_type = ${(employment_type || "").trim()},
      salary = ${(salary || "").trim()},
      headcount = ${(headcount || "").trim()},
      benefits = ${(benefits || "").trim()},
      preferences = ${(preferences || "").trim()},
      deadline = ${(deadline || "").trim()},
      updated_at = NOW()
    WHERE id = ${Number(jobId)}
  `;

  return NextResponse.json({ success: true });
}

// DELETE /api/jobs/[jobId] — 구인글 삭제
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  await sql`DELETE FROM job_posts WHERE id = ${Number(jobId)}`;
  return NextResponse.json({ success: true });
}
