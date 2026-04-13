import { supabase } from './supabase.js';
import { callTornApi } from './torn-api.js';
import { showToast } from './ui/toast.js';
import { getPlayerId, setPlayerId, navigate } from './main.js';
import { isInterestActive, fetchFlagsMap } from './utils/interestActive.js';

const COMPANY_TYPES = {
  1: 'Hair Salon', 2: 'Law Firm', 3: 'Flower Shop', 4: 'Car Dealership',
  5: 'Clothing Store', 6: 'Gun Shop', 7: 'Game Shop', 8: 'Candle Shop',
  9: 'Toy Shop', 10: 'Adult Novelties', 11: 'Cyber Cafe', 12: 'Grocery Store',
  13: 'Theater', 14: 'Sweet Shop', 15: 'Cruise Line', 16: 'Television Network',
  17: 'Zoo', 18: 'Firework Stand', 19: 'Property Broker', 20: 'Furniture Store',
  21: 'Gas Station', 22: 'Nightclub', 23: 'Music Store', 24: 'Pub',
  25: 'Gents Strip Club', 26: 'Restaurant', 27: 'Oil Rig', 28: 'Fitness Center',
  29: 'Mechanic Shop', 30: 'Amusement Park', 31: 'Lingerie Store',
  32: 'Meat Warehouse', 33: 'Farm', 34: 'Software Corporation',
  35: 'Ladies Strip Club', 36: 'Private Security Firm', 37: 'Mining Corporation',
  38: 'Detective Agency', 39: 'Logistics Management',
};

