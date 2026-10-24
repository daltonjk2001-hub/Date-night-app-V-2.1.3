'use strict';

/* Date Night Decider — repaired app logic.
   Requirements: Dexie.js must be loaded by index.html. P2P rooms also need PeerJS
   and an available signaling service. Store unlocks in this web build are demos. */

if (typeof Dexie === 'undefined') {
  document.body.insertAdjacentHTML('afterbegin', '<div style="padding:12px;background:#5b1730;color:white;font:16px sans-serif">Date Night Decider could not load its database library. Check your internet connection and reload.</div>');
  throw new Error('Dexie.js failed to load.');
}

const db = new Dexie('DateNightDatabase');
db.version(1).stores({
  settings: 'key',
  customDeck: '++id, id',
  deletedBuiltins: 'id',
  categories: 'id',
  history: '++id, date',
  unlocks: 'id'
});

const DEFAULT_CATEGORIES = ['baking', 'cooking', 'gaming', 'board games', 'tv', 'movie'];
let customDeck = [];
let deletedBuiltins = new Set();
let unlockedItems = [];
let dateHistory = [];
let appSettings = { theme: 'dark', feedback: 'both' };
let fullDeck = [];
let activeDeck = [];
let selectedPreviewItemId = null;
let selectedCategories = [...DEFAULT_CATEGORIES];

/* Native haptics and synthesized sound */
function triggerHaptic(type = 'light') {
  if (!['both', 'vibration'].includes(appSettings.feedback)) return;
  if (!('vibrate' in navigator)) return;
  try {
    if (type === 'light') navigator.vibrate(15);
    else if (type === 'success') navigator.vibrate([40, 60, 40]);
    else if (type === 'heavy') navigator.vibrate(50);
  } catch (_) { /* Haptics are optional and browser-dependent. */ }
}

const audioCtx = (() => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    return AudioContextClass ? new AudioContextClass() : null;
  } catch (_) { return null; }
})();

function playSound(type) {
  if (!['both', 'sound'].includes(appSettings.feedback) || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'swipe') {
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'ban') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
      osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'win') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.1);
      osc.frequency.setValueAtTime(783, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
      osc.start(now); osc.stop(now + 0.35);
    }
  } catch (err) { console.debug('Sound unavailable:', err); }
}

