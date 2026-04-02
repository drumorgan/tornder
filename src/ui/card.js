/**
 * Creates a player card DOM element for the swipe deck.
 */
export function createCard(player, category) {
  const card = document.createElement('div');
  card.className = 'player-card';
  card.dataset.playerId = player.torn_player_id;

  const categoryIcon = { marriage: '\u{1F48D}', island: '\u{1F3DD}\uFE0F', company: '\u{1F4BC}' }[category];
  const detail = getCategoryDetail(player, category);

  card.innerHTML = `
    <div class="card-header">
      <span class="card-icon">${categoryIcon}</span>
      <h3 class="card-name">${escapeHtml(player.name)}</h3>
    </div>
    <div class="card-body">
      ${player.faction_name ? `<p class="card-faction">Faction: ${escapeHtml(player.faction_name)}</p>` : ''}
      ${player.company_name ? `<p class="card-company">Company: ${escapeHtml(player.company_name)}</p>` : ''}
      <p class="card-detail">${detail}</p>
    </div>
    <div class="card-footer">
      <span class="card-hint">Tap to view Torn profile</span>
    </div>
    <div class="card-match-overlay hidden">It's a match!</div>
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
