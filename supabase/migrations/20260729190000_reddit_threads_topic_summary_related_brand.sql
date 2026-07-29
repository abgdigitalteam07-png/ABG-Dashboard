alter table reddit_threads
  add column if not exists topic_summary text,
  add column if not exists most_related_brand text;
