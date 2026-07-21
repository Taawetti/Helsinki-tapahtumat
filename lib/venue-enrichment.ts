import type { SupabaseClient } from '@supabase/supabase-js'

// Fetch the FULL set of venue_keys already enriched for a given column.
//
// Critical: Supabase caps a select at 1000 rows unless you paginate with
// .range(). The enrichment "skip already done" queries used a single
// un-paginated select, so once venue_ratings passed 1000 rows the skip set was
// truncated — thousands of already-done venues looked "undone", got
// re-processed and re-charged on every batch, and the admin loop never reached
// remaining=0 (a runaway DataForSEO bill). This paginates to get every key.
//
// `notNullColumn` is the column whose non-null value marks a venue as done
// (e.g. 'cuisine_categories', 'sub_categories', 'google_hours_updated').
export async function fetchEnrichedKeys(
  client: SupabaseClient,
  notNullColumn: string,
): Promise<{ keys: Set<string>; error: string | null }> {
  const keys = new Set<string>()
  const PAGE = 1000
  for (let page = 0; ; page++) {
    const { data, error } = await client
      .from('venue_ratings')
      .select('venue_key')
      .not(notNullColumn, 'is', null)
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return { keys, error: error.message }
    if (!data || data.length === 0) break
    for (const row of data as { venue_key: string }[]) keys.add(row.venue_key)
    if (data.length < PAGE) break
  }
  return { keys, error: null }
}
