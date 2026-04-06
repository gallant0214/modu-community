import { sql } from "@/app/lib/db";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ count: 0 });

  try {
    const result = await sql`
      SELECT COUNT(*) as count FROM notification_logs
      WHERE firebase_uid = ${user.uid} AND read = false
    `;
    return NextResponse.json({ count: Number(result[0]?.count || 0) });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
