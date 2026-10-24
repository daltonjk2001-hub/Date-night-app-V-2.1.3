/* Initialize Dexie.js Asynchronous Database */
const db = new Dexie('DateNightDatabase');
db.version(1).stores({
  settings: 'key',
  customDeck: '++id, id',
  deletedBuiltins: 'id',
  categories: 'id',
  history: '++id, date',
  unlocks: 'id'
});

/* Native Haptic Feedback Helper */
function triggerHaptic(type = 'light') {
  if (typeof appSettings !== 'undefined' && !['both','vibration'].includes(appSettings.feedback)) return;
  if (!navigator.vibrate) return;
  if (type === 'light') navigator.vibrate(15);
  else if (type === 'success') navigator.vibrate([40, 60, 40]);
  else if (type === 'heavy') navigator.vibrate(50);
}

const audioCtx = (() => { try { return new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { return null; } })();
function playSound(type) {
  if (typeof appSettings !== 'undefined' && !['both','sound'].includes(appSettings.feedback)) return;
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if(type === 'swipe') { osc.frequency.setValueAtTime(350, now); osc.frequency.exponentialRampToValueAtTime(120, now + .08); gain.gain.setValueAtTime(.12, now); gain.gain.linearRampToValueAtTime(.01, now + .08); osc.start(now); osc.stop(now + .08); }
  else if(type === 'ban') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(160, now); osc.frequency.exponentialRampToValueAtTime(70, now + .1); gain.gain.setValueAtTime(.15, now); gain.gain.linearRampToValueAtTime(.01, now + .1); osc.start(now); osc.stop(now + .1); }
  else if(type === 'win') { osc.type = 'triangle'; osc.frequency.setValueAtTime(523, now); osc.frequency.setValueAtTime(659, now + .1); osc.frequency.setValueAtTime(783, now + .2); gain.gain.setValueAtTime(.15, now); gain.gain.linearRampToValueAtTime(.01, now + .35); osc.start(now); osc.stop(now + .35); }
}

