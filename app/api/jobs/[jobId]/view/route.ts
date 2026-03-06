import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  await sql`UPDATE job_posts SET views = views + 1 WHERE id = ${Number(jobId)}`;
  return NextResponse.json({ success: true });
}
