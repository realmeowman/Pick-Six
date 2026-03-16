(function () {
  'use strict';

const MAX_ATTEMPTS = 6;
const ROUND_SIZES = [25, 50, 75, 100];

const SPORTS = {
  mlb: {
    key: 'mlb',
    criteriaKeys: ['league', 'division', 'team', 'position', 'age', 'number'],
    labels: { league: 'League', division: 'Division', team: 'Team', position: 'Position', age: 'Age', number: 'Number' },
    numericKeys: ['age', 'number'],
    lowerIsBetter: {},
    closeThreshold: { age: 3, number: 9 },
    hasFilters: true,
  },
  golf: {
    key: 'golf',
    criteriaKeys: ['country', 'sponsor', 'age', 'pgaWins', 'majorWins', 'worldRank'],
    labels: { country: 'Country', sponsor: 'Sponsor', age: 'Age', pgaWins: 'PGA Tour Wins', majorWins: 'Major Wins', worldRank: 'World Rank' },
    numericKeys: ['age', 'pgaWins', 'majorWins', 'worldRank'],
    lowerIsBetter: { worldRank: true },
    closeThreshold: { age: 3, pgaWins: 5, majorWins: 2, worldRank: 15 },
    hasFilters: true,
  },
  nba: {
    key: 'nba',
    criteriaKeys: ['league', 'division', 'team', 'position', 'height', 'rings'],
    labels: {
      league: 'Conference',
      division: 'Division',
      team: 'Team',
      position: 'Position',
      height: 'Height',
      rings: 'Rings',
    },
    numericKeys: ['height', 'rings'],
    lowerIsBetter: {},
    closeThreshold: { height: 3, rings: 1 },
    hasFilters: true,
  },
  nfl: {
    key: 'nfl',
    criteriaKeys: ['league', 'division', 'team', 'position', 'height', 'rings'],
    labels: {
      league: 'Conference',
      division: 'Division',
      team: 'Team',
      position: 'Position',
      height: 'Height',
      rings: 'Rings',
    },
    numericKeys: ['height', 'rings'],
    lowerIsBetter: {},
    closeThreshold: { height: 2, rings: 1 },
    hasFilters: true,
  },
};

let currentSport = 'mlb';
let players = [];
let revealedCriteria = new Set();
let exactRevealedCriteria = new Set();
let revealedQuality = {};
let answer = null;
let attemptsLeft = MAX_ATTEMPTS;
let bonusClueUnlocked = false;
let guesses = [];
let gameStartTime = null;
let filtersUsedThisGame = false;
let legendsMode = false;
let currentRound = 1;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

let timerInterval = null;

const elements = {
  guessSelect: () => $('#guessSelect'),
  guessBtn: () => $('#guessBtn'),
  bonusClueBtn: () => $('#bonusClueBtn'),
  bonusClue: () => $('#bonusClue'),
  message: () => $('#message'),
  clueGridMlb: () => $('#clueGridMlb'),
  clueGridGolf: () => $('#clueGridGolf'),
  clueGridNba: () => $('#clueGridNba'),
  clueGridNfl: () => $('#clueGridNfl'),
  attempts: () => $('#attemptCount'),
  timer: () => $('#timer'),
  wrongGuessesList: () => $('#wrongGuessesList'),
  newGameBtn: () => $('#newGameBtn'),
  leagueFilter: () => $('#leagueFilter'),
  teamFilter: () => $('#teamFilter'),
  countryFilter: () => $('#countryFilter'),
  sponsorFilter: () => $('#sponsorFilter'),
  filtersContainer: () => $('#filtersContainer'),
  filtersMlb: () => $('#filtersMlb'),
  filtersGolf: () => $('#filtersGolf'),
  filtersNba: () => $('#filtersNba'),
  filtersNfl: () => $('#filtersNfl'),
  nbaConferenceFilter: () => $('#nbaConferenceFilter'),
  nbaTeamFilter: () => $('#nbaTeamFilter'),
  nflConferenceFilter: () => $('#nflConferenceFilter'),
  nflTeamFilter: () => $('#nflTeamFilter'),
  gameOver: () => $('#gameOver'),
  gameOverTitle: () => $('#gameOverTitle'),
  gameOverText: () => $('#gameOverText'),
  playAgainBtn: () => $('#playAgainBtn'),
  streak: () => $('#streak'),
  sportIcon: () => $('#sportIcon'),
  tagline: () => $('#tagline'),
  roundLabel: () => $('#roundLabel'),
};

function getSportConfig() {
  return SPORTS[currentSport];
}

function getBasePlayers(sport = currentSport) {
  if (sport === 'golf' && typeof GOLF_PLAYER_DATA !== 'undefined') return GOLF_PLAYER_DATA;
  if (sport === 'mlb' && typeof PLAYER_DATA !== 'undefined') return PLAYER_DATA;
  if (sport === 'nba' && typeof NBA_PLAYER_DATA !== 'undefined') return NBA_PLAYER_DATA;
  if (sport === 'nfl' && typeof NFL_PLAYER_DATA !== 'undefined') return NFL_PLAYER_DATA;
  return [];
}

function getPlayersForRound(sport = currentSport, round = currentRound) {
  const base = getBasePlayers(sport) || [];
  if (!base.length) return [];
  const clampedRound = Math.max(1, Math.min(round, ROUND_SIZES.length));
  const size = Math.min(ROUND_SIZES[clampedRound - 1], base.length);
  return base.slice(0, size);
}

function getPlayers() {
  return getPlayersForRound();
}

function getClueGrid() {
  if (currentSport === 'golf') return elements.clueGridGolf();
  if (currentSport === 'nba') return elements.clueGridNba();
  if (currentSport === 'nfl') return elements.clueGridNfl();
  return elements.clueGridMlb();
}

const STREAK_KEYS = {
  mlb: 'pickSixStreak_mlb',
  golf: 'pickSixStreak_golf',
  nba: 'pickSixStreak_nba',
  nfl: 'pickSixStreak_nfl',
};

function getStreakKey(sport = currentSport) {
  return STREAK_KEYS[sport] || 'pickSixStreak';
}

function getStreak(sport = currentSport) {
  const key = getStreakKey(sport);
  try {
    return parseInt(localStorage.getItem(key) || '0', 10);
  } catch (_) { return 0; }
}

function setStreak(n, sport = currentSport) {
  const key = getStreakKey(sport);
  try { localStorage.setItem(key, String(n)); } catch (_) {}
}

function updateStreakDisplay() {
  const streak = getStreak(currentSport);
  elements.streak().textContent = streak > 0 ? '🏆'.repeat(streak) : '';
  if (streak > 0) {
    const sportLabels = { mlb: 'MLB', golf: 'golf', nba: 'NBA', nfl: 'NFL' };
    const sportLabel = sportLabels[currentSport] || 'MLB';
    elements.streak().ariaLabel = `${streak} win streak in ${sportLabel}`;
  } else {
    elements.streak().ariaLabel = 'Win streak';
  }
}

const TAGLINES = {
  mlb: 'Find the mystery player using 6 clues. 6 guesses.',
  golf: 'Find the mystery player using 6 clues. 6 guesses.',
  nba: 'Find the mystery hooper using 6 clues. 6 guesses.',
  nfl: 'Find the mystery player using 6 clues. 6 guesses.',
};

const SPORT_ICONS = {
  mlb: '⚾',
  golf: '⛳',
  nba: '🏀',
  nfl: '🏈',
};

function updateHeaderForSport() {
  if (elements.tagline()) {
    elements.tagline().textContent = TAGLINES[currentSport] || 'Find the mystery player using 6 clues. 6 guesses.';
  }
  if (elements.sportIcon()) {
    elements.sportIcon().textContent = SPORT_ICONS[currentSport] || '⚾';
    const ariaLabels = { mlb: 'MLB mode', golf: 'Golf mode', nba: 'NBA mode', nfl: 'NFL mode' };
    elements.sportIcon().setAttribute('aria-label', ariaLabels[currentSport] || 'MLB mode');
  }
}

function updateRoundDisplay() {
  const label = elements.roundLabel();
  if (!label) return;
  label.textContent = `Round ${currentRound}`;
}

function normalizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\.]/g, '');
}

