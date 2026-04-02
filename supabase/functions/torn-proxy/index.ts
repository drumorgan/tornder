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
    const { section, id, selections, key, player_id } = await req.json()

    if (!section || !selections) {
      return new Response(
        JSON.stringify({ error: { code: 0, error: 'Missing required fields: section, selections' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let apiKey = key

    // If no key provided, look it up from DB using player_id
    if (!apiKey && player_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const { data: player } = await supabase
        .from('players')
        .select('api_key')
        .eq('torn_player_id', player_id)
        .single()

      if (!player?.api_key) {
        return new Response(
          JSON.stringify({ error: { code: 0, error: 'No stored API key. Please log in again.' } }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      apiKey = player.api_key
    }

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: { code: 0, error: 'Missing key or player_id' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const idSegment = id ? `/${id}` : ''
    const url = `https://api.torn.com/${section}${idSegment}?selections=${selections}&key=${apiKey}`
    const tornRes = await fetch(url)
    const data = await tornRes.json()

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: { code: 0, error: `Proxy error: ${err.message}` } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
