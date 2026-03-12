const MAX_ATTEMPTS = 6;

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
};

let currentSport = 'mlb';
let players = [];
let revealedCriteria = new Set();
let exactRevealedCriteria = new Set();
let answer = null;
let attemptsLeft = MAX_ATTEMPTS;
let bonusClueUnlocked = false;
let guesses = [];
let gameStartTime = null;
let filtersUsedThisGame = false;
let legendsMode = false;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let timerInterval = null;

const elements = {
  guessSelect: () => $('#guessSelect'),
  guessBtn: () => $('#guessBtn'),
  bonusClueBtn: () => $('#bonusClueBtn'),
  bonusClue: () => $('#bonusClue'),
  message: () => $('#message'),
  clueGridMlb: () => $('#clueGridMlb'),
  clueGridGolf: () => $('#clueGridGolf'),
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
  gameOver: () => $('#gameOver'),
  gameOverTitle: () => $('#gameOverTitle'),
  gameOverText: () => $('#gameOverText'),
  playAgainBtn: () => $('#playAgainBtn'),
  streak: () => $('#streak'),
};

function getSportConfig() {
  return SPORTS[currentSport];
}

function getPlayers() {
  if (currentSport === 'golf' && typeof GOLF_PLAYER_DATA !== 'undefined') return GOLF_PLAYER_DATA;
  if (currentSport === 'mlb' && typeof PLAYER_DATA !== 'undefined') return PLAYER_DATA;
  return [];
}

function getClueGrid() {
  return currentSport === 'golf' ? elements.clueGridGolf() : elements.clueGridMlb();
}

const STREAK_KEY = 'pickSixStreak';

function getStreak() {
  try {
    return parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
  } catch (_) { return 0; }
}

function setStreak(n) {
  try { localStorage.setItem(STREAK_KEY, String(n)); } catch (_) {}
}

function updateStreakDisplay() {
  const streak = getStreak();
  elements.streak().textContent = streak > 0 ? '🏆'.repeat(streak) : '';
  elements.streak().ariaLabel = streak > 0 ? `${streak} win streak` : '';
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

  if (g === a) return { text: String(a), hint: 'correct' };
  let arrow;
  if (lowerBetter) {
    arrow = a < g ? ' ↓' : ' ↑';
  } else {
    arrow = a > g ? ' ↑' : ' ↓';
  }
  const tilde = close ? ' ~' : '';
  return {
    text: `${g}${arrow}${tilde}`,
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
    if (result.hint === 'correct') exactRevealedCriteria.add(key);
  } else if (forceVal !== undefined) {
    text = String(forceVal);
    revealedCriteria.add(key);
  } else if (!revealedCriteria.has(key)) {
    revealedCriteria.add(key);
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
    const match = guessVal === ansVal;
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

const NOTHING_REVEALED_SNARK = [
  "Zero for six. That guess did you no favors.",
  "Nothing. The slots didn't even budge. Try again.",
  "Swing and a miss — literally nothing.",
  "That burned a guess and revealed … nothing. Ouch.",
  "Zero hits and no new clues. Maybe the next one?",
  "Congrats, you just used a guess to learn nothing.",
];

const LITTLE_PROGRESS_SNARK = [
  "Zero for six. Not much progress there.",
  "No matches — but at least you got a little intel.",
  "Nothing hit, but the clues inched forward.",
  "That one didn't narrow it down much.",
  "No direct hits. Use what you saw and try again.",
  "Tough break. Small steps.",
];

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
  const showFilters = cfg.hasFilters && !legendsMode;
  elements.filtersContainer().classList.toggle('hidden', !cfg.hasFilters);
  elements.filtersMlb().classList.toggle('hidden', currentSport !== 'mlb');
  elements.filtersGolf().classList.toggle('hidden', currentSport !== 'golf');
  elements.leagueFilter().disabled = legendsMode;
  elements.teamFilter().disabled = legendsMode;
  elements.countryFilter().disabled = legendsMode;
  elements.sponsorFilter().disabled = legendsMode;
  $$('.legends-mode').forEach(btn => btn.classList.toggle('active', legendsMode));
  elements.clueGridMlb().classList.toggle('hidden', currentSport !== 'mlb');
  elements.clueGridGolf().classList.toggle('hidden', currentSport !== 'golf');
  $$('.sport-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.sport === currentSport);
    tab.setAttribute('aria-selected', tab.dataset.sport === currentSport);
  });
}