function findPlayer(name) {
  const n = normalizeName(name);
  return players.find(p => normalizeName(p.name) === n);
}

function getFilteredPlayers() {
  const cfg = getSportConfig();
  const guessedSet = new Set(guesses);
  if (!cfg.hasFilters || legendsMode) {
    return players.filter(p => !guessedSet.has(p.name));
  }
  if (currentSport === 'mlb') {
    const league = elements.leagueFilter().value;
    const team = elements.teamFilter().value;
    return players.filter(p => {
      if (guessedSet.has(p.name)) return false;
      if (league && p.league !== league) return false;
      if (team && p.team !== team) return false;
      return true;
    });
  }
  if (currentSport === 'nba') {
    const conf = elements.nbaConferenceFilter().value;
    const team = elements.nbaTeamFilter().value;
    return players.filter(p => {
      if (guessedSet.has(p.name)) return false;
      if (conf && p.league !== conf) return false;
      if (team && p.team !== team) return false;
      return true;
    });
  }
  if (currentSport === 'nfl') {
    const conf = elements.nflConferenceFilter().value;
    const team = elements.nflTeamFilter().value;
    return players.filter(p => {
      if (guessedSet.has(p.name)) return false;
      if (conf && p.league !== conf) return false;
      if (team && p.team !== team) return false;
      return true;
    });
  }
  const country = elements.countryFilter().value;
  const sponsor = elements.sponsorFilter().value;
  return players.filter(p => {
    if (guessedSet.has(p.name)) return false;
    if (country && p.country !== country) return false;
    if (sponsor && p.sponsor !== sponsor) return false;
    return true;
  });
}

