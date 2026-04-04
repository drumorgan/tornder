import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Inlined CORS ---
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://tornder.girovagabondo.com'
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Inlined crypto helpers (AES-256-GCM decrypt only) ---
function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}
async function importKey(rawB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(rawB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
async function decryptApiKey(ciphertextB64: string, ivB64: string, _keyVersion = 1): Promise<string> {
  const rawKey = Deno.env.get('API_KEY_ENCRYPTION_KEY')
  if (!rawKey) throw new Error('Missing API_KEY_ENCRYPTION_KEY env var')
  const key = await importKey(rawKey)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(ivB64) }, key, base64ToBytes(ciphertextB64))
  return new TextDecoder().decode(decrypted)
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

    // If no key provided, decrypt stored key from player_secrets
    if (!apiKey && player_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)

      const { data: secret } = await supabase
        .from('player_secrets')
        .select('api_key_enc, api_key_iv, key_version')
        .eq('torn_player_id', player_id)
        .single()

      if (!secret?.api_key_enc || !secret?.api_key_iv) {
        return new Response(
          JSON.stringify({ error: { code: 0, error: 'No stored API key. Please log in again.' } }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      apiKey = await decryptApiKey(secret.api_key_enc, secret.api_key_iv, secret.key_version)

      // Audit the decryption usage
      await supabase.from('secret_audit_log').insert({
        torn_player_id: player_id,
        action: 'decrypt_used',
        edge_function: 'torn-proxy',
      })
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