function toggleLegendsMode() {
  const cfg = getSportConfig();
  if (!cfg.hasFilters) return;
  legendsMode = !legendsMode;
  if (legendsMode) {
    elements.leagueFilter().value = '';
    elements.teamFilter().value = '';
    elements.countryFilter().value = '';
    elements.sponsorFilter().value = '';
    populateTeamFilter();
    populateGolfFilters();
  }
  showSportUI();
  populateSelect();
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
  } else {
    elements.countryFilter().value = '';
    elements.sponsorFilter().value = '';
    populateGolfFilters();
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

  elements.guessSelect().focus();
}

function formatBonusClue() {
  if (currentSport === 'golf' && answer.tournamentWinSummary) {
    return answer.tournamentWinSummary;
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
  if (!gameStartTime) return 100;
  const elapsed = (Date.now() - gameStartTime) / 1000;
  const noFilterBonus = getSportConfig().hasFilters ? (legendsMode || !filtersUsedThisGame ? 15 : 0) : 15;
  let score;
  if (won) {
    score = 100 - (guesses.length - 1) * 12 - Math.min(15, Math.floor(elapsed / 6)) + noFilterBonus;
  } else {
    score = 5 + revealedCriteria.size * 10 + noFilterBonus;
    score = Math.min(85, score);
  }
  return Math.max(1, Math.min(100, Math.round(score)));
}

function win(isFirstTry, isLastPick) {
  setStreak(getStreak() + 1);
  updateStreakDisplay();
  stopTimer();
  elements.guessSelect().disabled = true;
  elements.guessBtn().disabled = true;
  elements.bonusClueBtn().disabled = true;

  const score = calculateScore(true);
  let msg;
  if (isFirstTry) msg = "First try! Unreal. 🎯";
  else if (isLastPick) msg = `Clutch gene! 🧬 Got 'em on the final pick. The answer was ${answer.name}.`;
  else msg = `Got 'em! The answer was ${answer.name}.`;
  elements.message().innerHTML = `${msg} <span class="round-score">Score: ${score}</span><div class="answer-summary">${formatAnswerSummary()}</div>`;
  elements.message().className = 'message ' + (isFirstTry ? 'first-try' : 'win');
}

function lose() {
  setStreak(0);
  updateStreakDisplay();
  stopTimer();
  elements.guessSelect().disabled = true;
  elements.guessBtn().disabled = true;
  elements.bonusClueBtn().disabled = true;

  const score = calculateScore(false);
  elements.gameOver().classList.remove('hidden');
  elements.gameOverTitle().textContent = 'Game over';
  elements.gameOverText().innerHTML = `The answer was <strong>${answer.name}</strong><div class="answer-summary">${formatAnswerSummary()}</div><span class="round-score">Score: ${score}</span>`;
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
    elements.guessSelect().focus();

    if (attemptsLeft <= 0) {
      lose();
    }

    let summaryText;
    const zeroMatches = matchCount === 0;
    if (zeroMatches && !anySlotUpdated) {
      summaryText = NOTHING_REVEALED_SNARK[Math.floor(Math.random() * NOTHING_REVEALED_SNARK.length)];
    } else if (zeroMatches) {
      summaryText = LITTLE_PROGRESS_SNARK[Math.floor(Math.random() * LITTLE_PROGRESS_SNARK.length)];
    } else {
      summaryText = `Nope! But ${guessed.name} revealed:`;
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
  startGame();
}

function init() {
  currentSport = 'mlb';
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
  $$('.legends-mode').forEach(btn => btn.addEventListener('click', toggleLegendsMode));
  elements.leagueFilter().addEventListener('change', () => {
    populateTeamFilter();
    populateSelect();
  });
  elements.teamFilter().addEventListener('change', populateSelect);
  elements.countryFilter().addEventListener('change', populateSelect);
  elements.sponsorFilter().addEventListener('change', populateSelect);
  elements.guessBtn().addEventListener('click', handleGuess);
  elements.guessSelect().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGuess();
  });
  elements.bonusClueBtn().addEventListener('click', unlockBonusClue);
  elements.playAgainBtn().addEventListener('click', startGame);
  elements.newGameBtn().addEventListener('click', startGame);
}

init();
