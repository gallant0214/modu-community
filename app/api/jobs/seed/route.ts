import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  // job_posts 테이블 생성
  await sql`
    CREATE TABLE IF NOT EXISTS job_posts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      center_name VARCHAR(100) NOT NULL,
      address VARCHAR(255) DEFAULT '',
      author_role VARCHAR(20) DEFAULT '',
      author_name VARCHAR(100) DEFAULT '',
      contact_type VARCHAR(20) DEFAULT '연락처',
      contact VARCHAR(100) NOT NULL,
      sport VARCHAR(50) NOT NULL,
      region_name VARCHAR(50) NOT NULL,
      region_code VARCHAR(50) NOT NULL,
      employment_type VARCHAR(20) NOT NULL,
      salary VARCHAR(100) NOT NULL,
      headcount VARCHAR(20) DEFAULT '',
      benefits TEXT DEFAULT '',
      preferences TEXT DEFAULT '',
      deadline VARCHAR(50) DEFAULT '',
      likes INT DEFAULT 0,
      views INT DEFAULT 0,
      is_closed BOOLEAN DEFAULT false,
      ip_address VARCHAR(50) DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;

  // job_post_likes 테이블 (IP 기반 좋아요)
  await sql`
    CREATE TABLE IF NOT EXISTS job_post_likes (
      id SERIAL PRIMARY KEY,
      job_post_id INT NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
      ip_address TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(job_post_id, ip_address)
    )
  `;

  return NextResponse.json({ success: true, message: "job_posts table created" });
}
