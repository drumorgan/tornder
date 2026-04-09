import { supabase, supabaseUrl, supabaseAnonKey } from './supabase.js';
import { showToast } from './ui/toast.js';
import { createCard } from './ui/card.js';
import { enableSwipe } from './ui/swipe.js';
import { getPlayerId, navigate } from './main.js';

const CATEGORIES = ['marriage', 'island', 'company', 'train'];

function getOptInHint(category) {
  if (!viewerFlags) return '';
  switch (category) {
    case 'marriage':
      if (!viewerFlags.is_single)
        return "You're married! No cheating on your spouse... divorce first, then come back. 💍";
      return 'Enable "Seeking marriage" on your profile to browse.';
    case 'island':
      return 'Enable "Island open to others" or "Seeking island housing" on your profile to browse.';
    case 'company':
      return 'Enable "Actively hiring" or "Looking for work" on your profile to browse.';
    case 'train':
      return 'Enable "Selling training" or "Looking to buy training" on your profile to browse.';
    default:
      return '';
  }
}

let viewerFlags = null;
const CATEGORY_LABELS = {
  marriage: '\u{1F48D} Marriage',
  island: '\u{1F3DD}\uFE0F Island',
  company: '\u{1F4BC} Company',
  train: '\u{1F3CB}\uFE0F Training',
};

let currentCategory = 'marriage';
let feedCache = {};

export async function renderBrowse(container) {
  const playerId = getPlayerId();
  if (!playerId) {
    navigate('login');
    return;
  }

  feedCache = {};

  // Fetch viewer flags for opt-in hints
  const { data: flags } = await supabase
    .from('flags')
    .select('is_single, seeking_marriage, island_open, seeking_island, company_hiring, seeking_job, train_selling, train_buying')
    .eq('torn_player_id', playerId)
    .single();
  viewerFlags = flags;

  container.innerHTML = `
    <div class="screen browse-screen">
      <div class="category-tabs">
        ${CATEGORIES.map(cat => `
          <button class="tab-btn ${cat === currentCategory ? 'active' : ''}" data-category="${cat}">
            ${CATEGORY_LABELS[cat]}
          </button>
        `).join('')}
      </div>
      <div id="deck-container" class="deck-container">
        <div class="deck-loading">Loading...</div>
      </div>
      <div id="swipe-buttons" class="swipe-buttons hidden">
        <button id="btn-dismiss" class="btn btn-dismiss">\u2717</button>
        <button id="btn-interest" class="btn btn-interest">\u2713</button>
      </div>
    </div>
  `;

  // Tab switching
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.category;
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadDeck(playerId);
    });
  });

  // Button swipe handlers
  document.getElementById('btn-dismiss').addEventListener('click', () => {
    handleSwipeAction('left', playerId);
  });
  document.getElementById('btn-interest').addEventListener('click', () => {
    handleSwipeAction('right', playerId);
  });

  await loadDeck(playerId);
}

async function loadDeck(playerId) {
  const deckContainer = document.getElementById('deck-container');
  const buttons = document.getElementById('swipe-buttons');
  deckContainer.innerHTML = '<div class="deck-loading">Loading...</div>';
  buttons.classList.add('hidden');

  const feed = await fetchFeed(playerId, currentCategory);
  feedCache[currentCategory] = feed;

  if (!feed || feed.length === 0) {
    const optedIn = isOptedIn(currentCategory);
    deckContainer.innerHTML = `
      <div class="deck-empty">
        ${optedIn
          ? `<p>You've reached the end of the list for ${currentCategory}!</p>
             <p class="deck-share">Share <a href="https://tornder.girovagabondo.com" target="_blank"><strong>tornder.girovagabondo.com</strong></a> with your faction and friends to grow the community!</p>`
          : `<p>${getOptInHint(currentCategory)}</p>`
        }
      </div>
    `;
    return;
  }

  showCurrentCard(playerId);
}

function isOptedIn(category) {
  if (!viewerFlags) return true;
  switch (category) {
    case 'marriage': return viewerFlags.seeking_marriage;
    case 'island': return viewerFlags.island_open || viewerFlags.seeking_island;
    case 'company': return viewerFlags.company_hiring || viewerFlags.seeking_job;
    case 'train': return viewerFlags.train_selling || viewerFlags.train_buying;
    default: return true;
  }
}