function populateTeamFilter() {
  if (currentSport !== 'mlb') return;
  const league = elements.leagueFilter().value;
  const teamSel = elements.teamFilter();
  let teams = [...new Set(players.map(p => p.team))].sort();
  if (league) teams = [...new Set(players.filter(p => p.league === league).map(p => p.team))].sort();
  const currentTeam = teamSel.value;
  teamSel.innerHTML = '<option value="">All</option>' +
    teams.map(t => `<option value="${escapeHtml(t)}" ${t === currentTeam ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
}

function populateGolfFilters() {
  if (currentSport !== 'golf') return;
  const countrySel = elements.countryFilter();
  const sponsorSel = elements.sponsorFilter();
  const currentCountry = countrySel.value;
  const currentSponsor = sponsorSel.value;
  const countries = [...new Set(players.map(p => p.country))].sort();
  const sponsors = [...new Set(players.map(p => p.sponsor))].sort();
  countrySel.innerHTML = '<option value="">All</option>' +
    countries.map(c => `<option value="${escapeHtml(c)}" ${c === currentCountry ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  sponsorSel.innerHTML = '<option value="">All</option>' +
    sponsors.map(s => `<option value="${escapeHtml(s)}" ${s === currentSponsor ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('');
}

function formatHeight(inches) {
  if (inches == null || isNaN(inches)) return '—';
  const ft = Math.floor(inches / 12);
  const in_ = Math.round(inches % 12);
  return `${ft}'${in_}"`;
}

function populateNbaFilters() {
  if (currentSport !== 'nba') return;
  const confSel = elements.nbaConferenceFilter();
  const teamSel = elements.nbaTeamFilter();
  const currentConf = confSel.value;
  const currentTeam = teamSel.value;
  const conferences = [...new Set(players.map(p => p.league))].sort();
  let teams = [...new Set(players.map(p => p.team))].sort();
  if (currentConf) teams = [...new Set(players.filter(p => p.league === currentConf).map(p => p.team))].sort();
  confSel.innerHTML = '<option value="">All</option>' +
    conferences.map(c => `<option value="${escapeHtml(c)}" ${c === currentConf ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  teamSel.innerHTML = '<option value="">All</option>' +
    teams.map(t => `<option value="${escapeHtml(t)}" ${t === currentTeam ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
}

function populateNflFilters() {
  if (currentSport !== 'nfl') return;
  const confSel = elements.nflConferenceFilter();
  const teamSel = elements.nflTeamFilter();
  const currentConf = confSel.value;
  const currentTeam = teamSel.value;
  const conferences = [...new Set(players.map(p => p.league))].sort();
  let teams = [...new Set(players.map(p => p.team))].sort();
  if (currentConf) teams = [...new Set(players.filter(p => p.league === currentConf).map(p => p.team))].sort();
  confSel.innerHTML = '<option value="">All</option>' +
    conferences.map(c => `<option value="${escapeHtml(c)}" ${c === currentConf ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  teamSel.innerHTML = '<option value="">All</option>' +
    teams.map(t => `<option value="${escapeHtml(t)}" ${t === currentTeam ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
}

function populateSelect() {
  const filtered = getFilteredPlayers();
  const sel = elements.guessSelect();
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">-- Choose a player --</option>' +
    sorted.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('');
  if (currentVal && filtered.some(p => p.name === currentVal)) sel.value = currentVal;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function getAnswerVal(key) {
  const cfg = getSportConfig();
  if (key === 'height') return formatHeight(answer.height);
  if (cfg.numericKeys.includes(key)) return String(answer[key]);
  return answer[key];
}

const audioCtx = typeof AudioContext !== 'undefined' ? new (window.AudioContext || window.webkitAudioContext)() : null;

function playSound(type) {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
  if (type === 'success') {
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.05);
    osc.type = 'sine';
  } else {
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.type = 'sawtooth';
  }
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + 0.15);
}

function resetClueSlots() {
  revealedCriteria.clear();
  exactRevealedCriteria.clear();
  revealedQuality = {};
  const cfg = getSportConfig();
  const grid = getClueGrid();
  cfg.criteriaKeys.forEach(key => {
    const slot = $(`[data-key="${key}"]`, grid);
    if (!slot) return;
    const valEl = slot.querySelector('.clue-value');
    const hiddenEl = slot.querySelector('.clue-hidden');
    if (valEl && hiddenEl) {
      valEl.classList.add('hidden');
      valEl.querySelector('.value-text').textContent = '';
      hiddenEl.classList.remove('hidden');
    }
  });
}

function getNumericDisplay(key, guessVal, ansVal) {
  const cfg = getSportConfig();
  const g = Number(guessVal) || 0;
  const a = Number(ansVal) || 0;
  const diff = Math.abs(a - g);
  const closeThreshold = cfg.closeThreshold[key] ?? 5;
  const lowerBetter = cfg.lowerIsBetter[key];
  const close = diff > 0 && diff <= closeThreshold;
  const far = diff > closeThreshold;

  const fmt = key === 'height' ? v => formatHeight(v) : v => String(v);
  if (g === a) return { text: fmt(a), hint: 'correct' };
  let arrow;
  if (lowerBetter) {
    arrow = a < g ? ' ↓' : ' ↑';
  } else {
    arrow = a > g ? ' ↑' : ' ↓';
  }
  const tilde = close ? ' ~' : '';
  return {
    text: `${fmt(g)}${arrow}${tilde}`,
    hint: close ? 'close' : 'far',
  };
}

function revealClue(key, guess, forceVal) {
  const grid = getClueGrid();
  const slot = $(`[data-key="${key}"]`, grid);
  if (!slot) return;
  const valEl = slot.querySelector('.clue-value');
  const hiddenEl = slot.querySelector('.clue-hidden');
  if (!valEl || !hiddenEl) return;

  const cfg = getSportConfig();
  const isNumeric = cfg.numericKeys.includes(key);

  let text;
  let hint = null;

  if (isNumeric && guess) {
    if (exactRevealedCriteria.has(key)) return;
    const result = getNumericDisplay(key, guess[key], answer[key]);
    text = result.text;
    hint = result.hint;
    revealedCriteria.add(key);
    revealedQuality[key] = result.hint === 'correct' ? 'full' : result.hint === 'close' ? 'close' : 'far';
    if (result.hint === 'correct') exactRevealedCriteria.add(key);
  } else if (forceVal !== undefined) {
    text = String(forceVal);
    revealedCriteria.add(key);
    revealedQuality[key] = 'full';
  } else if (!revealedCriteria.has(key)) {
    revealedCriteria.add(key);
    revealedQuality[key] = 'full';
    text = getAnswerVal(key);
  } else return;

  valEl.querySelector('.value-text').textContent = text;
  valEl.classList.remove('value-correct', 'value-close', 'value-far');
  if (hint) valEl.classList.add('value-' + hint);
  valEl.classList.remove('hidden');
  valEl.classList.add('reveal-pop');
  hiddenEl.classList.add('hidden');
}

function clearSlotHighlight() {
  const cfg = getSportConfig();
  const grid = getClueGrid();
  cfg.criteriaKeys.forEach(key => {
    const slot = $(`[data-key="${key}"]`, grid);
    if (slot) slot.classList.remove('checking', 'check-hit', 'check-miss');
  });
}

function processGuessReveals(guess, onComplete) {
  const cfg = getSportConfig();
  let i = 0;
  let matchCount = 0;
  let anySlotUpdated = false;
  function next() {
    if (i >= cfg.criteriaKeys.length) {
      clearSlotHighlight();
      onComplete?.(matchCount, anySlotUpdated);
      return;
    }
    const key = cfg.criteriaKeys[i];
    const grid = getClueGrid();
    const slot = $(`[data-key="${key}"]`, grid);
    const isNumeric = cfg.numericKeys.includes(key);
    const guessVal = isNumeric ? String(guess[key]) : guess[key];
    const ansVal = getAnswerVal(key);
    const match = isNumeric ? (Number(guess[key]) === Number(answer[key])) : (guessVal === ansVal);
    if (match) matchCount++;
    if (isNumeric || match) anySlotUpdated = true;

    if (slot) slot.classList.add('checking', match ? 'check-hit' : 'check-miss');
    playSound(match ? 'success' : 'fail');

    setTimeout(() => {
      clearSlotHighlight();
      if (isNumeric) {
        revealClue(key, guess);
      } else if (match) {
        revealClue(key);
      }
      i++;
      setTimeout(next, 200);
    }, 450);
  }
  next();
}

const FULL_RUN_MSGS = [
  n => `From 25 to 100 — you ran the whole gauntlet. All four rounds, no mercy. 🏆 The answer was ${n}.`,
  n => `You cleared the gauntlet. Every round. The mystery players never stood a chance. The answer was ${n}.`,
  n => `Four rounds, four W's. You didn't just play — you dominated. 🏆 The answer was ${n}.`,
  n => `25, 50, 75, 100 … you crushed 'em all. Full run complete. The answer was ${n}.`,
  n => `Who hurt you? You just breezed through all four rounds. Legendary. The answer was ${n}.`,
];

const FIRST_TRY_MSGS = [
  "First try! Unreal. 🎯",
  "One guess. That's all you needed. 🎯",
  "First try?! Who does that?!",
  "One pick. Case closed. 🎯",
  "First guess, only guess. Legend.",
];

const CLUTCH_MSGS = [
  (n) => `Clutch gene! 🧬 Got 'em on the final pick. The answer was ${n}.`,
  (n) => `Last guess. Last chance. Nailed it. The answer was ${n}.`,
  (n) => `Down to the wire — and you got 'em. The answer was ${n}.`,
  (n) => `Final pick, final answer. Clutch. 🧬 The answer was ${n}.`,
  (n) => `Sixth guess hero. You pulled it off. The answer was ${n}.`,
];

const GOT_EM_MSGS = [
  (n) => `Got 'em! The answer was ${n}.`,
  (n) => `That's the one. The answer was ${n}.`,
  (n) => `Nailed it. The answer was ${n}.`,
  (n) => `There we go. The answer was ${n}.`,
  (n) => `Bingo. The answer was ${n}.`,
];

const NOTHING_REVEALED_SNARK = [
  "Zero for six. That guess did you no favors.",
  "Nothing. The slots didn't even budge. Try again.",
  "Swing and a miss — literally nothing.",
  "That burned a guess and revealed … nothing. Ouch.",
  "Congrats, you just used a guess to learn nothing.",
];

const LITTLE_PROGRESS_SNARK = [
  "Zero for six. Not much progress there.",
  "No matches — but at least you got a little intel.",
  "Nothing hit, but the clues inched forward.",
  "That one didn't narrow it down much.",
  "Tough break. Small steps.",
];

const SOME_MATCHES_MSGS = [
  (name) => `Nope! But ${name} revealed:`,
  (name) => `Wrong pick. ${name} did spill some intel though:`,
  (name) => `Miss. At least ${name} gave something away:`,
  (name) => `Not them — but ${name} dropped a few clues:`,
  (name) => `No dice. ${name} did help narrow it down:`,
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    elements.timer().textContent = formatTime(Date.now() - gameStartTime);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateWrongGuesses() {
  elements.wrongGuessesList().textContent = guesses.length ? guesses.join(', ') : '—';
}

function formatAnswerSummary() {
  if (!answer) return '';
  const cfg = getSportConfig();
  return cfg.criteriaKeys.map(k => `<span class="answer-summary-item">${cfg.labels[k]}: ${escapeHtml(getAnswerVal(k))}</span>`).join('  ·  ');
}

function showSportUI() {
  const cfg = getSportConfig();
  elements.filtersContainer().classList.toggle('hidden', !cfg.hasFilters);
  elements.filtersMlb().classList.toggle('hidden', currentSport !== 'mlb');
  elements.filtersGolf().classList.toggle('hidden', currentSport !== 'golf');
  elements.filtersNba().classList.toggle('hidden', currentSport !== 'nba');
  elements.filtersNfl().classList.toggle('hidden', currentSport !== 'nfl');
  elements.clueGridMlb().classList.toggle('hidden', currentSport !== 'mlb');
  elements.clueGridGolf().classList.toggle('hidden', currentSport !== 'golf');
  elements.clueGridNba().classList.toggle('hidden', currentSport !== 'nba');
  elements.clueGridNfl().classList.toggle('hidden', currentSport !== 'nfl');
  updateHeaderForSport();
  $$('.sport-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.sport === currentSport);
    tab.setAttribute('aria-selected', tab.dataset.sport === currentSport);
  });
}

function startGame() {
  players = getPlayers();
  if (players.length === 0) {
    elements.message().textContent = 'Player data failed to load.';
    return;
  }
  answer = players[Math.floor(Math.random() * players.length)];
  attemptsLeft = MAX_ATTEMPTS;
  bonusClueUnlocked = false;
  guesses = [];
  gameStartTime = null;
  filtersUsedThisGame = false;
  if (currentSport === 'mlb') {
    elements.leagueFilter().value = '';
    elements.teamFilter().value = '';
    populateTeamFilter();
  } else if (currentSport === 'golf') {
    elements.countryFilter().value = '';
    elements.sponsorFilter().value = '';
    populateGolfFilters();
  } else if (currentSport === 'nba') {
    elements.nbaConferenceFilter().value = '';
    elements.nbaTeamFilter().value = '';
    populateNbaFilters();
  } else if (currentSport === 'nfl') {
    elements.nflConferenceFilter().value = '';
    elements.nflTeamFilter().value = '';
    populateNflFilters();
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  showSportUI();
  populateSelect();
  resetClueSlots();
  updateWrongGuesses();

  elements.guessSelect().value = '';
  elements.guessSelect().disabled = false;
  elements.guessBtn().disabled = false;
  elements.bonusClueBtn().disabled = false;
  elements.bonusClue().classList.add('hidden');
  elements.bonusClue().classList.remove('revealed');
  elements.bonusClue().textContent = '';
  elements.message().textContent = '';
  elements.message().className = 'message';
  elements.attempts().textContent = attemptsLeft;
  elements.timer().textContent = '—';
  elements.gameOver().classList.add('hidden');

  updateRoundDisplay();
  if (!isTouchDevice()) elements.guessSelect().focus();
}

function formatBonusClue() {
  if (currentSport === 'golf' && answer.tournamentWinSummary) {
    return answer.tournamentWinSummary;
  }
  if (currentSport === 'nba') {
    return `${formatHeight(answer.height)} · ${answer.rings} championship${answer.rings !== 1 ? 's' : ''}`;
  }
  if (currentSport === 'nfl') {
    return `${formatHeight(answer.height)} · ${answer.rings} Super Bowl ring${answer.rings !== 1 ? 's' : ''}`;
  }
  if (answer.statsType === 'hitter') {
    return `2025 stat: ${answer.battingAvg} AVG, ${answer.homeRuns} HR, ${answer.rbi} RBI`;
  }
  return `2025 stat: ${answer.era} ERA, ${answer.strikeouts} K`;
}

function unlockBonusClue() {
  if (bonusClueUnlocked) return;
  bonusClueUnlocked = true;
  elements.bonusClue().textContent = formatBonusClue();
  elements.bonusClue().classList.remove('hidden');
  elements.bonusClue().classList.add('revealed');
  elements.bonusClueBtn().disabled = true;
}

function calculateScore(won) {
  return getScoreBreakdown(won).score;
}

function getScoreBreakdown(won) {
  const noFilterBonus = getSportConfig().hasFilters ? (legendsMode || !filtersUsedThisGame ? 15 : 0) : 15;
  const lines = [];
  let score;

  if (won) {
    const elapsed = gameStartTime ? (Date.now() - gameStartTime) / 1000 : 0;
    const guessPenalty = (guesses.length - 1) * 12;
    const timePenalty = Math.min(20, Math.floor(elapsed / 4));
    score = 100 - guessPenalty - timePenalty + noFilterBonus;
    const max = legendsMode ? 100 : 89;
    score = Math.round(Math.max(61, Math.min(max, score)));

    lines.push({ label: 'Base score', value: 100 });
    if (guessPenalty > 0) lines.push({ label: `${guesses.length - 1} extra guess${guesses.length > 2 ? 'es' : ''}`, value: -guessPenalty });
    if (timePenalty > 0) lines.push({ label: 'Time penalty (slower = more lost)', value: -timePenalty });
    else lines.push({ label: 'Fast finish — no time penalty', value: null });
    if (noFilterBonus > 0) lines.push({ label: 'No filters used', value: noFilterBonus });
    if (!legendsMode && score >= 89) {
      lines.push({ label: 'Capped (Legends Mode required for 90+)', value: null });
    }
  } else {
    const base = 5;
    let fullCount = 0, closeCount = 0, farCount = 0;
    for (const key of revealedCriteria) {
      const q = revealedQuality[key] || 'full';
      if (q === 'full') fullCount++;
      else if (q === 'close') closeCount++;
      else farCount++;
    }
    const revealedBonus = fullCount * 10 + closeCount * 2;
    score = base + revealedBonus + noFilterBonus;
    score = Math.round(Math.max(1, Math.min(60, score)));

    lines.push({ label: 'Base (loss)', value: base });
    if (fullCount > 0) lines.push({ label: `${fullCount} clue${fullCount !== 1 ? 's' : ''} exact`, value: fullCount * 10 });
    if (closeCount > 0) lines.push({ label: `${closeCount} close (orange)`, value: closeCount * 2 });
    if (farCount > 0) lines.push({ label: `${farCount} far (red) — no points`, value: null });
    if (noFilterBonus > 0) lines.push({ label: 'No filters used', value: noFilterBonus });
    lines.push({ label: 'Max score on loss', value: '(capped at 60)' });
  }

  return { score, lines };
}

function showScoreBreakdown(won) {
  const { score, lines } = getScoreBreakdown(won);
  const content = $('#scoreBreakdownContent');
  const overlay = $('#scoreBreakdownOverlay');
  if (!content || !overlay) return;
  content.innerHTML = `<p class="score-breakdown-total">Final: ${score}</p><ul class="score-breakdown-list">` +
    lines.map(l => `<li>${escapeHtml(l.label)}${l.value !== null ? ` <span class="score-breakdown-value">${l.value > 0 ? '+' : ''}${l.value}</span>` : ''}</li>`).join('') +
    '</ul>';
  overlay.classList.remove('hidden');
  overlay.addEventListener('click', function onOverlayClick(e) {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', onOverlayClick);
    }
  });
  document.getElementById('scoreBreakdownClose')?.focus();
}

function win(isFirstTry, isLastPick) {
  setStreak(getStreak(currentSport) + 1, currentSport);
  updateStreakDisplay();
  stopTimer();
  elements.guessSelect().disabled = true;
  elements.guessBtn().disabled = true;
  elements.bonusClueBtn().disabled = true;

  const score = calculateScore(true);
  let msg;
  if (currentRound === ROUND_SIZES.length) {
    msg = pick(FULL_RUN_MSGS)(answer.name);
  } else if (isFirstTry) {
    msg = pick(FIRST_TRY_MSGS);
  } else if (isLastPick) {
    msg = pick(CLUTCH_MSGS)(answer.name);
  } else {
    msg = pick(GOT_EM_MSGS)(answer.name);
  }
  const legendsBadge = legendsMode ? '<span class="legends-badge">Legends Mode</span>' : '';
  const nextRoundLabel = currentRound < ROUND_SIZES.length ? 'Next round' : 'Play again';
  elements.message().innerHTML = `${msg} ${legendsBadge} <span class="round-score score-clickable" role="button" tabindex="0" title="Click for breakdown">Score: ${score}</span> <button type="button" id="nextRoundBtn" class="secondary small">${escapeHtml(nextRoundLabel)}</button><div class="answer-summary">${formatAnswerSummary()}</div>`;
  elements.message().className = 'message ' + (isFirstTry ? 'first-try' : 'win');
  $('#nextRoundBtn')?.addEventListener('click', () => {
    if (currentRound < ROUND_SIZES.length) currentRound++;
    startGame();
  });
}

function lose() {
  setStreak(0, currentSport);
  updateStreakDisplay();
  stopTimer();
  elements.guessSelect().disabled = true;
  elements.guessBtn().disabled = true;
  elements.bonusClueBtn().disabled = true;

  const score = calculateScore(false);
  elements.gameOver().classList.remove('hidden');
  elements.gameOverTitle().textContent = 'Game over';
  elements.gameOverText().innerHTML = `The answer was <strong>${answer.name}</strong><div class="answer-summary">${formatAnswerSummary()}</div><span class="round-score score-clickable" role="button" tabindex="0" title="Click for breakdown">Score: ${score}</span>`;
  elements.playAgainBtn().focus();
}

function handleGuess() {
  const raw = elements.guessSelect().value.trim();
  if (!raw) {
    elements.message().textContent = 'Pick a player!';
    elements.message().className = 'message error';
    return;
  }

  const guessed = findPlayer(raw);
  if (!guessed) return;

  if (guesses.length === 0) {
    gameStartTime = Date.now();
    startTimer();
  }
  if (getSportConfig().hasFilters && !legendsMode) {
    if (currentSport === 'mlb' && (elements.leagueFilter().value || elements.teamFilter().value)) {
      filtersUsedThisGame = true;
    } else if (currentSport === 'golf' && (elements.countryFilter().value || elements.sponsorFilter().value)) {
      filtersUsedThisGame = true;
    } else if (currentSport === 'nba' && (elements.nbaConferenceFilter().value || elements.nbaTeamFilter().value)) {
      filtersUsedThisGame = true;
    } else if (currentSport === 'nfl' && (elements.nflConferenceFilter().value || elements.nflTeamFilter().value)) {
      filtersUsedThisGame = true;
    }
  }
  guesses.push(guessed.name);
  attemptsLeft--;
  elements.attempts().textContent = attemptsLeft;

  const isCorrect = normalizeName(guessed.name) === normalizeName(answer.name);

  elements.guessBtn().disabled = true;
  elements.guessSelect().disabled = true;
  elements.message().textContent = `Checking ${guessed.name}...`;
  elements.message().className = 'message';

  if (isCorrect) {
    processGuessReveals(guessed, () => {
      const isFirstTry = guesses.length === 1;
      const isLastPick = guesses.length === MAX_ATTEMPTS;
      win(isFirstTry, isLastPick);
    });
    return;
  }

  processGuessReveals(guessed, (matchCount, anySlotUpdated) => {
    updateWrongGuesses();
    populateSelect();
    elements.guessSelect().value = '';
    elements.guessSelect().disabled = false;
    elements.guessBtn().disabled = false;
    if (!isTouchDevice()) elements.guessSelect().focus();

    if (attemptsLeft <= 0) {
      lose();
    }

    let summaryText;
    const zeroMatches = matchCount === 0;
    if (zeroMatches && !anySlotUpdated) {
      summaryText = pick(NOTHING_REVEALED_SNARK);
    } else if (zeroMatches) {
      summaryText = pick(LITTLE_PROGRESS_SNARK);
    } else {
      summaryText = pick(SOME_MATCHES_MSGS)(guessed.name);
    }
    const useSnarkClass = zeroMatches;
    setTimeout(() => {
      elements.message().textContent = summaryText;
      elements.message().className = useSnarkClass ? 'message snark' : 'message';
    }, 400);
  });
}

function switchSport(sport) {
  if (sport === currentSport) return;
  currentSport = sport;
  currentRound = 1;
  startGame();
}

function init() {
  currentSport = 'nfl';
  players = getPlayers();
  if (players.length === 0) {
    elements.message().textContent = 'Player data failed to load.';
    return;
  }
  updateStreakDisplay();
  showSportUI();
  startGame();

  $$('.sport-tab').forEach(tab => {
    tab.addEventListener('click', () => switchSport(tab.dataset.sport));
  });
  elements.leagueFilter().addEventListener('change', () => {
    populateTeamFilter();
    populateSelect();
  });
  elements.teamFilter().addEventListener('change', populateSelect);
  elements.countryFilter().addEventListener('change', populateSelect);
  elements.sponsorFilter().addEventListener('change', populateSelect);
  elements.nbaConferenceFilter().addEventListener('change', () => {
    populateNbaFilters();
    populateSelect();
  });
  elements.nbaTeamFilter().addEventListener('change', populateSelect);
  elements.nflConferenceFilter().addEventListener('change', () => {
    populateNflFilters();
    populateSelect();
  });
  elements.nflTeamFilter().addEventListener('change', populateSelect);
  elements.guessBtn().addEventListener('click', handleGuess);
  elements.guessSelect().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGuess();
  });
  elements.bonusClueBtn().addEventListener('click', unlockBonusClue);
  elements.playAgainBtn().addEventListener('click', () => {
    if (currentRound < ROUND_SIZES.length) currentRound++;
    startGame();
  });
  elements.newGameBtn().addEventListener('click', () => {
    currentRound = 1;
    startGame();
  });
  $('#helpBtn')?.addEventListener('click', () => {
    const panel = $('#helpPanel');
    if (!panel) return;
    panel.classList.remove('hidden');
    $('#helpCloseBtn')?.focus();
  });
  $('#helpCloseBtn')?.addEventListener('click', () => {
    $('#helpPanel')?.classList.add('hidden');
    $('#helpBtn')?.focus();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.score-clickable')) return;
    const inGameOver = elements.gameOver() && !elements.gameOver().classList.contains('hidden');
    showScoreBreakdown(!inGameOver);
  });
  $('#scoreBreakdownClose')?.addEventListener('click', () => $('#scoreBreakdownOverlay')?.classList.add('hidden'));
  document.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.target.closest('.score-clickable') && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const inGameOver = elements.gameOver() && !elements.gameOver().classList.contains('hidden');
      showScoreBreakdown(!inGameOver);
      return;
    }
    const sel = elements.guessSelect();
    if (!sel) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (sel.disabled) return;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = Math.min(Math.max(sel.selectedIndex + dir, 0), sel.options.length - 1);
      if (nextIndex !== sel.selectedIndex) {
        sel.selectedIndex = nextIndex;
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Enter') {
      if (elements.guessBtn().disabled) return;
      const active = document.activeElement;
      if (active && active.tagName === 'BUTTON' && active !== elements.guessBtn()) return;
      handleGuess();
    }
  });
}

init();
})();
