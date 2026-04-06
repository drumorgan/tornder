import { showToast } from './ui/toast.js';
import { renderLogin } from './auth.js';
import { renderProfile } from './profile.js';
import { renderBrowse } from './browse.js';
import { supabase, supabaseUrl, supabaseAnonKey } from './supabase.js';

const container = document.getElementById('screen-container');
const nav = document.getElementById('main-nav');
const navButtons = nav.querySelectorAll('[data-screen]');

let currentScreen = null;

export function getPlayerId() {
  return localStorage.getItem('tornder_player_id');
}

export function setPlayerId(id) {
  if (id) localStorage.setItem('tornder_player_id', String(id));
  else localStorage.removeItem('tornder_player_id');
}

export function navigate(screen) {
  container.innerHTML = '';
  currentScreen = screen;

  navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === screen);
  });

  switch (screen) {
    case 'login':
      nav.classList.add('hidden');
      renderLogin(container);
      break;
    case 'profile':
      nav.classList.remove('hidden');
      renderProfile(container);
      break;
    case 'browse':
      nav.classList.remove('hidden');
      renderBrowse(container);
      break;
    default:
      navigate('login');
  }
}

// Nav click handlers
navButtons.forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.screen));
});

document.getElementById('logout-btn').addEventListener('click', () => {
  setPlayerId(null);
  showToast('Logged out', 'info');
  navigate('login');
});

// Boot: try auto-login if we have a stored player_id
async function boot() {
  const existingId = getPlayerId();
  if (!existingId) {
    navigate('login');
    return;
  }

  container.innerHTML = '<div class="screen"><div class="deck-loading">Signing in...</div></div>';

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/auto-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ player_id: Number(existingId) }),
    });

    const data = await res.json();

    if (data.success) {
      showToast(`Welcome back, ${data.name}!`, 'success');
      navigate('profile');
    } else {
      setPlayerId(null);
      if (data.error === 'key_invalid') {
        showToast('Your API key expired or was revoked. Please log in again.');
      }
      navigate('login');
    }
  } catch (err) {
    showToast(`Connection error: ${err.message}`);
    navigate('login');
  }
}

boot();

// Update total user count in header
async function updateUserCount() {
  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true });
  const el = document.getElementById('user-count');
  if (el && count !== null) {
    el.textContent = `${count} Torn Citizen${count !== 1 ? 's' : ''} and counting`;
  }
}

// Update love connections count in header
async function updateLoveConnections() {
  const { data: allInterests } = await supabase
    .from('interests')
    .select('from_player_id, to_player_id, category');

  let matchCount = 0;
  if (allInterests) {
    // Build a set of all interest keys for O(1) lookup
    const interestKeys = new Set(
      allInterests.map(i => `${i.from_player_id}-${i.to_player_id}-${i.category}`)
    );
    // Count pairs where the reverse also exists (count each pair once)
    const counted = new Set();
    for (const i of allInterests) {
      const pairKey = [Math.min(i.from_player_id, i.to_player_id), Math.max(i.from_player_id, i.to_player_id), i.category].join('-');
      if (!counted.has(pairKey) && interestKeys.has(`${i.to_player_id}-${i.from_player_id}-${i.category}`)) {
        matchCount++;
        counted.add(pairKey);
      }
    }
  }

  const el = document.getElementById('love-connections');
  if (el) {
    el.textContent = `\u{1F495} ${matchCount} Love Connection${matchCount !== 1 ? 's' : ''} made`;
  }
}

updateUserCount();
updateLoveConnections();

export { updateUserCount, updateLoveConnections };
