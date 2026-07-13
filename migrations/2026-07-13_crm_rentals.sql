-- 운동복/타올 등 대여권 판매 기록 (이용권 발급 - 대여). crm_memberships 패턴 미러.
CREATE TABLE IF NOT EXISTS crm_rentals (
  id serial PRIMARY KEY,
  center_id integer NOT NULL REFERENCES crm_centers(id) ON DELETE CASCADE,
  member_id integer NOT NULL REFERENCES crm_members(id) ON DELETE CASCADE,
  seller_member_id integer,
  item_name text NOT NULL,
  price_won integer NOT NULL DEFAULT 0,
  vat_included boolean NOT NULL DEFAULT false,
  payment_method text NOT NULL DEFAULT 'card',
  payment_method_custom text,
  start_date date NOT NULL,
  expires_at date NOT NULL,
  status text NOT NULL DEFAULT 'valid',
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_rentals_center_member
  ON crm_rentals (center_id, member_id, status);
