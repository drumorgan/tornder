const COMPANY_TYPES = {
  1: 'Hair Salon', 2: 'Law Firm', 3: 'Flower Shop', 4: 'Car Dealership',
  5: 'Clothing Store', 6: 'Gun Shop', 7: 'Game Shop', 8: 'Candle Shop',
  9: 'Toy Shop', 10: 'Adult Novelties', 11: 'Cyber Cafe', 12: 'Grocery Store',
  13: 'Theater', 14: 'Sweet Shop', 15: 'Cruise Line', 16: 'Television Network',
  17: 'Zoo', 18: 'Firework Stand', 19: 'Property Broker', 20: 'Furniture Store',
  21: 'Gas Station', 22: 'Music Store', 23: 'Nightclub', 24: 'Pub',
  25: 'Gents Strip Club', 26: 'Restaurant', 27: 'Oil Rig', 28: 'Fitness Center',
  29: 'Mechanic Shop', 30: 'Amusement Park', 31: 'Lingerie Store',
  32: 'Meat Warehouse', 33: 'Farm', 34: 'Software Corporation',
  35: 'Ladies Strip Club', 36: 'Private Security Firm', 37: 'Mining Corporation',
  38: 'Detective Agency', 39: 'Logistics Management',
};

/**
 * Creates a player card DOM element for the swipe deck.
 */
// Expose for reuse in overlays
window.__tornderCard = { createCard };

export function createCard(player, category) {
  const card = document.createElement('div');
  card.className = 'player-card';
  card.dataset.playerId = player.torn_player_id;

  const categoryIcon = { marriage: '\u{1F48D}', island: '\u{1F3DD}\uFE0F', company: '\u{1F4BC}' }[category];
  const categoryColor = { marriage: '#e94560', island: '#0ea5e9', company: '#f59e0b' }[category] || 'var(--accent)';
  const detail = getCategoryDetail(player, category);
  const companyTypeName = player.company_type ? COMPANY_TYPES[player.company_type] : null;

  card.innerHTML = `
    <div class="card-header">
      <div class="avatar" style="background:${categoryColor};font-size:1.4rem">${categoryIcon}</div>
      <div class="card-header-text">
        <h3 class="card-name">${escapeHtml(player.name)}</h3>
      </div>
    </div>
    <div class="card-body">
      ${player.level ? `<p class="card-level">Level ${player.level}${player.age ? ` &middot; ${Number(player.age).toLocaleString()} days` : ''}</p>` : ''}
      ${player.faction_name ? `<p class="card-faction">Faction: <a href="https://www.torn.com/factions.php?step=profile&ID=${player.faction_id}" target="_blank" rel="noopener" class="info-link">${escapeHtml(player.faction_name)}</a></p>` : ''}
      ${player.company_name ? `<p class="card-company"><a href="https://www.torn.com/joblist.php#/p=corpinfo&ID=${player.company_id}" target="_blank" rel="noopener" class="info-link">${escapeHtml(player.company_name)}</a>${companyTypeName ? ` <span class="card-company-type">(${companyTypeName})</span>` : ''}${player.company_role ? ` &mdash; ${escapeHtml(player.company_role)}` : ''}</p>` : ''}
      ${player.manual_labor || player.intelligence || player.endurance ? `
      <div class="card-workstats">
        <span>Man: ${Number(player.manual_labor || 0).toLocaleString()}</span>
        <span>Int: ${Number(player.intelligence || 0).toLocaleString()}</span>
        <span>End: ${Number(player.endurance || 0).toLocaleString()}</span>
      </div>` : ''}
      <p class="card-detail">${detail}</p>
    </div>
    <div class="card-footer">
      ${player.last_action ? `<span class="card-last-active">Active ${cardTimeAgo(player.last_action)}</span>` : ''}
      <span class="card-hint">Tap to view Torn profile</span>
    </div>
  `;

  // Tap to open Torn profile (but not when tapping a link)
  card.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    if (card.style.transform && card.style.transform !== 'none') return;
    window.open(`https://www.torn.com/profiles.php?XID=${player.torn_player_id}`, '_blank');
  });

  return card;
}

function getCategoryDetail(player, category) {
  switch (category) {
    case 'marriage':
      return player.seeking_marriage ? 'Looking for marriage' : '';
    case 'island':
      if (player.island_open) return 'Has island \u2014 open to sharing';
      if (player.seeking_island) return 'Looking for island housing';
      return '';
    case 'company':
      if (player.company_hiring) return `Hiring at ${escapeHtml(player.company_name || 'their company')}`;
      if (player.seeking_job) return 'Looking for work';
      return '';
    default:
      return '';
  }
}

function cardTimeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
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
