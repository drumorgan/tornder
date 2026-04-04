import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encryptApiKey } from '../_shared/crypto.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { player_id, api_key, player_data, flags_data } = await req.json()

    if (!player_id || !api_key) {
      return new Response(
        JSON.stringify({ error: 'Missing player_id or api_key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1) Encrypt the API key
    const { ciphertext, iv, keyVersion } = await encryptApiKey(api_key)

    // 2) Upsert player profile data (without api_key)
    if (player_data) {
      const { error: playerErr } = await supabase
        .from('players')
        .upsert(player_data, { onConflict: 'torn_player_id' })

      if (playerErr) {
        return new Response(
          JSON.stringify({ error: `Player upsert failed: ${playerErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 3) Upsert flags if provided
    if (flags_data) {
      const { error: flagsErr } = await supabase
        .from('flags')
        .upsert(flags_data, { onConflict: 'torn_player_id' })

      if (flagsErr) {
        return new Response(
          JSON.stringify({ error: `Flags upsert failed: ${flagsErr.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 4) Store encrypted key in player_secrets
    const { error: secretErr } = await supabase
      .from('player_secrets')
      .upsert({
        torn_player_id: player_id,
        api_key_enc: ciphertext,
        api_key_iv: iv,
        key_version: keyVersion,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'torn_player_id' })

    if (secretErr) {
      return new Response(
        JSON.stringify({ error: `Secret storage failed: ${secretErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5) Audit log
    await supabase.from('secret_audit_log').insert({
      torn_player_id: player_id,
      action: 'set',
      edge_function: 'set-api-key',
    })

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `set-api-key error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
