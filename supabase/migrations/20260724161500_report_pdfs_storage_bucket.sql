-- Public bucket for emailed report PDFs — recipients need to open the
-- download link without authenticating, so files are public-read but
-- named with unguessable random ids (upload/delete still require the
-- anon key's default write policy below, matching how emails are sent).
insert into storage.buckets (id, name, public)
values ('report-pdfs', 'report-pdfs', true)
on conflict (id) do nothing;

create policy "public_read_report_pdfs"
  on storage.objects for select
  using (bucket_id = 'report-pdfs');

create policy "anon_upload_report_pdfs"
  on storage.objects for insert
  with check (bucket_id = 'report-pdfs');
