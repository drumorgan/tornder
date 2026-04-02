import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { section, id, selections, key } = await req.json()

    if (!section || !selections || !key) {
      return new Response(
        JSON.stringify({ error: { code: 0, error: 'Missing required fields: section, selections, key' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const idSegment = id ? `/${id}` : ''
    const url = `https://api.torn.com/${section}${idSegment}?selections=${selections}&key=${key}`
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
