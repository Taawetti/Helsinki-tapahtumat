-- Full Google My Business profile (raw JSON) for activities/venues.
--
-- One DataForSEO my_business_info lookup returns far more than
-- rating/image/hours (attributes, place_topics, popular_times, address, phone,
-- website, rating_distribution, …). Storing the raw item keeps EVERYTHING, so
-- we never have to re-pay a lookup just to surface a field we skipped.
-- Structured columns (google_rating, main_image, google_hours, description, …)
-- stay populated for the fields the UI uses today; google_raw is the archive.
--
-- Run in the Supabase SQL editor (CLEAR the editor first), then reload the API schema.

alter table venue_ratings add column if not exists google_raw jsonb;

notify pgrst, 'reload schema';
