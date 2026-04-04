import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { decryptApiKey } from '../_shared/crypto.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { player_id } = await req.json()

    if (!player_id) {
      return new Response(
        JSON.stringify({ error: 'Missing player_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Look up encrypted API key from player_secrets
    const { data: secret, error: secretErr } = await supabase
      .from('player_secrets')
      .select('api_key_enc, api_key_iv, key_version')
      .eq('torn_player_id', player_id)
      .single()

    if (secretErr || !secret?.api_key_enc || !secret?.api_key_iv) {
      return new Response(
        JSON.stringify({ error: 'no_key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Decrypt the stored key
    const apiKey = await decryptApiKey(secret.api_key_enc, secret.api_key_iv, secret.key_version)

    // Audit
    await supabase.from('secret_audit_log').insert({
      torn_player_id: player_id,
      action: 'decrypt_used',
      edge_function: 'auto-login',
    })

    // Verify key is still valid
    const tornRes = await fetch(
      `https://api.torn.com/user/?selections=basic,profile,properties&key=${apiKey}`
    )
    const userData = await tornRes.json()

    if (userData.error) {
      // Key revoked or expired — clear encrypted secret
      await supabase
        .from('player_secrets')
        .delete()
        .eq('torn_player_id', player_id)

      await supabase.from('secret_audit_log').insert({
        torn_player_id: player_id,
        action: 'cleared',
        edge_function: 'auto-login',
      })

      return new Response(
        JSON.stringify({ error: 'key_invalid', torn_error: userData.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Refresh player data while we're here
    const isSingle = !userData.married || userData.married.spouse_id === 0
    const hasIsland = userData.property === 'Private Island'
    const isDirector = userData.job && userData.job.job === 'Director'

    // Fetch company stars if player has a company
    let companyStars: number | null = null
    if (userData.job?.company_id) {
      try {
        const companyRes = await fetch(
          `https://api.torn.com/company/${userData.job.company_id}?selections=profile&key=${apiKey}`
        )
        const companyData = await companyRes.json()
        if (companyData && !companyData.error && companyData.company?.rating) {
          companyStars = companyData.company.rating
        }
      } catch (_) {
        // Non-critical — skip if company API call fails
      }
    }

    await supabase.from('players').update({
      name: userData.name,
      faction_id: userData.faction?.faction_id || null,
      faction_name: userData.faction?.faction_name || null,
      company_id: userData.job?.company_id || null,
      company_name: userData.job?.company_name || null,
      company_role: userData.job?.job || null,
      company_type: userData.job?.company_type || null,
      company_stars: companyStars,
      level: userData.level || null,
      age: userData.age || null,
      last_verified: new Date().toISOString(),
    }).eq('torn_player_id', player_id)

    // Update flags
    const { data: existingFlags } = await supabase
      .from('flags')
      .select('seeking_marriage, island_open, seeking_island, company_hiring, seeking_job')
      .eq('torn_player_id', player_id)
      .single()

    if (existingFlags) {
      const flagUpdate: Record<string, any> = {
        is_single: isSingle,
        has_island: hasIsland,
        is_director: isDirector,
        updated_at: new Date().toISOString(),
      }
      if (!isSingle) flagUpdate.seeking_marriage = false
      if (!hasIsland) flagUpdate.island_open = false
      if (hasIsland) flagUpdate.seeking_island = false
      if (!isDirector) flagUpdate.company_hiring = false
      if (isDirector) flagUpdate.seeking_job = false

      await supabase.from('flags').update(flagUpdate).eq('torn_player_id', player_id)
    }

    return new Response(
      JSON.stringify({
        success: true,
        player_id: userData.player_id,
        name: userData.name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Auto-login error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
