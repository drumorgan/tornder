// Helpers for filtering interests by the sender's current opt-in flag state.
//
// An interest is "active" iff the sender still has the relevant opt-in flag
// for that category enabled. Toggling a flag off quietly hides all matching
// interests; toggling it back on restores them. No data is mutated.

export function isInterestActive(flags, category) {
  if (!flags) return false;
  switch (category) {
    case 'marriage':
      return !!flags.seeking_marriage;
    case 'island':
      return !!(flags.island_open || flags.seeking_island);
    case 'company':
      return !!(flags.company_hiring || flags.seeking_job);
    case 'train':
      return !!(flags.train_selling || flags.train_buying);
    default:
      return false;
  }
}

// Given an array of { player_id, category } and a map of player_id -> flags,
// return only the entries whose sender is still opted-in for that category.
export function filterActiveInterests(entries, flagsById, getPlayerId, getCategory) {
  return entries.filter(e => {
    const pid = getPlayerId(e);
    const cat = getCategory(e);
    return isInterestActive(flagsById.get(pid), cat);
  });
}

// Fetch flags for a list of player IDs using an existing supabase client.
// Returns a Map<player_id, flags>.
export async function fetchFlagsMap(supabase, playerIds) {
  const ids = [...new Set(playerIds)].filter(id => id != null);
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from('flags')
    .select('torn_player_id, seeking_marriage, island_open, seeking_island, company_hiring, seeking_job, train_selling, train_buying')
    .in('torn_player_id', ids);
  const map = new Map();
  for (const row of data || []) {
    map.set(row.torn_player_id, row);
  }
  return map;
}
