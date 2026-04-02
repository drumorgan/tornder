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

    if (!['marriage', 'island', 'company'].includes(category)) {
      return new Response(
        JSON.stringify({ error: 'Invalid category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch all players with matching opt-in flags (everyone is visible)
    let feedQuery = supabase
      .from('players')
      .select(`
        torn_player_id, name, faction_id, faction_name,
        company_id, company_name, company_role, company_type,
        level, age,
        flags!inner (
          is_single, seeking_marriage,
          has_island, island_open, seeking_island,
          is_director, company_hiring, seeking_job
        )
      `)
      .neq('torn_player_id', viewer_id)
      .order('last_verified', { ascending: false })
      .limit(50)

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

    // Filter out already-swiped players
    const [{ data: swiped }, { data: dismissedList }] = await Promise.all([
      supabase.from('interests').select('to_player_id').eq('from_player_id', viewer_id).eq('category', category),
      supabase.from('dismissed').select('to_player_id').eq('from_player_id', viewer_id).eq('category', category),
    ])

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
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Feed error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
