/**
 * Shared CORS headers — locked to production domain.
 */

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://tornder.girovagabondo.com'

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}
