import { supabase, supabaseUrl, supabaseAnonKey } from './supabase.js';
import { callTornApi } from './torn-api.js';
import { showToast } from './ui/toast.js';
import { setPlayerId, navigate, updateUserCount } from './main.js';

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
        <p class="key-disclaimer">Need a key? <a href="https://www.torn.com/preferences.php#tab=api?step=addNewKey&user=basic,profile,properties,workstats&title=Tornder" target="_blank" rel="noopener">Click here to create a Custom Key</a> &mdash; it only shares your name, faction, company, property, and work stats info. Your key is stored so you stay logged in. You can revoke it anytime from your <a href="https://www.torn.com/preferences.php#tab=api" target="_blank" rel="noopener">Torn API settings</a>.</p>
      </div>

      <div class="tos-box">
        <h3 class="tos-title">API Terms of Service</h3>
        <div class="tos-grid">
          <div>
            <p class="tos-heading">DATA STORAGE</p>
            <p>Player name, ID, level, age, faction, company, working stats, marriage &amp; property status stored until you delete your data</p>
          </div>
          <div>
            <p class="tos-heading">DATA SHARING</p>
            <p>Your name, level, age, faction, company, and working stats are shown to other Tornder users when you opt in</p>
          </div>
          <div>
            <p class="tos-heading">KEY STORAGE</p>
            <p>Encrypted server-side (AES-256) for auto-login. Never shared. Revoke anytime from Torn settings</p>
          </div>
          <div>
            <p class="tos-heading">KEY ACCESS LEVEL</p>
            <p>Custom: user &rarr; basic, profile, properties, workstats</p>
          </div>
        </div>
      </div>

      <div class="giro-box">
        <p class="giro-box-title">More Torn tools by Giro Vagabondo</p>
        <a href="https://happyjump.girovagabondo.com" target="_blank" rel="noopener" class="giro-box-link">HappyJump</a> &mdash; Insured happy jumping
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
    selections: 'basic,profile,properties,workstats',
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

  // Step 3: Build player + flags data, send to set-api-key Edge Function
  // The Edge Function encrypts the key and stores everything server-side.
  // The plaintext API key is NEVER written to the DB from the client.
  const playerData = {
    torn_player_id: playerId,
    name: userData.name,
    faction_id: userData.faction?.faction_id || null,
    faction_name: userData.faction?.faction_name || null,
    company_id: userData.job?.company_id || null,
    company_name: userData.job?.company_name || null,
    company_role: userData.job?.job || null,
    company_type: userData.job?.company_type || null,
    level: userData.level || null,
    age: userData.age || null,
    last_action: userData.last_action?.timestamp ? new Date(userData.last_action.timestamp * 1000).toISOString() : null,
    manual_labor: userData.manual_labor || null,
    intelligence: userData.intelligence || null,
    endurance: userData.endurance || null,
    last_verified: new Date().toISOString(),
  };

  // Step 4: Build flags (Torn-verified fields only, preserve user opt-ins)
  // Fetch existing flags so we can preserve user opt-ins
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
    preferred_company_types: existingFlags?.preferred_company_types ?? null,
    updated_at: new Date().toISOString(),
  };

  // Clear opt-ins that no longer make sense after re-verification
  if (!isSingle) flagsRow.seeking_marriage = false;
  if (!hasIsland) flagsRow.island_open = false;
  if (hasIsland) flagsRow.seeking_island = false;
  if (!isDirector) flagsRow.company_hiring = false;
  if (isDirector) flagsRow.seeking_job = false;

  // Step 5: Send everything to set-api-key (encrypts + stores server-side)
  const setKeyRes = await fetch(`${supabaseUrl}/functions/v1/set-api-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      player_id: playerId,
      api_key: key,
      player_data: playerData,
      flags_data: flagsRow,
    }),
  });

  const setKeyResult = await setKeyRes.json();
  if (!setKeyRes.ok || setKeyResult.error) {
    showToast(`Database error: ${setKeyResult.error || 'Failed to store key'}`);
    btn.disabled = false;
    btn.textContent = 'Enter';
    return;
  }

  // Step 6: Store session
  setPlayerId(playerId);
  updateUserCount();

  showToast(`Welcome, ${userData.name}!`, 'success');
  navigate('profile');
}