function companyTypeName(typeId) {
  return COMPANY_TYPES[typeId] || '';
}

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

  // Fetch player + own flags + raw interests
  const [{ data: player }, { data: flags }, { data: sentInterests }, { data: receivedInterests }] = await Promise.all([
    supabase.from('players').select('*').eq('torn_player_id', playerId).single(),
    supabase.from('flags').select('*').eq('torn_player_id', playerId).single(),
    supabase.from('interests').select('to_player_id, category').eq('from_player_id', playerId),
    supabase.from('interests').select('from_player_id, category').eq('to_player_id', playerId),
  ]);

  if (!player || !flags) {
    showToast('Could not load profile. Try logging in again.');
    navigate('login');
    return;
  }

  // An interest only counts while the sender's opt-in flag for that category
  // is still on. Toggling a flag off hides those interests; toggling on
  // restores them. Fetch every counterparty's flags in one batch.
  const counterpartyIds = [
    ...(sentInterests || []).map(r => r.to_player_id),
    ...(receivedInterests || []).map(r => r.from_player_id),
  ];
  const flagsById = await fetchFlagsMap(supabase, counterpartyIds);
  flagsById.set(Number(playerId), flags);

  const activeSent = (sentInterests || []).filter(r =>
    isInterestActive(flags, r.category)
  );
  const activeReceived = (receivedInterests || []).filter(r =>
    isInterestActive(flagsById.get(r.from_player_id), r.category)
  );
  const sentCount = activeSent.length;
  const receivedCount = activeReceived.length;

  // Mutual matches: both sides must currently be opted-in for the category.
  const reverseKey = new Set(
    activeReceived.map(r => `${r.from_player_id}-${r.category}`)
  );
  const matchCount = activeSent.filter(r =>
    reverseKey.has(`${r.to_player_id}-${r.category}`)
  ).length;

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
          ${player.level ? `<p>Level: <strong>${player.level}</strong></p>` : ''}
          ${player.age ? `<p>Days in Torn: <strong>${Number(player.age).toLocaleString()}</strong></p>` : ''}
          ${player.faction_name ? `<p>Faction: <a href="https://www.torn.com/factions.php?step=profile&ID=${player.faction_id}" target="_blank" rel="noopener" class="info-link">${escapeHtml(player.faction_name)}</a></p>` : '<p>No faction</p>'}
          ${player.company_name ? `<p>Company: <a href="https://www.torn.com/joblist.php#/p=corpinfo&ID=${player.company_id}" target="_blank" rel="noopener" class="info-link">${escapeHtml(player.company_name)}</a>${player.company_type ? ` <span class="card-company-type">(${escapeHtml(companyTypeName(player.company_type))})</span>` : ''}${player.company_stars ? ` ${'★'.repeat(player.company_stars)}${'☆'.repeat(10 - player.company_stars)}` : ''}${player.company_role ? ` &mdash; ${escapeHtml(player.company_role)}` : ''}</p>` : '<p>No company</p>'}
          <p>Marriage: <strong>${flags.is_single ? 'Single' : 'Married'}</strong></p>
          <p>Property: <strong>${flags.has_island ? 'Private Island' : 'Other'}</strong></p>
          ${player.last_action ? `<p>Last Active: <strong>${timeAgo(player.last_action)}</strong></p>` : ''}
        </div>

        ${player.manual_labor || player.intelligence || player.endurance ? `
        <hr />
        <h3>Working Stats</h3>
        <div class="workstats-bar">
          <div class="workstat-item">
            <span class="workstat-value">${Number(player.manual_labor || 0).toLocaleString()}</span>
            <span class="workstat-label">Manual Labor</span>
          </div>
          <div class="workstat-item">
            <span class="workstat-value">${Number(player.intelligence || 0).toLocaleString()}</span>
            <span class="workstat-label">Intelligence</span>
          </div>
          <div class="workstat-item">
            <span class="workstat-value">${Number(player.endurance || 0).toLocaleString()}</span>
            <span class="workstat-label">Endurance</span>
          </div>
        </div>
        ` : ''}

        <hr />

        <h3>Opt-in Flags</h3>
        <p class="toggle-hint">Toggle what you're looking for. Other players will see you in matching categories.</p>
        <div class="toggle-group" id="toggle-group">
          ${renderToggle('seeking_marriage', 'Seeking marriage', flags.seeking_marriage, flags.is_single, '\u{1F48D}')}
          ${renderToggle('island_open', 'Island open to others', flags.island_open, flags.has_island, '\u{1F3DD}\uFE0F')}
          ${renderToggle('seeking_island', 'Seeking island housing', flags.seeking_island, !flags.has_island, '\u{1F3DD}\uFE0F')}
          ${renderToggle('company_hiring', 'Actively hiring', flags.company_hiring, flags.is_director, '\u{1F4BC}')}
          ${renderToggle('seeking_job', 'Looking for work', flags.seeking_job, !flags.is_director, '\u{1F4BC}')}
          ${renderToggle('train_selling', 'Selling training', flags.train_selling, flags.is_director, '\u{1F3CB}\uFE0F')}
          ${renderToggle('train_buying', 'Looking to buy training', flags.train_buying, true, '\u{1F3CB}\uFE0F')}
        </div>

        ${!flags.is_director ? `
        <div id="company-type-filter" class="${flags.seeking_job ? '' : 'hidden'}">
          <hr />
          <h3>Company Types You Want</h3>
          <p class="toggle-hint">Select which company types you'd like to work at. Only matching directors will appear in your feed.</p>
          <div class="company-type-controls">
            <button id="check-all-types" class="btn btn-sm btn-secondary">Check All</button>
            <button id="uncheck-all-types" class="btn btn-sm btn-secondary">Uncheck All</button>
          </div>
          <div class="company-type-grid" id="company-type-grid">
            ${Object.entries(COMPANY_TYPES).map(([id, name]) => `
              <label class="company-type-item">
                <input type="checkbox" data-type-id="${id}" ${(flags.preferred_company_types || []).includes(Number(id)) ? 'checked' : ''} />
                <span>${escapeHtml(name)}</span>
              </label>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <hr />

        <div class="profile-actions">
          <button id="refresh-btn" class="btn btn-secondary">Refresh from Torn</button>
        </div>

        <p class="profile-verified">Last verified: ${new Date(player.last_verified).toLocaleString()}</p>

        <hr />
        <div class="profile-danger-zone">
          <button id="delete-data-btn" class="btn btn-danger">Delete All My Data</button>
          <p class="danger-hint">Permanently removes your profile, flags, interests, and API key from our database.</p>
        </div>
      </div>
    </div>
  `;

  // Attach toggle handlers
  const toggles = container.querySelectorAll('.toggle-row input[type="checkbox"]');
  toggles.forEach(toggle => {
    toggle.addEventListener('change', () => {
      handleToggle(toggle, playerId);
      // Show/hide company type filter when seeking_job is toggled
      if (toggle.dataset.field === 'seeking_job') {
        const filterDiv = document.getElementById('company-type-filter');
        if (filterDiv) filterDiv.classList.toggle('hidden', !toggle.checked);
      }
    });
  });

  // Company type filter handlers
  const typeGrid = document.getElementById('company-type-grid');
  if (typeGrid) {
    typeGrid.addEventListener('change', () => saveCompanyTypePrefs(playerId));

    document.getElementById('check-all-types').addEventListener('click', () => {
      typeGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
      saveCompanyTypePrefs(playerId);
    });

    document.getElementById('uncheck-all-types').addEventListener('click', () => {
      typeGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      saveCompanyTypePrefs(playerId);
    });
  }

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => handleRefresh(playerId));

  // Delete data button
  document.getElementById('delete-data-btn').addEventListener('click', () => handleDeleteData(playerId));

  // Stat click handlers
  container.querySelectorAll('.stat-clickable').forEach(item => {
    item.addEventListener('click', () => showStatList(item.dataset.stat, playerId));
  });
}

async function showStatList(stat, playerId) {
  if (stat === 'received') {
    return showReceivedDeck(playerId);
  }

  let title = '';
  let playerIds = [];

  // Fetch my current flags once — interests I've "sent" only count as active
  // if my current opt-in flag for their category is still on.
  const { data: myFlags } = await supabase
    .from('flags')
    .select('seeking_marriage, island_open, seeking_island, company_hiring, seeking_job, train_selling, train_buying')
    .eq('torn_player_id', playerId)
    .single();

  if (stat === 'matches') {
    title = 'Your Matches';
    const { data: sent } = await supabase
      .from('interests')
      .select('to_player_id, category')
      .eq('from_player_id', playerId);
    const activeSent = (sent || []).filter(r => isInterestActive(myFlags, r.category));
    if (activeSent.length > 0) {
      const targets = activeSent.map(r => r.to_player_id);
      const { data: mutual } = await supabase
        .from('interests')
        .select('from_player_id, category')
        .eq('to_player_id', playerId)
        .in('from_player_id', targets);
      // Only count mutuals where the other side is still opted-in AND I still
      // have my matching-direction interest active for that category.
      const mutualFlags = await fetchFlagsMap(supabase, (mutual || []).map(r => r.from_player_id));
      const sentKey = new Set(activeSent.map(r => `${r.to_player_id}-${r.category}`));
      playerIds = (mutual || [])
        .filter(r =>
          isInterestActive(mutualFlags.get(r.from_player_id), r.category) &&
          sentKey.has(`${r.from_player_id}-${r.category}`)
        )
        .map(r => r.from_player_id);
    }
  } else if (stat === 'sent') {
    title = 'Interests Sent';
    const { data } = await supabase
      .from('interests')
      .select('to_player_id, category')
      .eq('from_player_id', playerId);
    playerIds = (data || [])
      .filter(r => isInterestActive(myFlags, r.category))
      .map(r => r.to_player_id);
  }

  playerIds = [...new Set(playerIds)];

  if (playerIds.length === 0) {
    showToast(`No ${title.toLowerCase()} yet`);
    return;
  }

  const { data: players } = await supabase
    .from('players')
    .select('torn_player_id, name, level')
    .in('torn_player_id', playerIds);

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
              <span>${escapeHtml(p.name)}${p.level ? ` <span class="card-company-type">(Lvl ${p.level})</span>` : ''}</span>
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

async function showReceivedDeck(playerId) {
  // Fetch who expressed interest in me
  const { data: received } = await supabase
    .from('interests')
    .select('from_player_id, category')
    .eq('to_player_id', playerId);

  if (!received || received.length === 0) {
    showToast('No one interested yet');
    return;
  }

  // Keep only interests whose sender currently has the relevant opt-in flag
  // on. If someone toggled off (e.g. "Looking for work" after finding a job),
  // their interest is hidden here until they toggle it back on.
  const senderFlags = await fetchFlagsMap(supabase, received.map(r => r.from_player_id));
  const activeReceived = received.filter(r =>
    isInterestActive(senderFlags.get(r.from_player_id), r.category)
  );

  if (activeReceived.length === 0) {
    showToast('No one currently looking — they may have toggled off');
    return;
  }

  const receivedIds = [...new Set(activeReceived.map(r => r.from_player_id))];

  // Filter out players I've already acted on (in interests or dismissed)
  const [{ data: myInterests }, { data: myDismissed }] = await Promise.all([
    supabase.from('interests').select('to_player_id').eq('from_player_id', playerId),
    supabase.from('dismissed').select('to_player_id').eq('from_player_id', playerId),
  ]);

  const actedOn = new Set([
    ...(myInterests || []).map(r => r.to_player_id),
    ...(myDismissed || []).map(r => r.to_player_id),
  ]);

  const unseenIds = receivedIds.filter(id => !actedOn.has(id));

  if (unseenIds.length === 0) {
    showToast('You\'ve responded to everyone! Check your matches.');
    return;
  }

  // Fetch full player data + flags for the unseen
  const { data: players } = await supabase
    .from('players')
    .select(`
      torn_player_id, name, faction_id, faction_name,
      company_id, company_name, company_role, company_type, company_stars,
      level, age, last_action, manual_labor, intelligence, endurance,
      flags (
        is_single, seeking_marriage,
        has_island, island_open, seeking_island,
        is_director, company_hiring, seeking_job,
        train_selling, train_buying
      )
    `)
    .in('torn_player_id', unseenIds);

  const feed = (players || []).map(p => ({
    ...p,
    ...(Array.isArray(p.flags) ? p.flags[0] : p.flags),
    flags: undefined,
  }));

  if (feed.length === 0) {
    showToast('No new admirers to review');
    return;
  }

  // Build the category map — what category did they express interest in?
  const categoryMap = {};
  for (const r of activeReceived) {
    if (!categoryMap[r.from_player_id]) categoryMap[r.from_player_id] = r.category;
  }

  // Show overlay with swipe deck
  const existing = document.querySelector('.stat-list-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'stat-list-overlay';
  overlay.innerHTML = `
    <div class="stat-deck-content">
      <div class="stat-deck-header">
        <h3>Interested in You</h3>
        <span class="stat-deck-count">${feed.length} to review</span>
      </div>
      <div class="stat-deck-container"></div>
      <div class="swipe-buttons">
        <button class="btn btn-dismiss stat-deck-dismiss">\u2717</button>
        <button class="btn btn-interest stat-deck-interest">\u2713</button>
      </div>
      <button class="btn btn-secondary stat-deck-close">Close</button>
    </div>
  `;

  document.getElementById('app').appendChild(overlay);

  let currentIndex = 0;

  function showNext() {
    const container = overlay.querySelector('.stat-deck-container');
    const countEl = overlay.querySelector('.stat-deck-count');

    if (currentIndex >= feed.length) {
      container.innerHTML = '<div class="deck-empty"><p>All done! Check your matches.</p></div>';
      overlay.querySelector('.swipe-buttons').classList.add('hidden');
      countEl.textContent = 'Done';
      return;
    }

    const player = feed[currentIndex];
    const category = categoryMap[player.torn_player_id] || 'marriage';
    container.innerHTML = '';

    const { createCard } = window.__tornderCard;
    const card = createCard(player, category);
    container.appendChild(card);
    countEl.textContent = `${feed.length - currentIndex} to review`;

    const { enableSwipe } = window.__tornderSwipe;
    enableSwipe(card, {
      onSwipe: (direction) => handleDeckSwipe(direction, player, category),
    });
  }

  async function handleDeckSwipe(direction, player, category) {
    currentIndex++;
    if (direction === 'right') {
      const { error } = await supabase
        .from('interests')
        .insert({ from_player_id: Number(playerId), to_player_id: player.torn_player_id, category });
      if (error && !error.message.includes('duplicate')) {
        showToast(`Error: ${error.message}`);
      }
      // Check for match
      const { data: mutual } = await supabase
        .from('interests')
        .select('id')
        .eq('from_player_id', player.torn_player_id)
        .eq('to_player_id', Number(playerId))
        .eq('category', category)
        .single();
      if (mutual) {
        showToast(`It's a match with ${player.name}!`, 'success');
      }
    } else {
      await supabase
        .from('dismissed')
        .insert({ from_player_id: Number(playerId), to_player_id: player.torn_player_id, category });
    }
    showNext();
  }

  // Button handlers
  overlay.querySelector('.stat-deck-dismiss').addEventListener('click', () => {
    const card = overlay.querySelector('.player-card');
    if (!card || currentIndex >= feed.length) return;
    const player = feed[currentIndex];
    const category = categoryMap[player.torn_player_id] || 'marriage';
    card.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
    card.style.transform = `translateX(-${window.innerWidth}px) rotate(-15deg)`;
    card.style.opacity = '0';
    setTimeout(() => handleDeckSwipe('left', player, category), 300);
  });

  overlay.querySelector('.stat-deck-interest').addEventListener('click', () => {
    const card = overlay.querySelector('.player-card');
    if (!card || currentIndex >= feed.length) return;
    const player = feed[currentIndex];
    const category = categoryMap[player.torn_player_id] || 'marriage';
    card.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
    card.style.transform = `translateX(${window.innerWidth}px) rotate(15deg)`;
    card.style.opacity = '0';
    setTimeout(() => handleDeckSwipe('right', player, category), 300);
  });

  overlay.querySelector('.stat-deck-close').addEventListener('click', () => {
    overlay.remove();
    renderProfile(document.getElementById('screen-container'));
  });

  showNext();
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

