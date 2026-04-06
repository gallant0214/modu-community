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
        notify_like BOOLEAN DEFAULT true,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS notify_like BOOLEAN DEFAULT true`;

    // 알림 히스토리 테이블 (확장)
    await sql`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id SERIAL PRIMARY KEY,
        firebase_uid VARCHAR(128) NOT NULL,
        type VARCHAR(30) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        data JSONB,
        read BOOLEAN DEFAULT false,
        like_count INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    await sql`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0`;

    // 관리자 브로드캐스트 테이블
    await sql`
      CREATE TABLE IF NOT EXISTS admin_broadcasts (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        image_url TEXT,
        link_url TEXT,
        broadcast_type VARCHAR(20) DEFAULT 'notice',
        sent_count INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    return NextResponse.json({ success: true, message: "All notification tables created/updated" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
