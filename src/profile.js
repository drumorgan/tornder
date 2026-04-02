import { supabase } from './supabase.js';
import { callTornApi } from './torn-api.js';
import { showToast } from './ui/toast.js';
import { getPlayerId, navigate } from './main.js';

export async function renderProfile(container) {
  const playerId = getPlayerId();
  if (!playerId) {
    navigate('login');
    return;
  }

  container.innerHTML = `
    <div class="screen profile-screen">
      <div class="profile-loading">Loading profile...</div>
    </div>
  `;

  // Fetch player + flags + stats
  const [{ data: player }, { data: flags }, { count: sentCount }, { count: receivedCount }] = await Promise.all([
    supabase.from('players').select('*').eq('torn_player_id', playerId).single(),
    supabase.from('flags').select('*').eq('torn_player_id', playerId).single(),
    supabase.from('interests').select('*', { count: 'exact', head: true }).eq('from_player_id', playerId),
    supabase.from('interests').select('*', { count: 'exact', head: true }).eq('to_player_id', playerId),
  ]);

  if (!player || !flags) {
    showToast('Could not load profile. Try logging in again.');
    navigate('login');
    return;
  }

  // Count mutual matches (where both swiped right)
  const { data: myInterests } = await supabase
    .from('interests')
    .select('to_player_id')
    .eq('from_player_id', playerId);

  let matchCount = 0;
  if (myInterests && myInterests.length > 0) {
    const myTargets = myInterests.map(r => r.to_player_id);
    const { count } = await supabase
      .from('interests')
      .select('*', { count: 'exact', head: true })
      .eq('to_player_id', playerId)
      .in('from_player_id', myTargets);
    matchCount = count || 0;
  }

  const initial = (player.name || '?')[0].toUpperCase();

  container.innerHTML = `
    <div class="screen profile-screen">
      <div class="profile-card">
        <div class="profile-header">
          <div class="avatar avatar-lg">${initial}</div>
          <div>
            <h2>${escapeHtml(player.name)}</h2>
            <a href="https://www.torn.com/profiles.php?XID=${player.torn_player_id}" target="_blank" rel="noopener" class="profile-torn-link">View Torn Profile</a>
          </div>
        </div>
        <div class="stat-bar">
          <div class="stat-item stat-clickable" data-stat="matches">
            <span class="stat-value">${matchCount}</span>
            <span class="stat-label">MATCHES</span>
          </div>
          <div class="stat-item stat-clickable" data-stat="received">
            <span class="stat-value">${receivedCount || 0}</span>
            <span class="stat-label">INTERESTED IN YOU</span>
          </div>
          <div class="stat-item stat-clickable" data-stat="sent">
            <span class="stat-value">${sentCount || 0}</span>
            <span class="stat-label">INTERESTS SENT</span>
          </div>
        </div>
        <div class="profile-info">
          ${player.faction_name ? `<p>Faction: <a href="https://www.torn.com/factions.php?step=profile&ID=${player.faction_id}" target="_blank" rel="noopener" class="info-link">${escapeHtml(player.faction_name)}</a></p>` : '<p>No faction</p>'}
          ${player.company_name ? `<p>Company: <a href="https://www.torn.com/joblist.php#/p=corpinfo&ID=${player.company_id}" target="_blank" rel="noopener" class="info-link">${escapeHtml(player.company_name)}</a> (${escapeHtml(player.company_role || '')})</p>` : '<p>No company</p>'}
          <p>Marriage: <strong>${flags.is_single ? 'Single' : 'Married'}</strong></p>
          <p>Property: <strong>${flags.has_island ? 'Private Island' : 'Other'}</strong></p>
        </div>

        <hr />

        <h3>Opt-in Flags</h3>
        <p class="toggle-hint">Toggle what you're looking for. Other players will see you in matching categories.</p>
        <div class="toggle-group" id="toggle-group">
          ${renderToggle('seeking_marriage', 'Seeking marriage', flags.seeking_marriage, flags.is_single, '\u{1F48D}')}
          ${renderToggle('island_open', 'Island open to others', flags.island_open, flags.has_island, '\u{1F3DD}\uFE0F')}
          ${renderToggle('seeking_island', 'Seeking island housing', flags.seeking_island, !flags.has_island, '\u{1F3DD}\uFE0F')}
          ${renderToggle('company_hiring', 'Actively hiring', flags.company_hiring, flags.is_director, '\u{1F4BC}')}
          ${renderToggle('seeking_job', 'Looking for work', flags.seeking_job, !flags.is_director, '\u{1F4BC}')}
        </div>

        <hr />

        <div class="profile-actions">
          <button id="refresh-btn" class="btn btn-secondary">Refresh from Torn</button>
        </div>

        <p class="profile-verified">Last verified: ${new Date(player.last_verified).toLocaleString()}</p>
      </div>
    </div>
  `;

  // Attach toggle handlers
  const toggles = container.querySelectorAll('.toggle-row input[type="checkbox"]');
  toggles.forEach(toggle => {
    toggle.addEventListener('change', () => handleToggle(toggle, playerId));
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => handleRefresh(playerId));

  // Stat click handlers
  container.querySelectorAll('.stat-clickable').forEach(item => {
    item.addEventListener('click', () => showStatList(item.dataset.stat, playerId));
  });
}

async function showStatList(stat, playerId) {
  let title = '';
  let playerIds = [];

  if (stat === 'matches') {
    title = 'Your Matches';
    // Find mutual: I liked them AND they liked me
    const { data: sent } = await supabase
      .from('interests')
      .select('to_player_id')
      .eq('from_player_id', playerId);
    if (sent && sent.length > 0) {
      const targets = sent.map(r => r.to_player_id);
      const { data: mutual } = await supabase
        .from('interests')
        .select('from_player_id')
        .eq('to_player_id', playerId)
        .in('from_player_id', targets);
      playerIds = (mutual || []).map(r => r.from_player_id);
    }
  } else if (stat === 'received') {
    title = 'Interested in You';
    const { data } = await supabase
      .from('interests')
      .select('from_player_id')
      .eq('to_player_id', playerId);
    playerIds = (data || []).map(r => r.from_player_id);
  } else if (stat === 'sent') {
    title = 'Interests Sent';
    const { data } = await supabase
      .from('interests')
      .select('to_player_id')
      .eq('from_player_id', playerId);
    playerIds = (data || []).map(r => r.to_player_id);
  }

  // Deduplicate
  playerIds = [...new Set(playerIds)];

  if (playerIds.length === 0) {
    showToast(`No ${title.toLowerCase()} yet`);
    return;
  }

  // Fetch player names
  const { data: players } = await supabase
    .from('players')
    .select('torn_player_id, name')
    .in('torn_player_id', playerIds);

  // Show overlay
  const existing = document.querySelector('.stat-list-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'stat-list-overlay';
  overlay.innerHTML = `
    <div class="stat-list-content">
      <h3>${title}</h3>
      <ul class="stat-list">
        ${(players || []).map(p => `
          <li>
            <a href="https://www.torn.com/profiles.php?XID=${p.torn_player_id}" target="_blank" rel="noopener" class="stat-list-player">
              <span class="avatar avatar-sm">${(p.name || '?')[0].toUpperCase()}</span>
              ${escapeHtml(p.name)}
            </a>
          </li>
        `).join('')}
      </ul>
      <button class="btn btn-secondary stat-list-close">Close</button>
    </div>
  `;

  document.getElementById('app').appendChild(overlay);
  overlay.querySelector('.stat-list-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function renderToggle(field, label, value, enabled, icon) {
  if (!enabled) return '';
  return `
    <div class="toggle-row">
      <label class="toggle-label">${icon} ${label}</label>
      <input type="checkbox" id="toggle-${field}" data-field="${field}" ${value ? 'checked' : ''} />
    </div>
  `;
}

async function handleToggle(toggle, playerId) {
  const field = toggle.dataset.field;
  if (!field) return;

  const { error } = await supabase
    .from('flags')
    .update({ [field]: toggle.checked, updated_at: new Date().toISOString() })
    .eq('torn_player_id', playerId);

  if (error) {
    showToast(`Failed to update: ${error.message}`);
    toggle.checked = !toggle.checked;
  } else {
    showToast('Flag updated', 'success');
  }
}

async function handleRefresh(playerId) {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Refreshing...';

  const userData = await callTornApi({
    section: 'user',
    selections: 'basic,profile,properties',
    player_id: playerId,
  });

  if (!userData) {
    btn.disabled = false;
    btn.textContent = 'Refresh from Torn';
    return;
  }

  const isSingle = !userData.married || userData.married.spouse_id === 0;
  const hasIsland = userData.property === 'Private Island';
  const isDirector = userData.job && userData.job.job === 'Director';

  await supabase.from('players').update({
    name: userData.name,
    faction_id: userData.faction?.faction_id || null,
    faction_name: userData.faction?.faction_name || null,
    company_id: userData.job?.company_id || null,
    company_name: userData.job?.company_name || null,
    company_role: userData.job?.job || null,
    company_type: userData.job?.company_type || null,
    last_verified: new Date().toISOString(),
  }).eq('torn_player_id', playerId);

  const flagUpdate = {
    is_single: isSingle,
    has_island: hasIsland,
    is_director: isDirector,
    updated_at: new Date().toISOString(),
  };
  if (!isSingle) flagUpdate.seeking_marriage = false;
  if (!hasIsland) flagUpdate.island_open = false;
  if (hasIsland) flagUpdate.seeking_island = false;
  if (!isDirector) flagUpdate.company_hiring = false;
  if (isDirector) flagUpdate.seeking_job = false;

  await supabase.from('flags').update(flagUpdate).eq('torn_player_id', playerId);

  showToast('Profile refreshed from Torn!', 'success');
  renderProfile(document.getElementById('screen-container'));
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
