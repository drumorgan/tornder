import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { viewer_id, category } = await req.json()

    if (!viewer_id || !category) {
      return new Response(
        JSON.stringify({ error: 'Missing viewer_id or category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up viewer's faction and company
    const { data: viewer, error: viewerErr } = await supabase
      .from('players')
      .select('faction_id, company_id')
      .eq('torn_player_id', viewer_id)
      .single()

    if (viewerErr || !viewer) {
      return new Response(
        JSON.stringify({ error: 'Viewer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build the category filter clause
    let categoryFilter = ''
    switch (category) {
      case 'marriage':
        categoryFilter = 'f.seeking_marriage = true'
        break
      case 'island':
        categoryFilter = '(f.island_open = true OR f.seeking_island = true)'
        break
      case 'company':
        categoryFilter = '(f.company_hiring = true OR f.seeking_job = true)'
        break
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid category' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    const query = `
      SELECT p.torn_player_id, p.name, p.faction_id, p.faction_name,
             p.company_id, p.company_name, p.company_role,
             f.is_single, f.seeking_marriage,
             f.has_island, f.island_open, f.seeking_island,
             f.is_director, f.company_hiring, f.seeking_job
      FROM players p
      JOIN flags f ON f.torn_player_id = p.torn_player_id
      WHERE
        (
          p.is_public = true
          ${viewer.faction_id ? `OR p.faction_id = ${viewer.faction_id}` : ''}
          ${viewer.company_id ? `OR p.company_id = ${viewer.company_id}` : ''}
        )
        AND p.torn_player_id != ${viewer_id}
        AND p.torn_player_id NOT IN (
          SELECT to_player_id FROM interests
          WHERE from_player_id = ${viewer_id} AND category = '${category}'
        )
        AND p.torn_player_id NOT IN (
          SELECT to_player_id FROM dismissed
          WHERE from_player_id = ${viewer_id} AND category = '${category}'
        )
        AND ${categoryFilter}
      ORDER BY p.last_verified DESC
      LIMIT 50
    `

    const { data: feed, error: feedErr } = await supabase.rpc('exec_sql', { query })

    // Fallback: if exec_sql RPC doesn't exist, use direct table queries
    // We'll use a simpler approach with Supabase client
    if (feedErr) {
      // Use direct queries instead
      let feedQuery = supabase
        .from('players')
        .select(`
          torn_player_id, name, faction_id, faction_name,
          company_id, company_name, company_role,
          flags!inner (
            is_single, seeking_marriage,
            has_island, island_open, seeking_island,
            is_director, company_hiring, seeking_job
          )
        `)
        .neq('torn_player_id', viewer_id)
        .order('last_verified', { ascending: false })
        .limit(50)

      // Visibility filter: public OR same faction OR same company
      const orClauses = ['is_public.eq.true']
      if (viewer.faction_id) orClauses.push(`faction_id.eq.${viewer.faction_id}`)
      if (viewer.company_id) orClauses.push(`company_id.eq.${viewer.company_id}`)
      feedQuery = feedQuery.or(orClauses.join(','))

      // Category filter on flags
      switch (category) {
        case 'marriage':
          feedQuery = feedQuery.eq('flags.seeking_marriage', true)
          break
        case 'island':
          feedQuery = feedQuery.or('island_open.eq.true,seeking_island.eq.true', { referencedTable: 'flags' })
          break
        case 'company':
          feedQuery = feedQuery.or('company_hiring.eq.true,seeking_job.eq.true', { referencedTable: 'flags' })
          break
      }

      const { data: players, error: playersErr } = await feedQuery

      if (playersErr) {
        return new Response(
          JSON.stringify({ error: playersErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Filter out already swiped players
      const { data: swiped } = await supabase
        .from('interests')
        .select('to_player_id')
        .eq('from_player_id', viewer_id)
        .eq('category', category)

      const { data: dismissedList } = await supabase
        .from('dismissed')
        .select('to_player_id')
        .eq('from_player_id', viewer_id)
        .eq('category', category)

      const swipedIds = new Set([
        ...(swiped || []).map((r: any) => r.to_player_id),
        ...(dismissedList || []).map((r: any) => r.to_player_id),
      ])

      const filtered = (players || [])
        .filter((p: any) => !swipedIds.has(p.torn_player_id))
        .map((p: any) => ({
          ...p,
          // Flatten flags from nested object
          ...(Array.isArray(p.flags) ? p.flags[0] : p.flags),
          flags: undefined,
        }))

      return new Response(JSON.stringify(filtered), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify(feed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Feed error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