/* Master Deck with Streamlined Binary Budget */
const masterDeck = [
  { id:"baking-01", title:"Apple-Blackberry Lattice Pie", detail:"Make an all-butter pie dough from scratch, roll out a woven lattice top, and fill with fresh apple and blackberry.", category:"baking", budget:"paid", image:"url('./joe-dumas-89zuNmg6w0Y-unsplash.jpg')", placeId: "ChIJJ31N8XZ3hlQRk2Hs0Bv5-rk" },
  { id:"baking-02", title:"Cream Cheese Danish Batch", detail:"Make laminated pastry dough from scratch, fill with sweet cream cheese and fruit preserves, and bake until golden.", category:"baking", budget:"paid", image:"url('./masha-uu-cPgsmkZcgdU-unsplash.jpg')", placeId: "ChIJJ31N8XZ3hlQRk2Hs0Bv5-rk" },
  { id:"cooking-01", title:"Homemade Gourmet Pizza Night", detail:"Stretch homemade dough from scratch, layer with custom sauces, premium cheese, and your favorite toppings.", category:"cooking", budget:"paid", image:"url('./chad-montano-MqT0asuoIcU-unsplash.jpg')", placeId: "ChIJJ31N8XZ3hlQRk2Hs0Bv5-rk" },
  { id:"cooking-02", title:"Authentic Street Taco Bar", detail:"Prep slow-cooked carnitas or grilled chicken with homemade salsas, fresh cilantro, and warm corn tortillas.", category:"cooking", budget:"paid", image:"url('./jeswin-thomas-z_PfaGzeN9E-unsplash.jpg')", placeId: "ChIJJ31N8XZ3hlQRk2Hs0Bv5-rk" },
  { id:"gaming-01", title:"Cozy Split-Screen Co-Op", detail:"Load up a relaxing couch co-op video game and work together to build a shared virtual world or solve puzzles.", category:"gaming", budget:"free", image:"url('./jeshoots-com-eCktzGjC-iU-unsplash.jpg')", placeId: null },
  { id:"gaming-02", title:"Arcade High Score Showdown", detail:"Play classic arcade games or fast-paced party games and battle head-to-head for the top spot.", category:"gaming", budget:"paid", image:"url('./carl-raw-zvBT4eOtlkY-unsplash.jpg')", placeId: null },
  { id:"board-01", title:"Intense Strategy Board Game", detail:"Brew some coffee or tea, clear the table, and dive into a deep tabletop strategy or card drafting game.", category:"board games", budget:"free", image:"url('./karthik-balakrishnan-NrS53eUKgiE-unsplash.jpg')", placeId: null },
  { id:"board-02", title:"Fast-Paced Party Card Game", detail:"Pull out a hilarious casual card game for quick laughs and lighthearted competition.", category:"board games", budget:"free", image:"url('./ezequiel-garrido-5clsQK_QJgo-unsplash.jpg')", placeId: null },
  { id:"tv-01", title:"Nostalgic TV Show Pilot Night", detail:"Rewatch the pilot episodes of your favorite childhood TV series together.", category:"tv", budget:"free", image:"url('./ben-griffiths-J1FBR-U0cGg-unsplash.jpg')", placeId: null },
  { id:"tv-02", title:"Binge-Worthy Mystery Series", detail:"Stream the opening episodes of a gripping new thriller or mystery show.", category:"tv", budget:"free", image:"url('./elin-melaas-yUrnuI11rbA-unsplash.jpg')", placeId: null },
  { id:"movie-01", title:"First-Time Epic Adventure", detail:"Stream a critically acclaimed adventure or sci-fi movie that neither of you has ever seen.", category:"movie", budget:"free", image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')", placeId: null },
  { id:"movie-02", title:"Local Cinema Night Out", detail:"Get dressed up, grab buttery popcorn at the local movie theater, and catch the latest release.", category:"movie", budget:"paid", image:"url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')", placeId: "ChIJJ31N8XZ3hlQRk2Hs0Bv5-rk" }
];

let customDeck = [];
let deletedBuiltins = new Set();
let unlockedItems = [];
let dateHistory = [];
let appSettings = { theme: 'dark', feedback: 'both' };
let fullDeck = [];
let activeDeck = [];

/* Async Data Hydration from IndexedDB */
async function loadAppData() {
  try {
    const settingsRec = await db.settings.get('appSettings');
    if (settingsRec) appSettings = settingsRec.value;

    const customRecs = await db.customDeck.toArray();
    customDeck = customRecs.map(r => r.item);

    const deletedRecs = await db.deletedBuiltins.toArray();
    deletedBuiltins = new Set(deletedRecs.map(r => r.id));

    const historyRecs = await db.history.orderBy('date').reverse().toArray();
    dateHistory = historyRecs;

    const unlockRecs = await db.unlocks.toArray();
    unlockedItems = unlockRecs.map(r => r.id);

    const catRec = await db.categories.get('selectedCats');
    const savedCats = catRec ? catRec.values : ["baking", "cooking", "gaming", "board games", "tv", "movie"];
    document.querySelectorAll(".category-choice").forEach(inp => inp.checked = savedCats.includes(inp.value));

    refreshDecks();
    initMatcher();
    initDraft();
    renderLibrary();
    renderHistory();
    renderStore();
    applyTheme(appSettings.theme || 'dark');
    const fb = document.getElementById('feedbackSelect'); if(fb) fb.value = appSettings.feedback;
  } catch (err) {
    console.error('Error loading IndexedDB data:', err);
  }
}

/* Adaptive Recommendation Scoring */
function getCardScore(card) {
  let score = 5.0;
  const matches = dateHistory.filter(h => h.id === card.id || h.category === card.category);
  if (matches.length > 0) {
    const totalRating = matches.reduce((sum, h) => sum + ((Number(h.rating1) + Number(h.rating2)) / 2), 0);
    const avgRating = totalRating / matches.length;
    score += (avgRating - 3) * 2;
  }
  score += Math.random() * 0.5;
  return score;
}

function refreshDecks() {
  fullDeck = [...masterDeck.filter(item => !deletedBuiltins.has(item.id)), ...customDeck];
  const selectedCats = [...document.querySelectorAll(".category-choice:checked")].map(input => input.value);
  const budgetVal = document.getElementById("budgetFilter")?.value || "all";

  activeDeck = fullDeck.filter(item => {
    const matchesCat = selectedCats.includes(item.category);
    const matchesBudget = budgetVal === "all" || item.budget === budgetVal;
    return matchesCat && matchesBudget;
  });

  // Sort adaptively using scrapbook ratings & preferences
  activeDeck.sort((a, b) => getCardScore(b) - getCardScore(a));

  const summaryEl = document.getElementById("categorySummary");
  if (summaryEl) {
    summaryEl.textContent = selectedCats.length === 6 ? `All filters active (${activeDeck.length}) ▾` : `${selectedCats.length} filters active (${activeDeck.length}) ▾`;
  }
}
const shuffle = a => { for(let i=a.length-1; i>0; i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

async function applyCategoryFilter() {
  const selected = [...document.querySelectorAll(".category-choice:checked")].map(input => input.value);
  await db.categories.put({ id: 'selectedCats', values: selected });
  refreshDecks();
  initMatcher(); initDraft();
  if (document.getElementById("card-library")?.classList.contains("active-mode")) renderLibrary();
}

function setAllCategories(checked) {
  document.querySelectorAll(".category-choice").forEach(input => input.checked = checked);
  applyCategoryFilter();
}

function switchGame(mode, button) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.game-card').forEach(c => c.classList.remove('active-mode'));
  button.classList.add('active');
  document.getElementById(`card-${mode}`).classList.add('active-mode');
  if(mode === 'matcher') initMatcher();
  if(mode === 'draft') initDraft();
  if(mode === 'library') renderLibrary();
  if(mode === 'history') renderHistory();
  if(mode === 'store') renderStore();
}

document.addEventListener('click', (e) => {
  const picker = document.getElementById('categoryPicker');
  if (picker && picker.open && !picker.contains(e.target)) picker.open = false;
});

/* MATCHER & REMOTE MULTIPLAYER SYNC */
let p1Deck = [], p2Deck = [], p1Likes = [], p2Likes = [], swipePlayer = 1, swipeIndex = 0;
let remoteSocket = null;
let remoteRoomId = null;
let myPlayerNum = 1;

function connectRemoteSession() {
  const code = prompt("Enter shared couple room code (e.g., 'date-1234'):");
  if (!code) return;
  
  remoteRoomId = code;
  remoteSocket = io('https://your-backend-url.com'); // Replace with your deployed server URL

  remoteSocket.emit('join-room', remoteRoomId);

  remoteSocket.on('assigned-player', (num) => {
    myPlayerNum = num;
    alert(`Connected as Player ${num}! Swipe your deck normally; results will sync when both finish.`);
  });

  remoteSocket.on('match-results', (mutualMatches) => {
    if (mutualMatches.length > 0) {
      window.currentWinner = mutualMatches[Math.floor(Math.random() * mutualMatches.length)];
      showModal("Remote Match Found!", window.currentWinner.title, window.currentWinner.detail);
    } else {
      showModal("No Direct Remote Matches", "Try Draft Mode!", "You and your partner swiped differently from afar!");
    }
  });
}

function initMatcher() {
  p1Deck = shuffle([...activeDeck]); p2Deck = shuffle([...activeDeck]);
  p1Likes = []; p2Likes = []; swipePlayer = 1; swipeIndex = 0;
  updateSwipeCard();
}
function updateSwipeCard() {
  const curDeck = swipePlayer === 1 ? p1Deck : p2Deck;
  const header = document.getElementById("matcherTurnHeader");
  const cardEl = document.getElementById("swipeCard");
  const metaEl = document.getElementById("cardMeta");
  const disclosureEl = document.getElementById("ftcDisclosureBanner");
  if (!header || !cardEl) return;
  if (!curDeck.length) {
    header.textContent = "No ideas available";
    cardEl.style.backgroundImage = "none";
    document.getElementById("cardCategory").textContent = "Empty";
    document.getElementById("cardTitle").textContent = "Select filters above";
    document.getElementById("cardDetail").textContent = "Choose at least one filter to view date ideas.";
    if (metaEl) metaEl.innerHTML = "";
    if (disclosureEl) disclosureEl.style.display = "none";
    return;
  }
  header.textContent = remoteRoomId ? `Remote Room (${remoteRoomId}) · Card ${Math.min(swipeIndex + 1, curDeck.length)}` : `Player ${swipePlayer}'s Turn · Card ${Math.min(swipeIndex + 1, curDeck.length)} of ${curDeck.length}`;
  
  if(swipeIndex >= curDeck.length) {
    if (remoteRoomId && remoteSocket) {
      remoteSocket.emit('submit-swipe', { roomId: remoteRoomId, player: myPlayerNum, likedCards: p1Likes });
      header.textContent = "Waiting for partner's swipes...";
      return;
    }

    if(swipePlayer === 1) { swipePlayer = 2; swipeIndex = 0; alert("Player 1 complete! Pass phone to Player 2."); updateSwipeCard(); }
    else {
      const mutual = p1Likes.filter(a => p2Likes.some(b => b.id === a.id));
      if(mutual.length) { 
        const match = mutual[Math.floor(Math.random() * mutual.length)]; 
        window.currentWinner = match; 
        showModal("It's a Match!", match.title, match.detail);
      }
      else showModal("No Direct Matches", "Try Draft Mode!", "You swiped differently! Hop into Elimination Draft to settle it.");
    }
    return;
  }
  const item = curDeck[swipeIndex];
  cardEl.style.backgroundImage = item.image;
  document.getElementById("cardCategory").textContent = item.category;
  document.getElementById("cardTitle").textContent = item.title;
  document.getElementById("cardDetail").textContent = item.detail;
  if (metaEl) {
    metaEl.innerHTML = `
      <span class="meta-pill">💰 ${item.budget === 'free' ? 'Free' : 'Costs Money / Ingredients'}</span>
    `;
  }
  if (disclosureEl) {
    disclosureEl.style.display = item.placeId ? "block" : "none";
  }
}
function handleSwipe(liked) {
  const curDeck = remoteRoomId ? p1Deck : (swipePlayer === 1 ? p1Deck : p2Deck);
  if (swipeIndex >= curDeck.length) return;
  playSound('swipe');
  triggerHaptic('light');
  if(liked) (remoteRoomId ? p1Likes : (swipePlayer === 1 ? p1Likes : p2Likes)).push(curDeck[swipeIndex]);
  swipeIndex++; updateSwipeCard();
}

/* Velocity-Enhanced Touch Gesture Calculation */
let isDragging = false, startX = 0, currentX = 0, startTime = 0;
const swipeCardEl = document.getElementById('swipeCard');
if (swipeCardEl) {
  swipeCardEl.addEventListener('mousedown', dragStart);
  swipeCardEl.addEventListener('touchstart', dragStart, { passive: true });
  function dragStart(e) {
    const curActiveDeck = remoteRoomId ? p1Deck : (swipePlayer === 1 ? p1Deck : p2Deck);
    if (swipeIndex >= curActiveDeck.length) return;
    isDragging = true; 
    startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    startTime = performance.now();
    swipeCardEl.style.transition = 'none';
    window.addEventListener('mousemove', dragMove); window.addEventListener('mouseup', dragEnd);
    window.addEventListener('touchmove', dragMove, { passive: true }); window.addEventListener('touchend', dragEnd);
  }
  function dragMove(e) {
    if (!isDragging) return;
    currentX = (e.type.includes('mouse') ? e.clientX : e.touches[0].clientX) - startX;
    swipeCardEl.style.transform = `translateX(${currentX}px) rotate(${currentX * 0.04}deg)`;
  }
  function dragEnd() {
    if (!isDragging) return;
    isDragging = false;
    window.removeEventListener('mousemove', dragMove); window.removeEventListener('mouseup', dragEnd);
    window.removeEventListener('touchmove', dragMove); window.removeEventListener('touchend', dragEnd);
    swipeCardEl.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    const timeElapsed = (performance.now() - startTime) / 1000;
    const velocityX = Math.abs(currentX / (timeElapsed || 0.001));
    const effectiveThreshold = velocityX > 400 ? 40 : 80;

    if (currentX > effectiveThreshold) { 
      triggerHaptic('light'); 
      swipeCardEl.style.transform = 'translateX(350px) rotate(25deg)'; 
      swipeCardEl.style.opacity = '0'; 
      setTimeout(() => { handleSwipe(true); resetCard(); }, 250); 
    }
    else if (currentX < -effectiveThreshold) { 
      triggerHaptic('light'); 
      swipeCardEl.style.transform = 'translateX(-350px) rotate(-25deg)'; 
      swipeCardEl.style.opacity = '0'; 
      setTimeout(() => { handleSwipe(false); resetCard(); }, 250); 
    }
    else { 
      swipeCardEl.style.transform = 'translateX(0) rotate(0)'; 
    }
    currentX = 0;
  }
  function resetCard() { swipeCardEl.style.transform = 'translateX(0) rotate(0)'; swipeCardEl.style.opacity = '1'; }
}

/* DRAFT */
let draftItems = [], draftTurn = 1;
function initDraft() {
  draftItems = shuffle([...activeDeck]).slice(0, Math.min(8, activeDeck.length)).map(x => ({ ...x, banned:false }));
  draftTurn = 1; renderDraftGrid();
}
function renderDraftGrid() {
  const headerEl = document.getElementById("draftTurnHeader");
  if (headerEl) headerEl.textContent = `Player ${draftTurn}'s Turn`;
  const grid = document.getElementById("draftGrid"); if (!grid) return;
  grid.innerHTML = "";
  if (!draftItems.length) { grid.innerHTML = '<div class="library-summary" style="grid-column:1/-1;text-align:center;">No ideas available. Select filters above.</div>'; return; }
  draftItems.forEach((item, idx) => {
    const tile = document.createElement("button");
    tile.className = `draft-tile ${item.banned ? 'banned' : ''}`;
    tile.style.backgroundImage = item.image;
    tile.innerHTML = `<div class="title">${item.title}</div><div class="cat">${item.category}</div>`;
    tile.disabled = item.banned;
    if(!item.banned) tile.onclick = () => banItem(idx);
    grid.appendChild(tile);
  });
}
function banItem(idx) {
  if (!draftItems[idx] || draftItems[idx].banned) return;
  playSound('ban'); triggerHaptic('heavy');
  draftItems[idx].banned = true;
  const remaining = draftItems.filter(i => !i.banned);
  if(remaining.length === 1) { 
    window.currentWinner = remaining[0]; 
    showModal("Winner by Elimination!", remaining[0].title, remaining[0].detail); 
  } else { draftTurn = draftTurn === 1 ? 2 : 1; renderDraftGrid(); }
}

/* SURPRISE */
function surpriseMe() {
  let pool = activeDeck;
  const mode = document.getElementById('surpriseMode')?.value || 'all';
  if(mode === 'new') pool = pool.filter(x => !dateHistory.some(h => h.id === x.id));
  if(!pool.length) { showModal("No Matching Dates", "Try selecting more filters", "There are no ideas matching your active filters."); return; }
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  window.currentWinner = chosen;
  showModal("Your Surprise Date", chosen.title, chosen.detail);
}

/* LIBRARY */
function renderLibrary() {
  const query = document.getElementById("librarySearch")?.value.trim().toLowerCase() || "";
  const category = document.getElementById("libraryCategory")?.value || "all";
  const listEl = document.getElementById("libraryList");
  const summaryEl = document.getElementById("librarySummary");
  if (!listEl) return;
  let items = fullDeck.filter(item => (category === "all" || item.category === category) && (!query || `${item.title} ${item.detail}`.toLowerCase().includes(query)));
  if (summaryEl) summaryEl.textContent = `${fullDeck.length} total ideas · Showing ${items.length}`;
  listEl.innerHTML = items.length ? "" : '<div class="library-summary">No ideas match your search.</div>';
  items.forEach(item => {
    const card = document.createElement("article"); card.className = "library-item";
    card.innerHTML = `<div class="library-category">${item.category}</div><div class="library-title">${item.title}</div><div class="library-detail">${item.detail}</div>`;
    listEl.appendChild(card);
  });
}

/* STORE */
const storeCatalog = [
  { id: "pack-cozy", title: "Cozy Nights In Pack", type: "deck", price: "$1.99", desc: "15 intimate indoor date ideas and slow-paced recipes.", image: "url('./chad-montano-MqT0asuoIcU-unsplash.jpg')" },
  { id: "pack-adventure", title: "Outdoor Adventure Pack", type: "deck", price: "$1.99", desc: "Thrilling outdoor excursions and exploration challenges.", image: "url('./felipe-bustillo-4VDRCoNuvE0-unsplash.jpg')" },
  { id: "theme-royal", title: "Royal Purple Theme", type: "theme", price: "$0.99", desc: "Exclusive luxury dark theme styling for your app.", image: "none" }
];

function renderStore() {
  const grid = document.getElementById("storeGrid");
  const summary = document.getElementById("storeSummary");
  if (!grid) return;
  
  if (summary) summary.textContent = `${storeCatalog.length} items available · ${unlockedItems.length} unlocked`;
  grid.innerHTML = "";

  storeCatalog.forEach(item => {
    const isUnlocked = unlockedItems.includes(item.id);
    const card = document.createElement("article");
    card.className = "library-item store-tile";
    card.style.backgroundImage = item.image !== "none" ? item.image : "none";
    
    card.innerHTML = `
      <div class="library-category">${item.type.toUpperCase()} · ${item.price}</div>
      <div class="library-title">${item.title}</div>
      <div class="library-detail">${item.desc}</div>
      <button class="primary-btn ${isUnlocked ? 'secondary-action-btn' : ''}" style="margin-top:10px; padding:8px 12px; font-size:0.8rem;" onclick="handleStoreAction('${item.id}')">
        ${isUnlocked ? '✅ Unlocked' : `Unlock for ${item.price}`}
      </button>
    `;
    grid.appendChild(card);
  });
}

async function handleStoreAction(itemId) {
  if (unlockedItems.includes(itemId)) {
    alert("You already own this item!");
    return;
  }
  const confirmUnlock = confirm("Simulate successful StoreKit / Google Play Billing transaction?");
  if (confirmUnlock) {
    unlockedItems.push(itemId);
    await db.unlocks.put({ id: itemId });
    triggerHaptic('success');
    renderStore();
    alert("Item unlocked successfully!");
  }
}

function renderTracker() {
  const goalLabel = document.getElementById('dateGoalStatus');
  const goalBar = document.getElementById('dateGoalBar');
  if (!goalBar || !goalLabel) return;
  const now = new Date();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
  startOfWeek.setHours(0, 0, 0, 0);
  const datesThisWeek = dateHistory.filter(h => new Date(h.date) >= startOfWeek).length;
  goalLabel.textContent = `${datesThisWeek} / 1 Done`;
  goalBar.style.width = `${Math.min(100, (datesThisWeek / 1) * 100)}%`;
}

function renderAnalyticsDashboard() {
  const dash = document.getElementById('analyticsDashboard');
  if (!dash) return;
  if (!dateHistory.length) { dash.innerHTML = ''; return; }
  let sum = 0, count = 0;
  dateHistory.forEach(h => { if(h.rating1) {sum+=Number(h.rating1); count++;} if(h.rating2) {sum+=Number(h.rating2); count++;} });
  const avg = count ? (sum/count).toFixed(1) : '5.0';
  dash.innerHTML = `<div class="stats-card"><div class="stats-grid"><div class="stat-box"><div class="val">${dateHistory.length}</div><div class="lbl">Completed</div></div><div class="stat-box"><div class="val">⭐ ${avg}</div><div class="lbl">Rating</div></div></div></div>`;
}

function renderHistory() {
  renderAnalyticsDashboard();
  renderTracker();
  const list = document.getElementById('historyList'); const stats = document.getElementById('historyStats');
  if (!list) return; list.innerHTML = '';
  if (stats) stats.textContent = `${dateHistory.length} completed dates in scrapbook`;
  if (!dateHistory.length) { list.innerHTML = '<div class="library-summary">No dates logged yet. Complete a date to build your scrapbook!</div>'; return; }
  dateHistory.forEach((h, i) => {
    const row = document.createElement('article'); row.className = 'library-item';
    row.innerHTML = `<div class="library-category">${h.category} · ${new Date(h.date).toLocaleDateString()}</div><div class="library-title">${h.title}</div><div class="library-detail">${h.note || h.detail}</div>`;
    list.appendChild(row);
  });
}

async function applyTheme(theme) {
  appSettings.theme = ['dark','ocean'].includes(theme) ? theme : 'dark';
  document.documentElement.dataset.theme = appSettings.theme === 'dark' ? '' : appSettings.theme;
  await db.settings.put({ key: 'appSettings', value: appSettings });
  const el = document.getElementById('themeSelect'); if (el) el.value = appSettings.theme;
}

async function saveFeedbackSettings(val) {
  appSettings.feedback = val;
  await db.settings.put({ key: 'appSettings', value: appSettings });
}

function shareCurrentDate() {
  const item = window.currentWinner;
  if (!item) { alert('Choose an idea first.'); return; }
  const text = `💞 Date Night Decider: ${item.title}\n${item.detail}`;
  if (navigator.share) navigator.share({title: item.title, text}).catch(()=>{});
  else prompt('Copy date idea:', text);
}

function exportBackup() {
  const data = { version: 18, customDeck, deletedBuiltins: [...deletedBuiltins], dateHistory, settings: appSettings, unlockedItems };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'date-night-backup.json'; a.click(); URL.revokeObjectURL(url);
}

function importBackupFile(e) {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const d = JSON.parse(reader.result);
      if (d.dateHistory) {
        await db.history.clear();
        await db.history.bulkAdd(d.dateHistory);
        dateHistory = d.dateHistory;
      }
      if (d.unlockedItems) {
        await db.unlocks.clear();
        await db.unlocks.bulkAdd(d.unlockedItems.map(id => ({ id })));
        unlockedItems = d.unlockedItems;
      }
      renderHistory(); renderStore(); alert('Backup restored successfully!');
    } catch(err) { alert('Invalid backup file.'); }
  };
  reader.readAsText(file); e.target.value = '';
}

