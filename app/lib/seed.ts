import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function seed() {
  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      emoji VARCHAR(10) NOT NULL,
      sort_order INT DEFAULT 0,
      is_popular BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  console.log("Created categories table");

  await sql`
    ALTER TABLE posts
    ADD COLUMN IF NOT EXISTS category_id INT REFERENCES categories(id) ON DELETE CASCADE
  `;
  console.log("Added category_id to posts table");

  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS author VARCHAR(100) NOT NULL DEFAULT '익명'`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS region VARCHAR(50) NOT NULL DEFAULT '전국'`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags VARCHAR(255) NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS likes INT DEFAULT 0`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count INT DEFAULT 0`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS password VARCHAR(255) NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_notice BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS views INT DEFAULT 0`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50) DEFAULT ''`;
  console.log("Added author/region/tags/likes/comments/password/is_notice/ip_address columns to posts");

  await sql`
    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      author VARCHAR(100) NOT NULL,
      password VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  console.log("Created inquiries table");

  await sql`
    ALTER TABLE inquiries
    ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL DEFAULT ''
  `;
  await sql`ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`;
  await sql`
    ALTER TABLE inquiries
    ADD COLUMN IF NOT EXISTS reply TEXT
  `;
  await sql`
    ALTER TABLE inquiries
    ADD COLUMN IF NOT EXISTS replied_at TIMESTAMP WITH TIME ZONE
  `;
  console.log("Ensured title/reply columns on inquiries");

  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author VARCHAR(100) NOT NULL,
      password VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE comments ADD COLUMN IF NOT EXISTS ip_address VARCHAR(50) DEFAULT ''`;
  console.log("Created comments table");

  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      target_type VARCHAR(10) NOT NULL,
      target_id INT NOT NULL,
      post_id INT NOT NULL,
      category_id INT NOT NULL,
      reason VARCHAR(255) NOT NULL,
      custom_reason TEXT,
      resolved BOOLEAN DEFAULT false,
      resolved_at TIMESTAMP WITH TIME ZONE,
      deleted_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `;
  console.log("Created reports table");

  const existing = await sql`SELECT COUNT(*) as count FROM categories`;
  if (Number(existing[0].count) > 0) {
    console.log("Categories already seeded, skipping");
    return;
  }

  await sql`
    INSERT INTO categories (name, emoji, is_popular, sort_order) VALUES
    ('보디빌딩', '🏋️', true, 1),
    ('축구', '⚽', true, 2),
    ('요가·필라테스', '🧘', true, 3),
    ('테니스', '🎾', true, 4),
    ('수영', '🏊', true, 5),
    ('골프', '🏌️', false, 0),
    ('농구', '🏀', false, 0),
    ('배구', '🏐', false, 0),
    ('야구', '⚾', false, 0),
    ('태권도', '🥋', false, 0),
    ('핸드볼', '🤾', false, 0)
  `;
  console.log("Seeded categories");
}

seed().catch(console.error);
