import { sql } from "@/app/lib/db";
import { verifyAuth } from "@/app/lib/firebase-admin";
import { NextResponse } from "next/server";

// FCM 토큰 등록/업데이트
export async function POST(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  try {
    const { token, platform } = await request.json();
    if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

    await sql`
      INSERT INTO device_tokens (firebase_uid, token, platform, updated_at)
      VALUES (${user.uid}, ${token}, ${platform || "ios"}, NOW())
      ON CONFLICT (firebase_uid, token)
      DO UPDATE SET updated_at = NOW(), platform = ${platform || "ios"}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// FCM 토큰 삭제 (로그아웃 시)
export async function DELETE(request: Request) {
  const user = await verifyAuth(request);
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  try {
    const { token } = await request.json();
    if (token) {
      await sql`DELETE FROM device_tokens WHERE firebase_uid = ${user.uid} AND token = ${token}`;
    } else {
      await sql`DELETE FROM device_tokens WHERE firebase_uid = ${user.uid}`;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
