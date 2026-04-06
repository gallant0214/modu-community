import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    // 디바이스 토큰 테이블
    await sql`
      CREATE TABLE IF NOT EXISTS device_tokens (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(128) NOT NULL,
        token TEXT NOT NULL,
        platform VARCHAR(10) DEFAULT 'ios',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(firebase_uid, token)
      )
    `;

    // 알림 설정 테이블
    await sql`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(128) NOT NULL UNIQUE,
        notify_comment BOOLEAN DEFAULT true,
        notify_reply BOOLEAN DEFAULT true,
        notify_job BOOLEAN DEFAULT true,
        notify_notice BOOLEAN DEFAULT true,
        notify_promo BOOLEAN DEFAULT false,
        notify_keyword BOOLEAN DEFAULT true,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // 알림 히스토리 테이블
    await sql`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(128) NOT NULL,
        type VARCHAR(20) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        data JSONB,
        read BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    return NextResponse.json({ success: true, message: "Notification tables created" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
