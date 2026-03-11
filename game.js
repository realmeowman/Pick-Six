const MAX_ATTEMPTS = 6;
const CRITERIA_KEYS = ['league', 'division', 'team', 'position', 'age', 'number'];
let players = typeof PLAYER_DATA !== 'undefined' ? PLAYER_DATA : [];
let revealedCriteria = new Set();
let exactRevealedCriteria = new Set();
let answer = null;
let attemptsLeft = MAX_ATTEMPTS;
let bonusClueUnlocked = false;
let guesses = [];
let gameStartTime = null;
let filtersUsedThisGame = false;

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

let timerInterval = null;

const elements = {
  guessSelect: () => $('#guessSelect'),
  guessBtn: () => $('#guessBtn'),
  bonusClueBtn: () => $('#bonusClueBtn'),
  bonusClue: () => $('#bonusClue'),
  message: () => $('#message'),
  clueGrid: () => $('#clueGrid'),
  attempts: () => $('#attemptCount'),
  timer: () => $('#timer'),
  wrongGuessesList: () => $('#wrongGuessesList'),
  newGameBtn: () => $('#newGameBtn'),
  leagueFilter: () => $('#leagueFilter'),
  teamFilter: () => $('#teamFilter'),
  gameOver: () => $('#gameOver'),
  gameOverTitle: () => $('#gameOverTitle'),
  gameOverText: () => $('#gameOverText'),
  playAgainBtn: () => $('#playAgainBtn'),
  streak: () => $('#streak'),
};

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
  const league = elements.leagueFilter().value;
  const team = elements.teamFilter().value;
  const guessedSet = new Set(guesses);
  return players.filter(p => {
    if (guessedSet.has(p.name)) return false;
    if (league && p.league !== league) return false;
    if (team && p.team !== team) return false;
    return true;
  });
}

function populateTeamFilter() {
  const league = elements.leagueFilter().value;
  const teamSel = elements.teamFilter();
  let teams = [...new Set(players.map(p => p.team))].sort();
  if (league) teams = [...new Set(players.filter(p => p.league === league).map(p => p.team))].sort();
  const currentTeam = teamSel.value;
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
  if (key === 'age' || key === 'number') return String(answer[key]);
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
  CRITERIA_KEYS.forEach(key => {
    const slot = $(`[data-key="${key}"]`, elements.clueGrid());
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
  const g = Number(guessVal) || 0;
  const a = Number(ansVal) || 0;
  const diff = Math.abs(a - g);
  const closeThreshold = key === 'age' ? 3 : 9;
  const close = diff > 0 && diff <= closeThreshold;
  const far = diff > closeThreshold;

  if (g === a) return { text: String(a), hint: 'correct' };
  const arrow = a > g ? ' ↑' : ' ↓';
  const tilde = close ? ' ~' : '';
  return {
    text: `${g}${arrow}${tilde}`,
    hint: close ? 'close' : 'far',
  };
}

function revealClue(key, guess, forceVal) {
  const slot = $(`[data-key="${key}"]`, elements.clueGrid());
  if (!slot) return;
  const valEl = slot.querySelector('.clue-value');
  const hiddenEl = slot.querySelector('.clue-hidden');
  if (!valEl || !hiddenEl) return;

  let text;
  let hint = null;

  if ((key === 'number' || key === 'age') && guess) {
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
  CRITERIA_KEYS.forEach(key => {
    const slot = $(`[data-key="${key}"]`, elements.clueGrid());
    if (slot) slot.classList.remove('checking', 'check-hit', 'check-miss');
  });
}

function processGuessReveals(guess, onComplete) {
  let i = 0;
  function next() {
    if (i >= CRITERIA_KEYS.length) {
      clearSlotHighlight();
      onComplete?.();
      return;
    }
    const key = CRITERIA_KEYS[i];
    const slot = $(`[data-key="${key}"]`, elements.clueGrid());
    const guessVal = key === 'age' || key === 'number' ? String(guess[key]) : guess[key];
    const ansVal = getAnswerVal(key);
    const match = guessVal === ansVal;

    if (slot) slot.classList.add('checking', match ? 'check-hit' : 'check-miss');
    playSound(match ? 'success' : 'fail');

    setTimeout(() => {
      clearSlotHighlight();
      if (key === 'number' || key === 'age') {
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
  const labels = { league: 'League', division: 'Division', team: 'Team', position: 'Position', age: 'Age', number: 'Number' };
  return CRITERIA_KEYS.map(k => `<span class="answer-summary-item">${labels[k]}: ${escapeHtml(getAnswerVal(k))}</span>`).join('  ·  ');
}

function startGame() {
  answer = players[Math.floor(Math.random() * players.length)];
  attemptsLeft = MAX_ATTEMPTS;
  bonusClueUnlocked = false;
  guesses = [];
  gameStartTime = null;
  filtersUsedThisGame = false;
  elements.leagueFilter().value = '';
  elements.teamFilter().value = '';
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  populateTeamFilter();
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
  const noFilterBonus = filtersUsedThisGame ? 0 : 15;
  let score;
  if (won) {
    score = 100 - (guesses.length - 1) * 12 - Math.min(15, Math.floor(elapsed / 6)) + noFilterBonus;
  } else {
    score = 5 + revealedCriteria.size * 10 + noFilterBonus;
    score = Math.min(85, score);
  }
  return Math.max(1, Math.min(100, Math.round(score)));
}

function win(isFirstTry) {
  setStreak(getStreak() + 1);
  updateStreakDisplay();
  stopTimer();
  elements.guessSelect().disabled = true;
  elements.guessBtn().disabled = true;
  elements.bonusClueBtn().disabled = true;

  const score = calculateScore(true);
  const msg = isFirstTry
    ? "First try! Unreal. 🎯"
    : `Got 'em! The answer was ${answer.name}.`;
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
  if (!guessed) return; // shouldn't happen with select


  if (guesses.length === 0) {
    gameStartTime = Date.now();
    startTimer();
  }
  if (elements.leagueFilter().value || elements.teamFilter().value) {
    filtersUsedThisGame = true;
  }
  guesses.push(guessed.name);
  attemptsLeft--;
  elements.attempts().textContent = attemptsLeft;

  if (normalizeName(guessed.name) === normalizeName(answer.name)) {
    win(guesses.length === 1);
    return;
  }

  elements.guessBtn().disabled = true;
  elements.guessSelect().disabled = true;
  elements.message().textContent = `Checking ${guessed.name}...`;
  elements.message().className = 'message';

  processGuessReveals(guessed, () => {
    updateWrongGuesses();
    populateSelect();
    elements.message().textContent = `Nope! But ${guessed.name} revealed:`;
    elements.guessSelect().value = '';
    elements.guessSelect().disabled = false;
    elements.guessBtn().disabled = false;
    elements.guessSelect().focus();

    if (attemptsLeft <= 0) {
      lose();
    }
  });
}

function init() {
  if (typeof PLAYER_DATA !== 'undefined') players = PLAYER_DATA;
  if (players.length === 0) {
    elements.message().textContent = 'Player data failed to load.';
    return;
  }
  updateStreakDisplay();
  startGame();

  elements.leagueFilter().addEventListener('change', () => {
    populateTeamFilter();
    populateSelect();
  });
  elements.teamFilter().addEventListener('change', populateSelect);
  elements.guessBtn().addEventListener('click', handleGuess);
  elements.guessSelect().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGuess();
  });
  elements.bonusClueBtn().addEventListener('click', unlockBonusClue);
  elements.playAgainBtn().addEventListener('click', startGame);
  elements.newGameBtn().addEventListener('click', startGame);
}

init();
