import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

let schemaEnsured = false;
async function ensureShareColumn() {
  if (schemaEnsured) return;
  try {
    await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS share_count INT DEFAULT 0`;
    schemaEnsured = true;
  } catch {}
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  await ensureShareColumn();
  const { jobId } = await params;
  await sql`UPDATE job_posts SET share_count = COALESCE(share_count, 0) + 1 WHERE id = ${Number(jobId)}`;
  return NextResponse.json({ success: true });
}