function triggerConfetti() {
  const canvas = document.getElementById("confettiCanvas");
  if (!canvas) return;
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  const particles = Array.from({length:50}, () => ({x:canvas.width/2, y:canvas.height/2, vx:(Math.random()-.5)*10, vy:(Math.random()-.5)*10-2, color:["#ff3b6c","#f6c941","#ffffff"][Math.floor(Math.random()*3)], size:Math.random()*5+3, life:80}));
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); let alive = false;
    particles.forEach(p => { if(p.life > 0) { p.x+=p.vx; p.y+=p.vy; p.vy+=.2; p.life--; alive=true; ctx.fillStyle=p.color; ctx.fillRect(p.x, p.y, p.size, p.size); } });
    if(alive) requestAnimationFrame(render);
  }
  render();
}

function showModal(eyebrow, title, detail) {
  playSound('win'); triggerHaptic('success'); triggerConfetti();
  document.getElementById("modalEyebrow").textContent = eyebrow;
  document.getElementById("modalIdeaName").textContent = title;
  document.getElementById("modalIdeaDetail").textContent = detail;
  document.getElementById("decisionModal").classList.add("show");
}
function closeModal() { document.getElementById("decisionModal").classList.remove("show"); initMatcher(); initDraft(); }

async function completeCurrentDate() {
  const item = window.currentWinner;
  if (!item) { closeModal(); return; }
  const r1 = prompt('Player 1 rating (1–5):', '5'); if(r1===null) return;
  const r2 = prompt('Player 2 rating (1–5):', '5'); if(r2===null) return;
  const note = prompt('Add a memory note (optional):', '') || '';
  
  const newEntry = { id: item.id, title: item.title, category: item.category, detail: item.detail, date: new Date().toISOString(), rating1: Number(r1)||5, rating2: Number(r2)||5, note };
  
  await db.history.add(newEntry);
  dateHistory.unshift(newEntry);
  
  renderHistory(); 
  closeModal();
}

function downloadCalendarEvent() {
  const item = window.currentWinner;
  if (!item) return;
  const now = new Date(); now.setHours(19, 0, 0, 0);
  const start = now.toISOString().replace(/-|:|\.\d+/g, '');
  now.setHours(21, 0, 0, 0);
  const end = now.toISOString().replace(/-|:|\.\d+/g, '');
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',`SUMMARY:Date: ${item.title}`,`DESCRIPTION:${item.detail}`,`DTSTART:${start}`,`DTEND:${end}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' >> 0 });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'date.ics'; a.click();
}

/* Run App Initialization on Load */
window.addEventListener('DOMContentLoaded', () => {
  loadAppData();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(()=>{}));
}
