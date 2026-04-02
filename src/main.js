import { showToast } from './ui/toast.js';
import { renderLogin } from './auth.js';
import { renderProfile } from './profile.js';
import { renderBrowse } from './browse.js';

const container = document.getElementById('screen-container');
const nav = document.getElementById('main-nav');
const navButtons = nav.querySelectorAll('[data-screen]');

let currentScreen = null;

// Session state (in-memory only, never persisted)
let apiKey = null;

export function getApiKey() {
  return apiKey;
}

export function setApiKey(key) {
  apiKey = key;
}

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

  // Update nav active state
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
  apiKey = null;
  setPlayerId(null);
  showToast('Logged out', 'info');
  navigate('login');
});

// Boot: check for existing session
const existingId = getPlayerId();
if (existingId) {
  // Player was logged in before, but we need a fresh API key
  // Show login with a message
  navigate('login');
} else {
  navigate('login');
}
