import { supabase } from "@/app/lib/supabase";
import { pageMeta } from "@/app/lib/seo";
import { OrgsView, type Org } from "./orgs-view";

export const revalidate = 300;

export const metadata = pageMeta({
  title: "종목별 체육단체 연락처 — 실기·구술 문의처",
  description:
    "체육지도사 실기·구술 시험 관련 문의를 위한 종목별 체육단체(협회·연맹) 전화번호, 주소, 홈페이지 목록.",
  path: "/practical/notice/orgs",
});

export default async function OrgsPage() {
  let initialOrgs: Org[] | null = null;
  try {
    const { data, error } = await supabase
      .from("sport_organizations")
      .select("id, sport_name, org_name, phone, zipcode, address, website")
      .eq("audience", "main")
      .order("sport_name", { ascending: true });
    if (!error && data) initialOrgs = data as Org[];
  } catch {
    initialOrgs = null;
  }
  return <OrgsView initialOrgs={initialOrgs} />;
}
