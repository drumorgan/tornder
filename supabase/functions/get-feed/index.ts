import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Inlined CORS ---
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://tornder.girovagabondo.com'
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
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

    if (!['marriage', 'island', 'company', 'train'].includes(category)) {
      return new Response(
        JSON.stringify({ error: 'Invalid category' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up viewer's flags to determine their role for category-specific filtering
    const { data: viewerFlags } = await supabase
      .from('flags')
      .select('is_single, seeking_marriage, is_director, company_hiring, seeking_job, has_island, island_open, seeking_island, preferred_company_types, train_selling, train_buying')
      .eq('torn_player_id', viewer_id)
      .single()

    // Only show feed if viewer has opted into the relevant category
    const emptyResponse = new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

    switch (category) {
      case 'marriage':
        if (!viewerFlags?.seeking_marriage) return emptyResponse
        break
      case 'island':
        if (!viewerFlags?.island_open && !viewerFlags?.seeking_island) return emptyResponse
        break
      case 'company':
        if (!viewerFlags?.company_hiring && !viewerFlags?.seeking_job) return emptyResponse
        break
      case 'train':
        if (!viewerFlags?.train_selling && !viewerFlags?.train_buying) return emptyResponse
        break
    }

    // Fetch all players with matching opt-in flags (everyone is visible)
    let feedQuery = supabase
      .from('players')
      .select(`
        torn_player_id, name, faction_id, faction_name,
        company_id, company_name, company_role, company_type, company_stars,
        level, age, last_action, manual_labor, intelligence, endurance,
        flags!inner (
          is_single, seeking_marriage,
          has_island, island_open, seeking_island,
          is_director, company_hiring, seeking_job,
          preferred_company_types,
          train_selling, train_buying
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
        // Island owners with open spots see seekers; seekers see open islands
        if (viewerFlags?.island_open) {
          feedQuery = feedQuery.eq('flags.seeking_island', true)
        } else {
          feedQuery = feedQuery.eq('flags.island_open', true)
        }
        break
      case 'company':
        // Directors who are hiring see job seekers; job seekers see hiring companies
        if (viewerFlags?.is_director) {
          feedQuery = feedQuery.eq('flags.seeking_job', true)
        } else {
          feedQuery = feedQuery.eq('flags.company_hiring', true)
        }
        break
      case 'train':
        // Train sellers (directors) see buyers; buyers see sellers
        if (viewerFlags?.train_selling) {
          feedQuery = feedQuery.eq('flags.train_buying', true)
        } else {
          feedQuery = feedQuery.eq('flags.train_selling', true)
        }
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

    // Company type filtering (bidirectional)
    // - Seekers: only see directors whose company type is in the seeker's preferred list
    // - Directors: only see seekers who have the director's company type in their preferred list
    let viewerCompanyType: number | null = null
    if (category === 'company' && viewerFlags?.is_director) {
      const { data: viewerPlayer } = await supabase
        .from('players')
        .select('company_type')
        .eq('torn_player_id', viewer_id)
        .single()
      viewerCompanyType = viewerPlayer?.company_type ?? null
    }

    const viewerPreferredTypes = viewerFlags?.preferred_company_types as number[] | null
    const viewerIsSeeker = category === 'company' && !viewerFlags?.is_director
    const viewerIsDirector = category === 'company' && viewerFlags?.is_director
    const seekerPreferredSet = (viewerIsSeeker && viewerPreferredTypes && viewerPreferredTypes.length > 0)
      ? new Set(viewerPreferredTypes) : null

    const filtered = (players || [])
      .filter((p: any) => !swipedIds.has(p.torn_player_id))
      .filter((p: any) => {
        if (!category.startsWith('company')) return true
        const pflags = Array.isArray(p.flags) ? p.flags[0] : p.flags

        if (viewerIsSeeker && seekerPreferredSet) {
          // Seeker with preferences: only show directors whose company type matches
          return p.company_type && seekerPreferredSet.has(p.company_type)
        }

        if (viewerIsDirector && viewerCompanyType) {
          // Director: only show seekers who want the director's company type
          // Seekers with no preferences (null/empty) are shown to all directors
          const seekerPrefs = pflags?.preferred_company_types as number[] | null
          if (!seekerPrefs || seekerPrefs.length === 0) return true
          return seekerPrefs.includes(viewerCompanyType)
        }

        return true
      })
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
