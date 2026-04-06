export interface Category {
  id: number;
  name: string;
  emoji: string;
  sort_order: number;
  is_popular: boolean;
  post_count: number;
}

export interface Inquiry {
  id: number;
  author: string;
  email?: string;
  title: string;
  content: string;
  reply: string | null;
  replied_at: string | null;
  hidden: boolean;
  created_at: string;
}

export interface Comment {
  id: number;
  post_id: number;
  parent_id: number | null;
  author: string;
  content: string;
  likes: number;
  reply_count: number;
  created_at: string;
  ip_display?: string;
}

export interface Report {
  id: number;
  target_type: "post" | "comment" | "job";
  target_id: number;
  post_id: number;
  category_id: number;
  reason: string;
  custom_reason: string | null;
  resolved: boolean;
  resolved_at: string | null;
  deleted_at: string | null;
  created_at: string;
  // joined fields
  post_title?: string;
  post_author?: string;
  comment_content?: string;
  comment_author?: string;
  category_name?: string;
}

export interface Post {
  id: number;
  category_id: number;
  title: string;
  content: string;
  author: string;
  region: string;
  tags: string;
  likes: number;
  comments_count: number;
  is_notice: boolean;
  views: number;
  created_at: string;
  updated_at: string;
  category_name?: string;
  ip_display?: string;
}

export interface JobPost {
  id: number;
  title: string;
  description: string;
  center_name: string;
  address: string;
  author_role: string;
  author_name: string;
  contact_type: string;
  contact: string;
  sport: string;
  region_name: string;
  region_code: string;
  employment_type: string;
  salary: string;
  headcount: string;
  benefits: string;
  preferences: string;
  deadline: string;
  likes: number;
  views: number;
  is_closed: boolean;
  bookmark_count: number;
  firebase_uid: string;
  created_at: string;
  updated_at: string;
}
