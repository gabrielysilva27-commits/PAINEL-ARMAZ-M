alter table public.receiving_nri_receipts add column if not exists issue_date date;
comment on column public.receiving_nri_receipts.issue_date is 'Data de emissão informada pela Portaria, distinta da data de chegada.';
