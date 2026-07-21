-- Columns for the unified restaurant enrichment (enrich-restaurants-all).
-- One DataForSEO my_business_info lookup fills rating/reviews/cuisine/image AND
-- opening hours; `enriched_at` is the single "processed" marker so no venue is
-- ever looked up (or billed) twice. Supersedes add-venue-google-hours.sql.
--
-- Run in the Supabase SQL editor (clear the editor first), then reload the API schema.

alter table venue_ratings add column if not exists google_hours text;
alter table venue_ratings add column if not exists google_hours_updated timestamptz;
alter table venue_ratings add column if not exists enriched_at timestamptz;

notify pgrst, 'reload schema';