async function saveCompanyTypePrefs(playerId) {
  const grid = document.getElementById('company-type-grid');
  if (!grid) return;
  const checked = [...grid.querySelectorAll('input[type="checkbox"]:checked')].map(cb => Number(cb.dataset.typeId));
  const { error } = await supabase
    .from('flags')
    .update({ preferred_company_types: checked, updated_at: new Date().toISOString() })
    .eq('torn_player_id', playerId);
  if (error) {
    showToast(`Failed to save preferences: ${error.message}`);
  } else {
    showToast('Company type preferences saved', 'success');
  }
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
    selections: 'basic,profile,properties,workstats',
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

  // Fetch company stars if player has a company
  let companyStars = null;
  if (userData.job?.company_id) {
    const companyData = await callTornApi({
      section: 'company',
      id: userData.job.company_id,
      selections: 'profile',
      player_id: playerId,
    });
    if (companyData?.company?.rating) {
      companyStars = companyData.company.rating;
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
    last_action: userData.last_action?.timestamp ? new Date(userData.last_action.timestamp * 1000).toISOString() : null,
    manual_labor: userData.manual_labor || null,
    intelligence: userData.intelligence || null,
    endurance: userData.endurance || null,
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
  if (!isDirector) flagUpdate.train_selling = false;
  if (isDirector) flagUpdate.seeking_job = false;

  await supabase.from('flags').update(flagUpdate).eq('torn_player_id', playerId);

  showToast('Profile refreshed from Torn!', 'success');
  renderProfile(document.getElementById('screen-container'));
}

async function handleDeleteData(playerId) {
  const confirmed = confirm(
    'Are you sure you want to permanently delete ALL your data from Tornder?\n\n' +
    'This will remove your profile, flags, interests, matches, and stored API key. This cannot be undone.'
  );
  if (!confirmed) return;

  const doubleConfirmed = confirm('This is irreversible. Are you absolutely sure?');
  if (!doubleConfirmed) return;

  const btn = document.getElementById('delete-data-btn');
  btn.disabled = true;
  btn.textContent = 'Deleting...';

  // Delete in order: interests/dismissed (reference players), then flags cascades with player
  const { error: intFromErr } = await supabase
    .from('interests')
    .delete()
    .or(`from_player_id.eq.${playerId},to_player_id.eq.${playerId}`);

  const { error: disFromErr } = await supabase
    .from('dismissed')
    .delete()
    .or(`from_player_id.eq.${playerId},to_player_id.eq.${playerId}`);

  // Delete player row (flags cascade automatically)
  const { error: playerErr } = await supabase
    .from('players')
    .delete()
    .eq('torn_player_id', playerId);

  if (intFromErr || disFromErr || playerErr) {
    const msg = (intFromErr || disFromErr || playerErr).message;
    showToast(`Error deleting data: ${msg}`);
    btn.disabled = false;
    btn.textContent = 'Delete All My Data';
    return;
  }

  // Clear local session
  setPlayerId(null);
  showToast('All your data has been permanently deleted.', 'info');
  navigate('login');
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
