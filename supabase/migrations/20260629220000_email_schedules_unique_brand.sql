-- One schedule per brand — prevent duplicates
alter table public.email_schedules
  add constraint email_schedules_brand_id_unique unique (brand_id);