/* Helper used wherever imported/custom text is placed into markup. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

/* Master deck */
const masterDeck = [
  { id:'baking-01', title:'Apple-Blackberry Lattice Pie', detail:'Make an all-butter pie dough from scratch, roll out a woven lattice top, and fill with fresh apple and blackberry.', category:'baking', budget:'paid', location:'home', image:"url('./joe-dumas-89zuNmg6w0Y-unsplash.jpg')" },
  { id:'baking-02', title:'Cream Cheese Danish Batch', detail:'Make laminated pastry dough from scratch, fill with sweet cream cheese and fruit preserves, and bake until golden.', category:'baking', budget:'paid', location:'home', image:"url('./masha-uu-cPgsmkZcgdU-unsplash.jpg')" },
  { id:'cooking-01', title:'Homemade Gourmet Pizza Night', detail:'Stretch homemade dough from scratch, layer with custom sauces, premium cheese, and your favorite toppings.', category:'cooking', budget:'paid', location:'home', image:"url('./chad-montano-MqT0asuoIcU-unsplash.jpg')" },
  { id:'cooking-02', title:'Authentic Street Taco Bar', detail:'Prep slow-cooked carnitas or grilled chicken with homemade salsas, fresh cilantro, and warm corn tortillas.', category:'cooking', budget:'paid', location:'home', image:"url('./jeswin-thomas-z_PfaGzeN9E-unsplash.jpg')" },
  { id:'gaming-01', title:'Cozy Split-Screen Co-Op', detail:'Load up a relaxing couch co-op video game and work together to build a shared virtual world or solve puzzles.', category:'gaming', budget:'free', location:'home', image:"url('./jeshoots-com-eCktzGjC-iU-unsplash.jpg')" },
  { id:'gaming-02', title:'Arcade High Score Showdown', detail:'Play classic arcade games or fast-paced party games and battle head-to-head for the top spot.', category:'gaming', budget:'paid', location:'out', image:"url('./carl-raw-zvBT4eOtlkY-unsplash.jpg')" },
  { id:'board-01', title:'Intense Strategy Board Game', detail:'Brew some coffee or tea, clear the table, and dive into a deep tabletop strategy or card drafting game.', category:'board games', budget:'free', location:'home', image:"url('./karthik-balakrishnan-NrS53eUKgiE-unsplash.jpg')" },
  { id:'board-02', title:'Fast-Paced Party Card Game', detail:'Pull out a hilarious casual card game for quick laughs and lighthearted competition.', category:'board games', budget:'free', location:'home', image:"url('./ezequiel-garrido-5clsQK_QJgo-unsplash.jpg')" },
  { id:'tv-01', title:'Nostalgic TV Show Pilot Night', detail:'Rewatch the pilot episodes of your favorite childhood TV series together.', category:'tv', budget:'free', location:'home', image:"url('./ben-griffiths-J1FBR-U0cGg-unsplash.jpg')" },
  { id:'tv-02', title:'Binge-Worthy Mystery Series', detail:'Stream the opening episodes of a gripping new thriller or mystery show.', category:'tv', budget:'free', location:'home', image:"url('./elin-melaas-yUrnuI11rbA-unsplash.jpg')" },
  { id:'movie-01', title:'First-Time Epic Adventure', detail:'Stream a critically acclaimed adventure or sci-fi movie that neither of you has ever seen.', category:'movie', budget:'free', location:'home', image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" },
  { id:'movie-02', title:'Local Cinema Night Out', detail:'Get dressed up, grab buttery popcorn at the local movie theater, and catch the latest release.', category:'movie', budget:'paid', location:'out', image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" }
];

/* Curated store expansion packs */
const storeCatalog = [
  { id:'pack-viral', title:'Pack 1: Viral Micro-Adventures', type:'deck', price:'$0.99', desc:'Break the routine. Turn ordinary places and everyday objects into unexpectedly fun dates.', image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" },
  { id:'pack-culinary', title:'Pack 2: Culinary & Sensory Adventures', type:'deck', price:'$0.99', desc:'Make something together, explore new flavors, and turn food into an experience.', image:"url('./chad-montano-MqT0asuoIcU-unsplash.jpg')" },
  { id:'pack-intimacy', title:'Pack 3: Intimacy & Deep Connection', type:'deck', price:'$0.99', desc:'Create space for meaningful conversation, affection, shared memories, and romance.', image:"url('./ben-griffiths-J1FBR-U0cGg-unsplash.jpg')" },
  { id:'pack-quick', title:'Pack 4: Quick Connection Dates', type:'deck', price:'$0.99', desc:'Good dates don’t need an entire evening, a big budget, or extensive preparation.', image:"url('./ezequiel-garrido-5clsQK_QJgo-unsplash.jpg')" },
  { id:'pack-outdoor', title:'Pack 5: Outdoor Discovery Dates', type:'deck', price:'$0.99', desc:'Get outside, explore your surroundings, and find something interesting nearby.', image:"url('./karthik-balakrishnan-NrS53eUKgiE-unsplash.jpg')" }
];

const expansionDecks = {
  'pack-viral': [
    { id:'viral-1', title:'Store Aisle Roulette', detail:'Use random store aisles and playful rules to choose surprises for each other. (Duration: 30–60 min)', category:'board games', budget:'paid', location:'out', image:"url('./ezequiel-garrido-5clsQK_QJgo-unsplash.jpg')" },
    { id:'viral-2', title:'Trunk-Side Studio', detail:'Turn a car trunk, a few supplies, and a scenic spot into a pop-up creative studio. (Duration: 45–90 min)', category:'movie', budget:'paid', location:'out', image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" },
    { id:'viral-3', title:'Seven Treasures Exchange', detail:'Find or create seven small things that represent memories, inside jokes, or hopes for each other. (Duration: 45–75 min)', category:'board games', budget:'free', location:'home', image:"url('./karthik-balakrishnan-NrS53eUKgiE-unsplash.jpg')" },
    { id:'viral-4', title:'Alphabet Culinary Crawl', detail:'Choose food stops using letters of the alphabet, with flexible rules if a letter is difficult. (Duration: 60–120 min)', category:'cooking', budget:'paid', location:'out', image:"url('./jeswin-thomas-z_PfaGzeN9E-unsplash.jpg')" },
    { id:'viral-5', title:'Architectural Fort Cinema', detail:'Build an elaborate blanket fort, then turn it into a personalized movie-night hideaway. (Duration: 45–90 min)', category:'movie', budget:'free', location:'home', image:"url('./ben-griffiths-J1FBR-U0cGg-unsplash.jpg')" }
  ],
  'pack-culinary': [
    { id:'culinary-1', title:'Helpless Baker Protocol', detail:'One partner leads a baking challenge through verbal instructions while the other follows. (Duration: 60–120 min)', category:'baking', budget:'paid', location:'home', image:"url('./joe-dumas-89zuNmg6w0Y-unsplash.jpg')" },
    { id:'culinary-2', title:'Botanical Mixology & Edible Ice', detail:'Create colorful cocktails or mocktails using herbs, fruit, garnishes, and creative ice cubes. (Duration: 30–60 min)', category:'cooking', budget:'paid', location:'home', image:"url('./masha-uu-cPgsmkZcgdU-unsplash.jpg')" },
    { id:'culinary-3', title:'DIY Fondue & Flavor Spectrum', detail:'Build a shared fondue spread and experiment with unexpected sweet or savory combinations. (Duration: 45–90 min)', category:'cooking', budget:'paid', location:'home', image:"url('./chad-montano-MqT0asuoIcU-unsplash.jpg')" },
    { id:'culinary-4', title:'Blindfolded Sensory Sauce Audition', detail:'Taste a selection of safe, familiar sauces or dips and guess their ingredients and flavors. (Duration: 30–45 min)', category:'cooking', budget:'paid', location:'home', image:"url('./jeswin-thomas-z_PfaGzeN9E-unsplash.jpg')" },
    { id:'culinary-5', title:'World Kitchen Co-Cook Challenge', detail:'Pick a cuisine neither partner cooks regularly and make a meal together with divided roles. (Duration: 60–120 min)', category:'cooking', budget:'paid', location:'home', image:"url('./chad-montano-MqT0asuoIcU-unsplash.jpg')" }
  ],
  'pack-intimacy': [
    { id:'intimacy-1', title:'Three-Tier Vulnerability Audit', detail:'Explore lighthearted, meaningful, and deeper questions at a pace both partners enjoy. (Duration: 30–60 min)', category:'board games', budget:'free', location:'home', image:"url('./karthik-balakrishnan-NrS53eUKgiE-unsplash.jpg')" },
    { id:'intimacy-2', title:'Tactical Touch & Grid Play', detail:'Use a simple, optional touch-based activity to explore preferences and comfort. (Duration: 20–45 min)', category:'board games', budget:'free', location:'home', image:"url('./ezequiel-garrido-5clsQK_QJgo-unsplash.jpg')" },
    { id:'intimacy-3', title:'Cottagecore Candle Crafter', detail:'Make personalized candles or candle holders, then create a cozy atmosphere for conversation. (Duration: 45–90 min)', category:'baking', budget:'paid', location:'home', image:"url('./joe-dumas-89zuNmg6w0Y-unsplash.jpg')" },
    { id:'intimacy-4', title:'Fantasy Scenario Selection', detail:'Choose a playful shared scenario—such as a fictional first date or dream vacation—and act it out. (Duration: 30–75 min)', category:'tv', budget:'free', location:'home', image:"url('./ben-griffiths-J1FBR-U0cGg-unsplash.jpg')" },
    { id:'intimacy-5', title:'Love Language Action Protocol', detail:'Each partner chooses a small action that would make the other feel appreciated, then puts it into practice. (Duration: 30–60 min)', category:'board games', budget:'free', location:'home', image:"url('./ezequiel-garrido-5clsQK_QJgo-unsplash.jpg')" }
  ],
  'pack-quick': [
    { id:'quick-1', title:'Sidewalk Chalk Mural', detail:'Create a shared drawing, silly competition, or illustrated message somewhere permitted. (Duration: 15–30 min)', category:'board games', budget:'free', location:'out', image:"url('./ezequiel-garrido-5clsQK_QJgo-unsplash.jpg')" },
    { id:'quick-2', title:'Excavation & STEM Lab', detail:'Complete a quick hands-on science, building, or mini-excavation challenge using household materials. (Duration: 20–30 min)', category:'gaming', budget:'free', location:'home', image:"url('./jeshoots-com-eCktzGjC-iU-unsplash.jpg')" },
    { id:'quick-3', title:'$10 Thrift Styling Challenge', detail:'Choose playful outfits or accessories for each other within a shared spending limit. (Duration: 30–60 min)', category:'movie', budget:'paid', location:'out', image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" },
    { id:'quick-4', title:'Living Room Choreography Blitz', detail:'Pick a song, invent a ridiculous routine, and perform it together. (Duration: 10–25 min)', category:'gaming', budget:'free', location:'home', image:"url('./carl-raw-zvBT4eOtlkY-unsplash.jpg')" },
    { id:'quick-5', title:'Sunset Brew & Memory Log', detail:'Make a favorite warm drink, watch the sunset, and share a memory or hope for the future. (Duration: 15–30 min)', category:'cooking', budget:'free', location:'either', image:"url('./jeswin-thomas-z_PfaGzeN9E-unsplash.jpg')" }
  ],
  'pack-outdoor': [
    { id:'outdoor-1', title:'Local Flora Expedition', detail:'Take a nature walk and identify interesting plants, flowers, or trees using a guide app. (Duration: 30–60 min)', category:'movie', budget:'free', location:'out', image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" },
    { id:'outdoor-2', title:'Geo-Scavenger & Hidden Landmarks', detail:'Explore a neighborhood using a list of landmarks, details, and small discoveries to find. (Duration: 45–90 min)', category:'movie', budget:'free', location:'out', image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" },
    { id:'outdoor-3', title:'Park Blanket Picnic & Tactical Games', detail:'Pack a simple picnic and bring two or three easy games or playful challenges. (Duration: 45–90 min)', category:'board games', budget:'paid', location:'out', image:"url('./karthik-balakrishnan-NrS53eUKgiE-unsplash.jpg')" },
    { id:'outdoor-4', title:'Arena Trampoline & High-Flyer', detail:'Visit an indoor trampoline venue and invent friendly challenges following safety rules. (Duration: 60–120 min)', category:'gaming', budget:'paid', location:'out', image:"url('./carl-raw-zvBT4eOtlkY-unsplash.jpg')" },
    { id:'outdoor-5', title:'Midnight Skyline Viewfinder', detail:'Find a safe, accessible viewpoint and enjoy the night skyline, stars, or city lights together. (Duration: 30–60 min)', category:'movie', budget:'free', location:'out', image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" }
  ]
};

/* Local gameplay and live-room state */
let p1Deck = [], p2Deck = [], p1Likes = [], p2Likes = [];
let swipePlayer = 1, swipeIndex = 0, draftItems = [], draftTurn = 1;
let peer = null, conn = null, remoteRoomId = null, myPlayerNum = 1;
let remoteSubmitSent = false;
let currentRoomPeerId = null;
let isDragging = false, startX = 0, currentX = 0, startTime = 0;
let swipeCardEl = null;
window.currentWinner = null;

const shuffle = array => {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

function createUniqueId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getCardScore(card) {
  let score = 5;
  const matches = dateHistory.filter(h => h.cardId === card.id || (!h.cardId && h.category === card.category));
  const ratings = [];
  matches.forEach(entry => {
    [entry.rating1, entry.rating2].forEach(value => {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 1 && n <= 5) ratings.push(n);
    });
  });
  if (ratings.length) {
    const average = ratings.reduce((sum, n) => sum + n, 0) / ratings.length;
    score += (average - 3) * 2;
  }
  return score + Math.random() * 0.5;
}

function refreshDecks() {
  const available = [...masterDeck];
  unlockedItems.forEach(packId => {
    if (expansionDecks[packId]) available.push(...expansionDecks[packId]);
  });
  fullDeck = [...available.filter(item => !deletedBuiltins.has(item.id)), ...customDeck];
  selectedCategories = [...document.querySelectorAll('.category-choice:checked')].map(input => input.value);
  const budget = document.getElementById('budgetFilter')?.value || 'all';
  const location = document.getElementById('locationFilter')?.value || 'all';

  activeDeck = fullDeck.filter(item => {
    const categoryMatches = selectedCategories.includes(item.category);
    const budgetMatches = budget === 'all' || item.budget === budget;
    const itemLocation = item.location || 'either';
    const locationMatches = location === 'all' || itemLocation === location || itemLocation === 'either';
    return categoryMatches && budgetMatches && locationMatches;
  });
  activeDeck.sort((a, b) => getCardScore(b) - getCardScore(a));

  const summary = document.getElementById('categorySummary');
  if (summary) {
    summary.textContent = selectedCategories.length === DEFAULT_CATEGORIES.length
      ? `All categories active (${activeDeck.length}) ▾`
      : `${selectedCategories.length} categories active (${activeDeck.length}) ▾`;
  }
}

async function applyCategoryFilter() {
  selectedCategories = [...document.querySelectorAll('.category-choice:checked')].map(input => input.value);
  try { await db.categories.put({ id: 'selectedCats', values: selectedCategories }); }
  catch (err) { console.error('Could not save category filters:', err); }
  refreshDecks();

  // Player 2's live room uses the host's shared deck/order. Local filters must not
  // silently overwrite that synchronized deck. The host can change filters to reset it.
  if (remoteRoomId && myPlayerNum === 2) {
    if (document.getElementById('card-library')?.classList.contains('active-mode')) renderLibrary();
    return;
  }

  if (remoteRoomId && myPlayerNum === 1) {
    resetRemoteRound();
    sendRoomState();
  } else {
    initMatcher();
    initDraft();
  }
  if (document.getElementById('card-library')?.classList.contains('active-mode')) renderLibrary();
}

function setAllCategories(checked) {
  document.querySelectorAll('.category-choice').forEach(input => { input.checked = checked; });
  applyCategoryFilter();
}

function switchGame(mode, button) {
  const target = document.getElementById(`card-${mode}`);
  if (!target || !button) return;
  document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.game-card').forEach(card => card.classList.remove('active-mode'));
  button.classList.add('active');
  target.classList.add('active-mode');
  if (mode === 'matcher') updateSwipeCard();
  if (mode === 'draft') renderDraftGrid();
  if (mode === 'library') renderLibrary();
  if (mode === 'history') renderHistory();
  if (mode === 'store') renderStore();
}

document.addEventListener('click', event => {
  const picker = document.getElementById('categoryPicker');
  if (picker && picker.open && !picker.contains(event.target)) picker.open = false;
});

/* MATCHER */
function currentSwipeDeck() {
  if (remoteRoomId) return myPlayerNum === 1 ? p1Deck : p2Deck;
  return swipePlayer === 1 ? p1Deck : p2Deck;
}

function initMatcher() {
  p1Deck = shuffle(activeDeck);
  p2Deck = [...p1Deck];
  p1Likes = [];
  p2Likes = [];
  swipePlayer = 1;
  swipeIndex = 0;
  remoteSubmitSent = false;
  updateSwipeCard();
}

function updateSwipeCard() {
  const header = document.getElementById('matcherTurnHeader');
  const cardEl = document.getElementById('swipeCard');
  const metaEl = document.getElementById('cardMeta');
  const venueHint = document.getElementById('venueHintBanner');
  if (!header || !cardEl) return;

  const curDeck = currentSwipeDeck();
  if (!curDeck.length) {
    header.textContent = 'No ideas available';
    cardEl.style.backgroundImage = 'none';
    document.getElementById('cardCategory').textContent = 'Empty';
    document.getElementById('cardTitle').textContent = 'Select filters above';
    document.getElementById('cardDetail').textContent = 'Choose at least one category and matching filter to view date ideas.';
    if (metaEl) metaEl.innerHTML = '';
    if (venueHint) venueHint.style.display = 'none';
    return;
  }

  if (remoteRoomId) {
    header.textContent = `Live Room (${remoteRoomId}) · Player ${myPlayerNum} · Card ${Math.min(swipeIndex + 1, curDeck.length)} of ${curDeck.length}`;
  } else {
    header.textContent = `Player ${swipePlayer}'s Turn · Card ${Math.min(swipeIndex + 1, curDeck.length)} of ${curDeck.length}`;
  }

  if (swipeIndex >= curDeck.length) {
    if (remoteRoomId) {
      if (!conn || !conn.open) {
        header.textContent = 'Live room · Waiting for partner connection';
      } else if (myPlayerNum === 2) {
        if (!remoteSubmitSent) {
          remoteSubmitSent = true;
          sendP2PMessage({ type: 'SUBMIT_SWIPES', likedCards: p2Likes });
        }
        header.textContent = 'All cards reviewed · Waiting for Player 1 / match result…';
      } else {
        header.textContent = 'All cards reviewed · Waiting for Player 2…';
      }
      document.getElementById('cardCategory').textContent = 'Voting complete';
      document.getElementById('cardTitle').textContent = 'Waiting for the round result';
      document.getElementById('cardDetail').textContent = myPlayerNum === 1
        ? 'Your partner’s likes will be compared with yours when they finish.'
        : 'Your likes have been sent to the host for comparison.';
      cardEl.style.backgroundImage = 'none';
      if (metaEl) metaEl.innerHTML = '';
      if (venueHint) venueHint.style.display = 'none';
      return;
    }

    if (swipePlayer === 1) {
      swipePlayer = 2;
      swipeIndex = 0;
      alert("Player 1 complete! Pass the phone to Player 2.");
      updateSwipeCard();
    } else {
      const mutual = p1Likes.filter(a => p2Likes.some(b => b.id === a.id));
      handleMatchOutcome(mutual, false);
    }
    return;
  }

  const item = curDeck[swipeIndex];
  cardEl.style.backgroundImage = item.image || 'none';
  document.getElementById('cardCategory').textContent = item.category || 'Date idea';
  document.getElementById('cardTitle').textContent = item.title || 'Untitled date';
  document.getElementById('cardDetail').textContent = item.detail || '';
  if (metaEl) {
    const locLabel = item.location === 'home' ? '🏠 Stay Home' : item.location === 'out' ? '🚗 Go Out' : '🌐 Either';
    metaEl.innerHTML = `<span class="meta-pill">💰 ${item.budget === 'free' ? 'Free' : 'Costs Money / Ingredients'}</span><span class="meta-pill">${locLabel}</span>`;
  }
  if (venueHint) venueHint.style.display = item.location === 'out' ? 'block' : 'none';
}

function handleSwipe(liked) {
  const curDeck = currentSwipeDeck();
  if (swipeIndex >= curDeck.length) return;
  const likes = remoteRoomId
    ? (myPlayerNum === 1 ? p1Likes : p2Likes)
    : (swipePlayer === 1 ? p1Likes : p2Likes);
  playSound('swipe');
  triggerHaptic('light');
  if (liked) likes.push(curDeck[swipeIndex]);
  swipeIndex += 1;
  // Deliberately do not broadcast the index: each live player votes independently.
  updateSwipeCard();
}

function installSwipeGestures() {
  swipeCardEl = document.getElementById('swipeCard');
  if (!swipeCardEl) return;
  swipeCardEl.addEventListener('mousedown', dragStart);
  swipeCardEl.addEventListener('touchstart', dragStart, { passive: true });

  function dragStart(event) {
    const deck = currentSwipeDeck();
    if (swipeIndex >= deck.length || (remoteRoomId && (!conn || !conn.open))) return;
    isDragging = true;
    startX = event.type.includes('mouse') ? event.clientX : event.touches[0].clientX;
    currentX = 0;
    startTime = performance.now();
    swipeCardEl.style.transition = 'none';
    window.addEventListener('mousemove', dragMove);
    window.addEventListener('mouseup', dragEnd);
    window.addEventListener('touchmove', dragMove, { passive: true });
    window.addEventListener('touchend', dragEnd);
    window.addEventListener('touchcancel', dragEnd);
  }

  function dragMove(event) {
    if (!isDragging) return;
    const x = event.type.includes('mouse') ? event.clientX : event.touches?.[0]?.clientX;
    if (typeof x !== 'number') return;
    currentX = x - startX;
    swipeCardEl.style.transform = `translateX(${currentX}px) rotate(${currentX * 0.04}deg)`;
  }

  function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    window.removeEventListener('mousemove', dragMove);
    window.removeEventListener('mouseup', dragEnd);
    window.removeEventListener('touchmove', dragMove);
    window.removeEventListener('touchend', dragEnd);
    window.removeEventListener('touchcancel', dragEnd);
    swipeCardEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    const elapsed = (performance.now() - startTime) / 1000;
    const velocity = Math.abs(currentX / (elapsed || 0.001));
    const threshold = velocity > 400 ? 40 : 80;
    const wasLike = currentX > threshold;
    const wasPass = currentX < -threshold;
    const delta = currentX;
    currentX = 0;

    if (wasLike || wasPass) {
      swipeCardEl.style.transform = `translateX(${wasLike ? 350 : -350}px) rotate(${wasLike ? 25 : -25}deg)`;
      swipeCardEl.style.opacity = '0';
      window.setTimeout(() => {
        handleSwipe(wasLike);
        resetSwipeCard();
      }, 220);
    } else {
      swipeCardEl.style.transform = 'translateX(0) rotate(0)';
    }
  }
}

function resetSwipeCard() {
  if (!swipeCardEl) return;
  // The transform value must not contain a trailing semicolon.
  swipeCardEl.style.transform = 'translateX(0) rotate(0)';
  swipeCardEl.style.opacity = '1';
}

/* DRAFT — the host owns the canonical remote draft. */
function makeDraftItems() {
  return shuffle(activeDeck).slice(0, Math.min(8, activeDeck.length)).map(item => ({ ...item, banned: false }));
}

function initDraft() {
  draftItems = makeDraftItems();
  draftTurn = 1;
  renderDraftGrid();
}

function renderDraftGrid() {
  const header = document.getElementById('draftTurnHeader');
  if (header) header.textContent = remoteRoomId
    ? `Live Room (${remoteRoomId}) · Player ${draftTurn}'s Turn`
    : `Player ${draftTurn}'s Turn`;

  const grid = document.getElementById('draftGrid');
  if (!grid) return;
  grid.replaceChildren();
  if (!draftItems.length) {
    const empty = document.createElement('div');
    empty.className = 'library-summary';
    empty.style.gridColumn = '1 / -1';
    empty.style.textAlign = 'center';
    empty.textContent = 'No ideas available. Select filters above.';
    grid.appendChild(empty);
    return;
  }

  draftItems.forEach((item, index) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `draft-tile${item.banned ? ' banned' : ''}`;
    tile.style.backgroundImage = item.image || 'none';
    tile.disabled = Boolean(item.banned);
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title || 'Untitled date';
    const category = document.createElement('div');
    category.className = 'cat';
    category.textContent = item.category || '';
    tile.append(title, category);
    if (!item.banned) tile.addEventListener('click', () => {
      const remainingCount = draftItems.filter(entry => !entry.banned).length;
      if (remainingCount <= 1) {
        window.currentWinner = item;
        showModal('Only Date Available!', item.title, item.detail);
      } else {
        banItem(index);
      }
    });
    grid.appendChild(tile);
  });
}

function executeBan(index) {
  if (!draftItems[index] || draftItems[index].banned) return;
  draftItems[index].banned = true;
  playSound('ban');
  triggerHaptic('heavy');
  const remaining = draftItems.filter(item => !item.banned);
  if (remaining.length > 1) draftTurn = draftTurn === 1 ? 2 : 1;
  renderDraftGrid();

  if (remoteRoomId && myPlayerNum === 1) {
    sendP2PMessage({ type: 'DRAFT_STATE', draftItems, draftTurn });
  }
  if (remaining.length === 1) {
    window.currentWinner = remaining[0];
    showModal('Winner by Elimination!', remaining[0].title, remaining[0].detail);
  }
}

function banItem(index) {
  if (remoteRoomId) {
    if (String(myPlayerNum) !== String(draftTurn)) {
      alert(`It is currently Player ${draftTurn}'s turn to ban!`);
      return;
    }
    if (myPlayerNum === 2) {
      sendP2PMessage({ type: 'BAN_REQUEST', index });
      return;
    }
  }
  executeBan(index);
}

/* SURPRISE */
function surpriseMe() {
  let pool = [...activeDeck];
  const mode = document.getElementById('surpriseMode')?.value || 'all';
  if (mode === 'new') {
    pool = pool.filter(item => !dateHistory.some(entry => entry.cardId === item.id || (!entry.cardId && entry.title === item.title)));
  }
  if (!pool.length) {
    window.currentWinner = null;
    showModal('No Matching Dates', 'Try selecting more filters', 'There are no ideas matching your active filters that have not already been completed.');
    return;
  }
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  window.currentWinner = chosen;
  showModal('Your Surprise Date', chosen.title, chosen.detail);
}

/* LIBRARY */
function renderLibrary() {
  const query = document.getElementById('librarySearch')?.value.trim().toLowerCase() || '';
  const category = document.getElementById('libraryCategory')?.value || 'all';
  const list = document.getElementById('libraryList');
  const summary = document.getElementById('librarySummary');
  if (!list) return;
  const items = fullDeck.filter(item =>
    (category === 'all' || item.category === category) &&
    (!query || `${item.title} ${item.detail}`.toLowerCase().includes(query))
  );
  if (summary) summary.textContent = `${fullDeck.length} total ideas · Showing ${items.length}`;
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'library-summary';
    empty.textContent = 'No ideas match your search.';
    list.appendChild(empty);
    return;
  }
  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'library-item';
    const categoryEl = document.createElement('div');
    categoryEl.className = 'library-category';
    categoryEl.textContent = `${item.category} · Location: ${item.location || 'either'}`;
    const titleEl = document.createElement('div');
    titleEl.className = 'library-title';
    titleEl.textContent = item.title;
    const detailEl = document.createElement('div');
    detailEl.className = 'library-detail';
    detailEl.textContent = item.detail;
    card.append(categoryEl, titleEl, detailEl);
    list.appendChild(card);
  });
}

/* STORE — these are local demo unlocks, not purchases. */
function renderStore() {
  const grid = document.getElementById('storeGrid');
  const summary = document.getElementById('storeSummary');
  if (!grid) return;
  if (summary) summary.textContent = `${storeCatalog.length} packs available · ${unlockedItems.length} demo-unlocked`;
  grid.replaceChildren();
  storeCatalog.forEach(item => {
    const unlocked = unlockedItems.includes(item.id);
    const card = document.createElement('article');
    card.className = 'library-item store-tile';
    card.style.backgroundImage = item.image || 'none';
    const category = document.createElement('div');
    category.className = 'library-category';
    category.textContent = `EXPANSION PACK · ${item.price} (demo)`;
    const title = document.createElement('div');
    title.className = 'library-title';
    title.textContent = item.title;
    const detail = document.createElement('div');
    detail.className = 'library-detail';
    detail.textContent = item.desc;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `primary-btn${unlocked ? ' secondary-action-btn' : ''}`;
    button.style.marginTop = '10px';
    button.style.padding = '8px 12px';
    button.style.fontSize = '0.8rem';
    button.textContent = unlocked ? '✅ Unlocked (View)' : '🔍 Preview & Demo Unlock';
    button.addEventListener('click', () => openStorePreview(item.id));
    card.append(category, title, detail, button);
    grid.appendChild(card);
  });
}

function openStorePreview(itemId) {
  const item = storeCatalog.find(entry => entry.id === itemId);
  if (!item) return;
  selectedPreviewItemId = itemId;
  document.getElementById('storeModalTitle').textContent = item.title;
  document.getElementById('storeModalDesc').textContent = item.desc;
  const unlocked = unlockedItems.includes(itemId);
  const actionButton = document.getElementById('storeModalActionBtn');
  actionButton.textContent = unlocked ? 'Already Unlocked' : `Demo Unlock · ${item.price}`;
  actionButton.disabled = unlocked;

  const list = document.getElementById('storeModalCardsList');
  list.replaceChildren();
  (expansionDecks[itemId] || []).forEach(card => {
    const wrapper = document.createElement('div');
    wrapper.style.background = '#1f122e';
    wrapper.style.border = '1px solid var(--border)';
    wrapper.style.borderRadius = '8px';
    wrapper.style.padding = '8px 10px';
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.65rem;color:var(--gold);font-weight:800;text-transform:uppercase;';
    meta.textContent = `${card.category} · ${card.location} · Budget: ${card.budget}`;
    const title = document.createElement('div');
    title.style.cssText = 'font-size:0.85rem;font-weight:900;color:var(--cream);';
    title.textContent = card.title;
    const detail = document.createElement('div');
    detail.style.cssText = 'font-size:0.75rem;color:var(--muted);';
    detail.textContent = card.detail;
    wrapper.append(meta, title, detail);
    list.appendChild(wrapper);
  });
  document.getElementById('storePreviewModal').classList.add('show');
}

function closeStorePreview() {
  document.getElementById('storePreviewModal').classList.remove('show');
  selectedPreviewItemId = null;
}

async function actionFromPreviewModal() {
  if (!selectedPreviewItemId) return;
  const itemId = selectedPreviewItemId;
  closeStorePreview();
  await handleStoreAction(itemId);
}

async function handleStoreAction(itemId) {
  if (unlockedItems.includes(itemId)) {
    alert('This pack is already demo-unlocked on this device.');
    return;
  }
  const confirmed = confirm('Demo unlock only: no payment will be charged. Unlock this pack on this device?');
  if (!confirmed) return;
  try {
    unlockedItems.push(itemId);
    await db.unlocks.put({ id: itemId });
    triggerHaptic('success');
    refreshDecks();
    initMatcher();
    initDraft();
    renderLibrary();
    renderStore();
    alert('Demo pack unlocked on this device. No payment was processed.');
  } catch (err) {
    unlockedItems = unlockedItems.filter(id => id !== itemId);
    console.error('Could not save pack unlock:', err);
    alert('The pack could not be unlocked because local storage failed.');
  }
}

/* HISTORY, weekly goal, and analytics */
function renderTracker() {
  const label = document.getElementById('dateGoalStatus');
  const bar = document.getElementById('dateGoalBar');
  if (!bar || !label) return;
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const count = dateHistory.filter(entry => new Date(entry.date) >= startOfWeek).length;
  label.textContent = `${count} / 1 Done`;
  bar.style.width = `${Math.min(100, count * 100)}%`;
}

function renderAnalyticsDashboard() {
  const dashboard = document.getElementById('analyticsDashboard');
  if (!dashboard) return;
  dashboard.replaceChildren();
  if (!dateHistory.length) return;
  const ratings = [];
  dateHistory.forEach(entry => [entry.rating1, entry.rating2].forEach(value => {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 5) ratings.push(n);
  }));
  const average = ratings.length ? (ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(1) : '—';
  const card = document.createElement('div');
  card.className = 'stats-card';
  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  const completed = document.createElement('div');
  completed.className = 'stat-box';
  completed.innerHTML = `<div class="val">${dateHistory.length}</div><div class="lbl">Completed</div>`;
  const rating = document.createElement('div');
  rating.className = 'stat-box';
  rating.innerHTML = `<div class="val">${escapeHtml(average === '—' ? average : `⭐ ${average}`)}</div><div class="lbl">Average rating</div>`;
  grid.append(completed, rating);
  card.appendChild(grid);
  dashboard.appendChild(card);
}

function renderHistory() {
  renderAnalyticsDashboard();
  renderTracker();
  const list = document.getElementById('historyList');
  const stats = document.getElementById('historyStats');
  if (!list) return;
  if (stats) stats.textContent = `${dateHistory.length} completed dates in scrapbook`;
  list.replaceChildren();
  if (!dateHistory.length) {
    const empty = document.createElement('div');
    empty.className = 'library-summary';
    empty.textContent = 'No dates logged yet. Complete a date to build your scrapbook!';
    list.appendChild(empty);
    return;
  }
  dateHistory.forEach(entry => {
    const row = document.createElement('article');
    row.className = 'library-item';
    const category = document.createElement('div');
    category.className = 'library-category';
    const date = new Date(entry.date);
    category.textContent = `${entry.category || 'Date'} · ${Number.isNaN(date.getTime()) ? 'Date unknown' : date.toLocaleDateString()}`;
    const title = document.createElement('div');
    title.className = 'library-title';
    title.textContent = entry.title || 'Untitled date';
    const detail = document.createElement('div');
    detail.className = 'library-detail';
    const ratingText = entry.rating1 || entry.rating2 ? `Ratings: ${entry.rating1 ?? '—'}/5 & ${entry.rating2 ?? '—'}/5` : '';
    detail.textContent = [entry.note || entry.detail || '', ratingText].filter(Boolean).join(' · ');
    row.append(category, title, detail);
    list.appendChild(row);
  });
}

async function persistHistoryEntry(entry, broadcast = false) {
  if (!entry || typeof entry !== 'object') return null;
  const syncId = entry.syncId || createUniqueId();
  const existing = dateHistory.find(record => record.syncId && record.syncId === syncId);
  if (existing) return existing;
  const { id: ignoredDatabaseId, ...record } = entry;
  const toSave = { ...record, syncId };
  const insertedId = await db.history.add(toSave);
  const saved = await db.history.get(insertedId);
  dateHistory = [saved, ...dateHistory.filter(item => item.id !== saved.id)].sort((a, b) => new Date(b.date) - new Date(a.date));
  renderHistory();
  if (broadcast && remoteRoomId && myPlayerNum === 1) {
    sendP2PMessage({ type: 'HISTORY_ENTRY', entry: saved });
  }
  return saved;
}

async function receiveHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return;
  if (entry.syncId && dateHistory.some(record => record.syncId === entry.syncId)) return;
  const { id: ignoredDatabaseId, ...record } = entry;
  const insertedId = await db.history.add(record);
  const saved = await db.history.get(insertedId);
  dateHistory = [saved, ...dateHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
  renderHistory();
}

async function applyTheme(theme) {
  appSettings.theme = ['dark', 'ocean'].includes(theme) ? theme : 'dark';
  document.documentElement.dataset.theme = appSettings.theme === 'dark' ? '' : appSettings.theme;
  const select = document.getElementById('themeSelect');
  if (select) select.value = appSettings.theme;
  try { await db.settings.put({ key: 'appSettings', value: appSettings }); }
  catch (err) { console.error('Could not save theme:', err); }
}

async function saveFeedbackSettings(value) {
  appSettings.feedback = ['both', 'sound', 'vibration', 'off'].includes(value) ? value : 'both';
  try { await db.settings.put({ key: 'appSettings', value: appSettings }); }
  catch (err) { console.error('Could not save feedback preference:', err); }
}

function shareCurrentDate() {
  const item = window.currentWinner;
  if (!item) { alert('Choose a date idea first.'); return; }
  const text = `💞 Date Night Decider: ${item.title}\n${item.detail}`;
  if (navigator.share) navigator.share({ title: item.title, text }).catch(() => {});
  else window.prompt('Copy this date idea:', text);
}

function openCurrentCardMap() {
  const item = window.currentWinner;
  if (!item) return;
  const queryByCategory = {
    movie: 'movie theaters near me',
    gaming: item.title.toLowerCase().includes('arcade') ? 'arcades near me' : `${item.title} near me`,
    cooking: item.title.toLowerCase().includes('crawl') ? 'restaurants near me' : `${item.title} near me`,
    baking: `bakeries or cooking classes near me`,
    'board games': 'board game cafes near me',
    tv: `${item.title} near me`
  };
  const query = item.location === 'out' ? (queryByCategory[item.category] || `${item.title} near me`) : `${item.title} near me`;
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
}

/* Backup export/import */
async function exportBackup() {
  const data = {
    version: '2.5.0',
    customDeck,
    deletedBuiltins: [...deletedBuiltins],
    dateHistory,
    settings: appSettings,
    unlockedItems,
    selectedCategories: [...document.querySelectorAll('.category-choice:checked')].map(input => input.value)
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'date-night-backup.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importBackupFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(String(reader.result || ''));
      if (!data || typeof data !== 'object') throw new Error('Backup must be a JSON object.');

      if (data.settings && typeof data.settings === 'object') {
        appSettings = {
          theme: ['dark', 'ocean'].includes(data.settings.theme) ? data.settings.theme : 'dark',
          feedback: ['both', 'sound', 'vibration', 'off'].includes(data.settings.feedback) ? data.settings.feedback : 'both'
        };
        await db.settings.put({ key: 'appSettings', value: appSettings });
      }
      if (Array.isArray(data.customDeck)) {
        await db.customDeck.clear();
        await db.customDeck.bulkAdd(data.customDeck.map(item => ({ item })));
        customDeck = data.customDeck.filter(item => item && typeof item === 'object' && item.id && item.title);
      }
      if (Array.isArray(data.deletedBuiltins)) {
        const ids = data.deletedBuiltins.filter(id => typeof id === 'string');
        await db.deletedBuiltins.clear();
        if (ids.length) await db.deletedBuiltins.bulkAdd(ids.map(id => ({ id })));
        deletedBuiltins = new Set(ids);
      }
      if (Array.isArray(data.dateHistory)) {
        await db.history.clear();
        const sanitized = data.dateHistory.filter(entry => entry && typeof entry === 'object').map(({ id, ...entry }) => entry);
        if (sanitized.length) await db.history.bulkAdd(sanitized);
        dateHistory = await db.history.orderBy('date').reverse().toArray();
      }
      if (Array.isArray(data.unlockedItems)) {
        const ids = data.unlockedItems.filter(id => typeof id === 'string' && expansionDecks[id]);
        await db.unlocks.clear();
        if (ids.length) await db.unlocks.bulkAdd(ids.map(id => ({ id })));
        unlockedItems = ids;
      }
      if (Array.isArray(data.selectedCategories)) {
        selectedCategories = data.selectedCategories.filter(value => DEFAULT_CATEGORIES.includes(value));
        await db.categories.put({ id: 'selectedCats', values: selectedCategories });
        document.querySelectorAll('.category-choice').forEach(input => { input.checked = selectedCategories.includes(input.value); });
      }

      refreshDecks();
      await applyTheme(appSettings.theme || 'dark');
      const feedback = document.getElementById('feedbackSelect');
      if (feedback) feedback.value = appSettings.feedback;
      initMatcher();
      initDraft();
      renderHistory();
      renderStore();
      renderLibrary();
      alert('Backup restored successfully.');
    } catch (error) {
      console.error('Backup import failed:', error);
      alert('The backup file could not be imported. Check that it is a valid Date Night Decider JSON backup.');
    } finally {
      event.target.value = '';
    }
  };
  reader.onerror = () => {
    alert('The selected backup file could not be read.');
    event.target.value = '';
  };
  reader.readAsText(file);
}

/* Modals, logging, and calendar export */
function triggerConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const particles = Array.from({ length: 50 }, () => ({
    x: width / 2, y: height / 2,
    vx: (Math.random() - 0.5) * 10,
    vy: (Math.random() - 0.5) * 10 - 2,
    color: ['#ff3b6c', '#f6c941', '#ffffff'][Math.floor(Math.random() * 3)],
    size: Math.random() * 5 + 3, life: 80
  }));
  function render() {
    context.clearRect(0, 0, width, height);
    let alive = false;
    particles.forEach(particle => {
      if (particle.life <= 0) return;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.2;
      particle.life -= 1;
      alive = true;
      context.fillStyle = particle.color;
      context.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    if (alive) requestAnimationFrame(render);
    else context.clearRect(0, 0, width, height);
  }
  render();
}

function showModal(eyebrow, title, detail) {
  playSound('win');
  triggerHaptic('success');
  triggerConfetti();
  document.getElementById('modalEyebrow').textContent = eyebrow;
  document.getElementById('modalIdeaName').textContent = title || 'Date idea';
  document.getElementById('modalIdeaDetail').textContent = detail || '';
  const winner = window.currentWinner;
  const mapButton = document.getElementById('mapDirectionsBtn');
  if (mapButton) mapButton.style.display = winner && winner.location === 'out' ? 'block' : 'none';
  const completeButton = document.getElementById('completeDateBtn');
  if (completeButton) completeButton.disabled = !winner;
  document.getElementById('decisionModal').classList.add('show');
}

function resetRemoteRound() {
  p1Deck = shuffle(activeDeck);
  p2Deck = [...p1Deck];
  p1Likes = [];
  p2Likes = [];
  swipeIndex = 0;
  swipePlayer = 1;
  remoteSubmitSent = false;
  draftItems = makeDraftItems();
  draftTurn = 1;
  updateSwipeCard();
  renderDraftGrid();
}

function closeModal() {
  document.getElementById('decisionModal').classList.remove('show');
  if (remoteRoomId) {
    if (myPlayerNum === 1) {
      resetRemoteRound();
      sendRoomState();
    }
  } else {
    initMatcher();
    initDraft();
  }
}

function validRating(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

async function completeCurrentDate() {
  const item = window.currentWinner;
  if (!item) { closeModal(); return; }
  const first = prompt('Player 1 rating (1–5):', '5');
  if (first === null) return;
  const rating1 = validRating(first);
  if (rating1 === null) { alert('Enter a whole-number rating from 1 to 5.'); return; }
  const second = prompt('Player 2 rating (1–5):', '5');
  if (second === null) return;
  const rating2 = validRating(second);
  if (rating2 === null) { alert('Enter a whole-number rating from 1 to 5.'); return; }
  const note = prompt('Add a memory note (optional):', '') || '';
  const entry = {
    syncId: createUniqueId(),
    cardId: item.id || null,
    title: item.title || 'Untitled date',
    category: item.category || 'Date',
    detail: item.detail || '',
    date: new Date().toISOString(),
    rating1,
    rating2,
    note
  };

  try {
    if (remoteRoomId && conn && conn.open && myPlayerNum === 2) {
      sendP2PMessage({ type: 'COMPLETE_DATE_REQUEST', entry });
      closeModal();
      return;
    }
    await persistHistoryEntry(entry, true);
    closeModal();
  } catch (error) {
    console.error('Could not save completed date:', error);
    alert('The date could not be saved. Please try again or export a backup before refreshing.');
  }
}

function downloadCalendarEvent() {
  const item = window.currentWinner;
  if (!item) { alert('Choose a date idea first.'); return; }
  const start = new Date();
  start.setHours(19, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const formatUtc = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const icsEscape = value => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Date Night Decider//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${createUniqueId()}@datenightdecider`, `DTSTAMP:${formatUtc(new Date())}`,
    `SUMMARY:${icsEscape(`Date: ${item.title}`)}`, `DESCRIPTION:${icsEscape(item.detail)}`,
    `DTSTART:${formatUtc(start)}`, `DTEND:${formatUtc(end)}`, 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'date-night.ics';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* PeerJS live room protocol. Each device tracks its own swipe index; host owns draft state. */
function normalizeRoomCode(raw) {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30);
}

function roomPeerId(code) {
  return `datenight-${code}`;
}

function startP2PServer() {
  const raw = prompt('Create a room code using letters, numbers, or hyphens (at least 4 characters):');
  if (!raw) return;
  const code = normalizeRoomCode(raw);
  if (code.length < 4) { alert('Use a room code at least 4 characters long.'); return; }
  if (typeof window.Peer !== 'function') { alert('PeerJS did not load. Check your connection and reload.'); return; }
  cleanupPeerConnection();
  remoteRoomId = code;
  myPlayerNum = 1;
  currentRoomPeerId = roomPeerId(code);
  resetRemoteRound();
  try {
    peer = new Peer(currentRoomPeerId);
    peer.on('open', () => {
      alert(`Room “${code}” is ready as Player 1. On the other device, choose Join Live Room and enter the same code.`);
    });
    peer.on('connection', incoming => {
      if (conn && conn.open) conn.close();
      conn = incoming;
      setupConnectionHandlers(conn);
      conn.on('open', () => {
        // Start a fresh synchronized round when the guest connects.
        resetRemoteRound();
        sendRoomState();
        alert('Partner connected. The shared deck and draft are synchronized.');
      });
    });
    peer.on('error', error => {
      console.error('PeerJS host error:', error);
      if (error.type === 'unavailable-id') alert('That room code is already in use. Choose a different code.');
      else if (error.type === 'network' || error.type === 'server-error') alert('The live-room signaling service is unavailable. Try again later or use Matcher on one device.');
      else alert(`Could not host the live room (${error.type || 'connection error'}). Check the room code and internet connection.`);
    });
  } catch (error) {
    console.error('Could not create PeerJS host:', error);
    cleanupPeerConnection();
    alert('Could not start the live room. Check your connection and try another room code.');
  }
}

function joinP2PServer() {
  const raw = prompt('Enter the couple room code shared by the host:');
  if (!raw) return;
  const code = normalizeRoomCode(raw);
  if (code.length < 4) { alert('Enter a valid room code at least 4 characters long.'); return; }
  if (typeof window.Peer !== 'function') { alert('PeerJS did not load. Check your connection and reload.'); return; }
  cleanupPeerConnection();
  remoteRoomId = code;
  myPlayerNum = 2;
  currentRoomPeerId = roomPeerId(code);
  try {
    peer = new Peer();
    peer.on('open', () => {
      conn = peer.connect(currentRoomPeerId, { reliable: true });
      setupConnectionHandlers(conn);
      conn.on('open', () => alert(`Connected to room “${code}” as Player 2. Waiting for the host's shared deck…`));
      conn.on('error', error => {
        console.error('PeerJS guest connection error:', error);
        alert('Could not connect. Check the room code and make sure the host room is still open.');
      });
    });
    peer.on('error', error => {
      console.error('PeerJS guest error:', error);
      alert('Could not join the room. Confirm the code, internet connection, and host availability.');
    });
  } catch (error) {
    console.error('Could not join PeerJS room:', error);
    cleanupPeerConnection();
    alert('Could not join the live room. Check your connection and try again.');
  }
}

function cleanupPeerConnection() {
  try { if (conn) conn.close(); } catch (_) {}
  try { if (peer) peer.destroy(); } catch (_) {}
  conn = null;
  peer = null;
  remoteRoomId = null;
  currentRoomPeerId = null;
  myPlayerNum = 1;
  remoteSubmitSent = false;
}

function sendP2PMessage(payload) {
  if (!conn || !conn.open) return false;
  try { conn.send(payload); return true; }
  catch (error) { console.error('Could not send live-room message:', error); return false; }
}

function sendRoomState() {
  if (!remoteRoomId || myPlayerNum !== 1) return;
  sendP2PMessage({
    type: 'SYNC_STATE',
    matcherDeck: p1Deck,
    draftItems,
    draftTurn,
    hostFilters: {
      categories: [...document.querySelectorAll('.category-choice:checked')].map(input => input.value),
      budget: document.getElementById('budgetFilter')?.value || 'all',
      location: document.getElementById('locationFilter')?.value || 'all'
    }
  });
}

function setupConnectionHandlers(connection) {
  if (!connection) return;
  connection.on('data', message => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'SYNC_STATE' && myPlayerNum === 2) {
      const sharedDeck = Array.isArray(message.matcherDeck) ? message.matcherDeck : [];
      p1Deck = [...sharedDeck];
      p2Deck = [...sharedDeck];
      p1Likes = [];
      p2Likes = [];
      swipeIndex = 0;
      swipePlayer = 1;
      remoteSubmitSent = false;
      draftItems = Array.isArray(message.draftItems) ? message.draftItems.map(item => ({ ...item })) : [];
      draftTurn = Number(message.draftTurn) === 2 ? 2 : 1;
      window.currentWinner = null;
      updateSwipeCard();
      renderDraftGrid();
      return;
    }

    if (message.type === 'SUBMIT_SWIPES' && myPlayerNum === 1) {
      const partnerLikes = Array.isArray(message.likedCards) ? message.likedCards : [];
      const mutual = p1Likes.filter(item => partnerLikes.some(partnerItem => partnerItem && partnerItem.id === item.id));
      sendP2PMessage({ type: 'MATCH_RESULTS', mutual });
      handleMatchOutcome(mutual, true);
      return;
    }

    if (message.type === 'MATCH_RESULTS' && myPlayerNum === 2) {
      handleMatchOutcome(Array.isArray(message.mutual) ? message.mutual : [], false);
      return;
    }

    if (message.type === 'BAN_REQUEST' && myPlayerNum === 1) {
      if (draftTurn === 2 && Number.isInteger(message.index)) executeBan(message.index);
      return;
    }

    if (message.type === 'DRAFT_STATE' && myPlayerNum === 2) {
      draftItems = Array.isArray(message.draftItems) ? message.draftItems.map(item => ({ ...item })) : [];
      draftTurn = Number(message.draftTurn) === 2 ? 2 : 1;
      renderDraftGrid();
      const remaining = draftItems.filter(item => !item.banned);
      if (remaining.length === 1) {
        window.currentWinner = remaining[0];
        showModal('Winner by Elimination!', remaining[0].title, remaining[0].detail);
      }
      return;
    }

    if (message.type === 'COMPLETE_DATE_REQUEST' && myPlayerNum === 1 && message.entry) {
      persistHistoryEntry(message.entry, true)
        .then(() => closeModal())
        .catch(error => { console.error('Could not save partner-completed date:', error); alert('Could not save the shared date history entry.'); });
      return;
    }

    if (message.type === 'HISTORY_ENTRY' && myPlayerNum === 2 && message.entry) {
      receiveHistoryEntry(message.entry).catch(error => console.error('Could not receive history entry:', error));
    }
  });

  connection.on('close', () => {
    if (connection !== conn) return;
    conn = null;
    remoteSubmitSent = false;
    const header = document.getElementById('matcherTurnHeader');
    if (header) header.textContent = 'Live room disconnected · Rejoin or continue on one device';
  });

  connection.on('error', error => console.error('Live-room data connection error:', error));
}

function handleMatchOutcome(mutual, isHost) {
  if (Array.isArray(mutual) && mutual.length > 0) {
    window.currentWinner = mutual[Math.floor(Math.random() * mutual.length)];
    showModal('It’s a Match!', window.currentWinner.title, window.currentWinner.detail);
  } else {
    window.currentWinner = null;
    showModal('No Direct Matches', 'Try Draft Mode!', 'You and your partner liked different ideas. Try Elimination Draft or start another Matcher round.');
  }
}

/* Start after the HTML has been parsed. */
async function loadAppData() {
  try {
    const settingsRecord = await db.settings.get('appSettings');
    if (settingsRecord?.value && typeof settingsRecord.value === 'object') {
      appSettings = {
        theme: ['dark', 'ocean'].includes(settingsRecord.value.theme) ? settingsRecord.value.theme : 'dark',
        feedback: ['both', 'sound', 'vibration', 'off'].includes(settingsRecord.value.feedback) ? settingsRecord.value.feedback : 'both'
      };
    }

    const customRecords = await db.customDeck.toArray();
    customDeck = customRecords.map(record => record.item).filter(item => item && typeof item === 'object');
    const deletedRecords = await db.deletedBuiltins.toArray();
    deletedBuiltins = new Set(deletedRecords.map(record => record.id));
    dateHistory = await db.history.orderBy('date').reverse().toArray();
    const unlockRecords = await db.unlocks.toArray();
    unlockedItems = unlockRecords.map(record => record.id).filter(id => expansionDecks[id]);

    const categoryRecord = await db.categories.get('selectedCats');
    selectedCategories = Array.isArray(categoryRecord?.values)
      ? categoryRecord.values.filter(value => DEFAULT_CATEGORIES.includes(value))
      : [...DEFAULT_CATEGORIES];
  } catch (error) {
    console.error('Some saved data could not be loaded; using defaults where possible:', error);
  }

  document.querySelectorAll('.category-choice').forEach(input => {
    input.checked = selectedCategories.includes(input.value);
  });
  const feedbackSelect = document.getElementById('feedbackSelect');
  if (feedbackSelect) feedbackSelect.value = appSettings.feedback;
  refreshDecks();
  initMatcher();
  initDraft();
  renderLibrary();
  renderHistory();
  renderStore();
  await applyTheme(appSettings.theme || 'dark');
}

window.addEventListener('DOMContentLoaded', () => {
  installSwipeGestures();
  loadAppData().catch(error => {
    console.error('App initialization failed:', error);
    alert('Date Night Decider could not finish loading. Refresh the page and check the browser console if the issue continues.');
  });
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('Service worker registration failed:', error));
  });
}
