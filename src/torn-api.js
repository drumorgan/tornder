import { supabaseUrl, supabaseAnonKey } from './supabase.js';
import { showToast } from './ui/toast.js';

/**
 * Call the Torn API through the Supabase torn-proxy Edge Function.
 * Pass either { key } (first login) or { player_id } (stored key lookup).
 */
export async function callTornApi({ section, id, selections, key, player_id }) {
  try {
    const body = { section, id, selections };
    if (key) body.key = key;
    else if (player_id) body.player_id = Number(player_id);

    const res = await fetch(`${supabaseUrl}/functions/v1/torn-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      showToast(`Network error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();

    if (data.error) {
      const code = data.error.code;
      const msg = data.error.error;
      if (code === 2) showToast('Invalid API key. Check your key and try again.');
      else if (code === 5) showToast('Too many requests. Wait a moment and try again.');
      else if (code === 10) showToast('Your key cannot be used while in federal jail.');
      else if (code === 13) showToast('API key disabled due to inactivity (7+ days offline).');
      else if (code === 16) showToast('Key access level too low. Create a new key with the required permissions.');
      else showToast(`Torn API error ${code}: ${msg}`);
      return null;
    }

    return data;
  } catch (err) {
    showToast(`Failed to reach Torn API: ${err.message}`);
    return null;
  }
}
