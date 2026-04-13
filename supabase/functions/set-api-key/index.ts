import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Inlined CORS ---
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://tornder.girovagabondo.com'
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Inlined crypto helpers (AES-256-GCM) ---
function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}
async function importKey(rawB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64ToBytes(rawB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}
async function encryptApiKey(plaintext: string, keyVersion = 1) {
  const rawKey = Deno.env.get('API_KEY_ENCRYPTION_KEY')
  if (!rawKey) throw new Error('Missing API_KEY_ENCRYPTION_KEY env var')
  const key = await importKey(rawKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv), keyVersion }
}

// --- Session token helpers ---
// URL-safe base64 (no padding) for compact localStorage storage.
function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
function generateSessionToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

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

    // 1) Encrypt the API key and mint a fresh session token.
    // The raw token is returned to the client exactly once; we store only
    // its SHA-256 hash, so a DB leak does not hand attackers live sessions.
    // Minting a fresh token on every set-api-key call also logs out any
    // previously-authenticated device for this player.
    const { ciphertext, iv, keyVersion } = await encryptApiKey(api_key)
    const sessionToken = generateSessionToken()
    const sessionTokenHash = await sha256Hex(sessionToken)

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

    // 4) Store encrypted key + session token hash in player_secrets
    const nowIso = new Date().toISOString()
    const { error: secretErr } = await supabase
      .from('player_secrets')
      .upsert({
        torn_player_id: player_id,
        api_key_enc: ciphertext,
        api_key_iv: iv,
        key_version: keyVersion,
        session_token_hash: sessionTokenHash,
        session_token_created_at: nowIso,
        updated_at: nowIso,
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

    // Return the raw session token to the client exactly once. The client
    // must store it alongside player_id and present both on auto-login.
    return new Response(
      JSON.stringify({ success: true, session_token: sessionToken }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `set-api-key error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
