-- Google-sourced opening hours for restaurants/venues.
-- OSM opening_hours are frequently stale (e.g. Roji tagged open Sundays in OSM
-- while Google shows closed). The enrich-restaurant-hours admin job fetches
-- Google hours via DataForSEO, converts them to an OSM-format string, and
-- stores them here; /api/restaurants prefers these over OSM.
--
-- Run in the Supabase SQL editor (clear the editor first), then reload the API schema.

alter table venue_ratings add column if not exists google_hours text;
alter table venue_ratings add column if not exists google_hours_updated timestamptz;

notify pgrst, 'reload schema';
