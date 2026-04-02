import { supabase } from './supabase.js';
import { callTornApi } from './torn-api.js';
import { showToast } from './ui/toast.js';
import { setPlayerId, navigate } from './main.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="screen login-screen">
      <div class="login-card">
        <h2>Welcome to Tornder</h2>
        <p class="login-subtitle">Swipe your way through Torn City</p>
        <div class="form-group">
          <label for="api-key-input">Torn API Key</label>
          <input type="text" id="api-key-input" placeholder="Paste your API key" autocomplete="off" />
        </div>
        <button id="login-btn" class="btn btn-primary">Enter</button>
        <p class="key-disclaimer">Your API key is stored so you stay logged in. You can revoke it anytime from your <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener">Torn API settings</a>.</p>
        <details class="login-help">
          <summary>Need an API key?</summary>
          <p>Create a custom key with these permissions:</p>
          <ul>
            <li>User: basic, profile, properties</li>
            <li>Faction: basic</li>
            <li>Company: employees</li>
          </ul>
          <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener">
            Create key on Torn
          </a>
        </details>
      </div>
    </div>
  `;

  const input = document.getElementById('api-key-input');
  const btn = document.getElementById('login-btn');

  btn.addEventListener('click', () => handleLogin(input.value.trim()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin(input.value.trim());
  });
}

async function handleLogin(key) {
  if (!key) {
    showToast('Please enter your API key');
    return;
  }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  // Step 1: Verify key and get user data
  const userData = await callTornApi({
    section: 'user',
    selections: 'basic,profile,properties',
    key,
  });

  if (!userData) {
    btn.disabled = false;
    btn.textContent = 'Enter';
    return;
  }

  const playerId = userData.player_id;
  if (!playerId) {
    showToast('Unexpected response from Torn API');
    btn.disabled = false;
    btn.textContent = 'Enter';
    return;
  }

  // Step 2: Derive Torn-verified flags
  const isSingle = !userData.married || userData.married.spouse_id === 0;
  const hasIsland = userData.property === 'Private Island';
  const isDirector = userData.job && userData.job.job === 'Director';

  // Step 3: Upsert player row (now stores API key + company_type)
  const { error: playerErr } = await supabase
    .from('players')
    .upsert({
      torn_player_id: playerId,
      name: userData.name,
      faction_id: userData.faction?.faction_id || null,
      faction_name: userData.faction?.faction_name || null,
      company_id: userData.job?.company_id || null,
      company_name: userData.job?.company_name || null,
      company_role: userData.job?.job || null,
      company_type: userData.job?.company_type || null,
      api_key: key,
      last_verified: new Date().toISOString(),
    }, { onConflict: 'torn_player_id' });

  if (playerErr) {
    showToast(`Database error: ${playerErr.message}`);
    btn.disabled = false;
    btn.textContent = 'Enter';
    return;
  }

  // Step 4: Upsert flags (Torn-verified fields only, preserve user opt-ins)
  const { data: existingFlags } = await supabase
    .from('flags')
    .select('*')
    .eq('torn_player_id', playerId)
    .single();

  const flagsRow = {
    torn_player_id: playerId,
    is_single: isSingle,
    has_island: hasIsland,
    is_director: isDirector,
    seeking_marriage: existingFlags?.seeking_marriage ?? false,
    island_open: existingFlags?.island_open ?? false,
    seeking_island: existingFlags?.seeking_island ?? false,
    company_hiring: existingFlags?.company_hiring ?? false,
    seeking_job: existingFlags?.seeking_job ?? false,
    updated_at: new Date().toISOString(),
  };

  // Clear opt-ins that no longer make sense after re-verification
  if (!isSingle) flagsRow.seeking_marriage = false;
  if (!hasIsland) flagsRow.island_open = false;
  if (hasIsland) flagsRow.seeking_island = false;
  if (!isDirector) flagsRow.company_hiring = false;
  if (isDirector) flagsRow.seeking_job = false;

  const { error: flagsErr } = await supabase
    .from('flags')
    .upsert(flagsRow, { onConflict: 'torn_player_id' });

  if (flagsErr) {
    showToast(`Database error: ${flagsErr.message}`);
    btn.disabled = false;
    btn.textContent = 'Enter';
    return;
  }

  // Step 5: Store session
  setPlayerId(playerId);

  showToast(`Welcome, ${userData.name}!`, 'success');
  navigate('profile');
}
