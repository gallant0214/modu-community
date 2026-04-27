import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

async function seedNewCategories() {
  const newCategories = [
    { name: "검도", emoji: "⚔️" },
    { name: "게이트볼", emoji: "🏑" },
    { name: "궁도", emoji: "🏹" },
    { name: "근대5종", emoji: "🏅" },
    { name: "글라이딩", emoji: "🛩️" },
    { name: "기계체조", emoji: "🤸" },
    { name: "카누", emoji: "🛶" },
    { name: "카바디", emoji: "🤼" },
    { name: "카누슬라럼", emoji: "🛶" },
    { name: "조정", emoji: "🚣" },
    { name: "권투", emoji: "🥊" },
    { name: "당구", emoji: "🎱" },
    { name: "럭비", emoji: "🏉" },
    { name: "레슬링", emoji: "🤼" },
    { name: "롤러", emoji: "🛼" },
    { name: "리듬체조", emoji: "🎀" },
    { name: "무에타이", emoji: "🥊" },
    { name: "바이애슬론", emoji: "🎿" },
    { name: "바둑", emoji: "⚫" },
    { name: "복싱", emoji: "🥊" },
    { name: "빙상", emoji: "⛸️" },
    { name: "사격", emoji: "🔫" },
    { name: "산악", emoji: "🧗" },
    { name: "사이클", emoji: "🚴" },
    { name: "세팍타크로", emoji: "🏐" },
    { name: "소프트볼", emoji: "🥎" },
    { name: "소프트테니스", emoji: "🎾" },
    { name: "수상스키", emoji: "🎿" },
    { name: "수중", emoji: "🤿" },
    { name: "스쿼시", emoji: "🎾" },
    { name: "스키", emoji: "⛷️" },
    { name: "승마", emoji: "🏇" },
    { name: "씨름", emoji: "💪" },
    { name: "아이스하키", emoji: "🏒" },
    { name: "양궁", emoji: "🏹" },
    { name: "오리엔티어링", emoji: "🧭" },
    { name: "요트", emoji: "⛵" },
    { name: "우슈", emoji: "🥋" },
    { name: "윈드서핑", emoji: "🏄" },
    { name: "유도", emoji: "🥋" },
    { name: "육상", emoji: "🏃" },
    { name: "정구", emoji: "🎾" },
    { name: "줄다리기", emoji: "🪢" },
    { name: "철인3종", emoji: "🏊" },
    { name: "체조", emoji: "🤸" },
    { name: "탁구", emoji: "🏓" },
    { name: "택견", emoji: "🥋" },
    { name: "패러글라이딩", emoji: "🪂" },
    { name: "펜싱", emoji: "🤺" },
    { name: "하키", emoji: "🏑" },
    { name: "합기도", emoji: "🥋" },
    { name: "행글라이딩", emoji: "🪂" },
  ];

  // 기존 종목 이름 조회
  const existing = await sql`SELECT name FROM categories`;
  const existingNames = new Set(existing.map((r) => r.name));

  const toInsert = newCategories.filter((c) => !existingNames.has(c.name));

  if (toInsert.length === 0) {
    console.log("All categories already exist, nothing to add.");
    return;
  }

  for (const cat of toInsert) {
    await sql`INSERT INTO categories (name, emoji, is_popular, sort_order) VALUES (${cat.name}, ${cat.emoji}, false, 0)`;
    console.log(`Added: ${cat.emoji} ${cat.name}`);
  }

  console.log(`\nDone! Added ${toInsert.length} new categories.`);
}

seedNewCategories().catch(console.error);
