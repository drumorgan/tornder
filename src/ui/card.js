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
export function createCard(player, category) {
  const card = document.createElement('div');
  card.className = 'player-card';
  card.dataset.playerId = player.torn_player_id;

  const categoryIcon = { marriage: '\u{1F48D}', island: '\u{1F3DD}\uFE0F', company: '\u{1F4BC}' }[category];
  const detail = getCategoryDetail(player, category);
  const initial = (player.name || '?')[0].toUpperCase();
  const companyTypeName = player.company_type ? COMPANY_TYPES[player.company_type] : null;

  card.innerHTML = `
    <div class="card-header">
      <div class="avatar">${initial}</div>
      <div class="card-header-text">
        <h3 class="card-name">${escapeHtml(player.name)}</h3>
        <span class="card-category-icon">${categoryIcon}</span>
      </div>
    </div>
    <div class="card-body">
      ${player.faction_name ? `<p class="card-faction">Faction: ${escapeHtml(player.faction_name)}</p>` : ''}
      ${player.company_name ? `<p class="card-company">${escapeHtml(player.company_name)}${companyTypeName ? ` <span class="card-company-type">(${companyTypeName})</span>` : ''}${player.company_role ? ` &mdash; ${escapeHtml(player.company_role)}` : ''}</p>` : ''}
      <p class="card-detail">${detail}</p>
    </div>
    <div class="card-footer">
      <span class="card-hint">Tap to view Torn profile</span>
    </div>
  `;

  // Tap to open Torn profile
  card.addEventListener('click', (e) => {
    // Don't trigger on swipe
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

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