function showCurrentCard(playerId) {
  const deckContainer = document.getElementById('deck-container');
  const buttons = document.getElementById('swipe-buttons');
  const feed = feedCache[currentCategory];

  if (!feed || feed.length === 0) {
    deckContainer.innerHTML = `
      <div class="deck-empty">
        <p>You've seen everyone! Check back later.</p>
        <p class="deck-share">Share <a href="https://tornder.girovagabondo.com" target="_blank"><strong>tornder.girovagabondo.com</strong></a> to get more people swiping!</p>
      </div>
    `;
    buttons.classList.add('hidden');
    return;
  }

  const player = feed[0];
  deckContainer.innerHTML = '';

  const card = createCard(player, currentCategory);
  deckContainer.appendChild(card);
  buttons.classList.remove('hidden');

  enableSwipe(card, {
    onSwipe: (direction) => handleSwipe(direction, player, playerId),
  });
}

async function handleSwipe(direction, player, playerId) {
  const feed = feedCache[currentCategory];
  if (feed) feed.shift();

  if (direction === 'right') {
    await recordInterest(playerId, player.torn_player_id, currentCategory, player);
  } else {
    await recordDismiss(playerId, player.torn_player_id, currentCategory);
  }

  showCurrentCard(playerId);
}

function handleSwipeAction(direction, playerId) {
  const feed = feedCache[currentCategory];
  if (!feed || feed.length === 0) return;

  const card = document.querySelector('.player-card');
  if (!card) return;

  const flyX = direction === 'right' ? window.innerWidth : -window.innerWidth;
  card.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
  card.style.transform = `translateX(${flyX}px) rotate(${direction === 'right' ? 15 : -15}deg)`;
  card.style.opacity = '0';

  setTimeout(() => {
    handleSwipe(direction, feed[0], playerId);
  }, 300);
}

async function fetchFeed(viewerId, category) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/get-feed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ viewer_id: Number(viewerId), category }),
    });

    if (!res.ok) {
      showToast(`Feed error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (data.error) {
      showToast(`Feed error: ${data.error}`);
      return [];
    }

    return data;
  } catch (err) {
    showToast(`Failed to load feed: ${err.message}`);
    return [];
  }
}

async function recordInterest(fromId, toId, category, player) {
  const { error } = await supabase
    .from('interests')
    .insert({ from_player_id: fromId, to_player_id: toId, category });

  if (error && !error.message.includes('duplicate')) {
    showToast(`Failed to record interest: ${error.message}`);
    return;
  }

  // Check for mutual match
  const { data: mutual } = await supabase
    .from('interests')
    .select('id')
    .eq('from_player_id', toId)
    .eq('to_player_id', fromId)
    .eq('category', category)
    .single();

  if (mutual) {
    showMatchOverlay(player);
  }
}

async function recordDismiss(fromId, toId, category) {
  const { error } = await supabase
    .from('dismissed')
    .insert({ from_player_id: fromId, to_player_id: toId, category });

  if (error && !error.message.includes('duplicate')) {
    showToast(`Failed to dismiss: ${error.message}`);
  }
}

function showMatchOverlay(player) {
  const existing = document.querySelector('.match-popup');
  if (existing) existing.remove();

  const name = player.name || 'Someone';
  const profileUrl = `https://www.torn.com/profiles.php?XID=${player.torn_player_id}`;

  const overlay = document.createElement('div');
  overlay.className = 'match-popup';
  overlay.innerHTML = `
    <div class="match-popup-content">
      <h2>It's a match!</h2>
      <p>You and <strong>${escapeHtml(name)}</strong> both expressed interest!</p>
      <a href="${profileUrl}" target="_blank" rel="noopener" class="btn btn-primary match-profile-btn">View ${escapeHtml(name)}'s Torn Profile</a>
      <button class="btn btn-secondary match-dismiss-btn">Keep swiping</button>
    </div>
  `;

  document.getElementById('app').appendChild(overlay);

  overlay.querySelector('.match-dismiss-btn').addEventListener('click', () => {
    overlay.remove();
  });

  setTimeout(() => {
    if (overlay.parentNode) overlay.remove();
  }, 10000);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
