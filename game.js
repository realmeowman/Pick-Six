(function () {
  'use strict';

const MAX_ATTEMPTS = 6;
const ROUND_SIZES = [25, 50, 75, 100, 125, 150];
const MAX_SESSION_SCORE = ROUND_SIZES.length * 10;

/** Optional: Worker URL (https://…) so shared links can show the last guess in iMessage title; see workers/coop-preview.js */
const COOP_PREVIEW_ORIGIN = '';

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
  nhl: {
    key: 'nhl',
    criteriaKeys: ['league', 'division', 'team', 'position', 'height', 'rings'],
    labels: {
      league: 'Conference',
      division: 'Division',
      team: 'Team',
      position: 'Position',
      height: 'Height',
      rings: 'Cups',
    },
    numericKeys: ['height', 'rings'],
    lowerIsBetter: {},
    closeThreshold: { height: 2, rings: 1 },
    hasFilters: true,
  },
  epl: {
    key: 'epl',
    criteriaKeys: ['club', 'country', 'position', 'height', 'trophies', 'age'],
    labels: {
      club: 'Club',
      country: 'Country',
      position: 'Position',
      height: 'Height',
      trophies: 'Trophies',
      age: 'Age',
    },
    numericKeys: ['height', 'trophies', 'age'],
    lowerIsBetter: {},
    closeThreshold: { height: 2, trophies: 4, age: 3 },
    hasFilters: true,
  },
  all: {
    key: 'all',
    criteriaKeys: ['sport', 'team', 'position', 'height', 'titles', 'age'],
    labels: {
      sport: 'Sport',
      team: 'Team/Country',
      position: 'Position',
      height: 'Height',
      titles: 'Titles',
      age: 'Age',
    },
    numericKeys: ['height', 'titles', 'age'],
    lowerIsBetter: {},
    closeThreshold: { height: 2, titles: 1, age: 3 },
    hasFilters: true,
  },
};

function isValidSportKey(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(SPORTS, key);
}

function getSportFromUrl() {
  try {
    const p = new URLSearchParams(location.search).get('sport');
    if (!p) return null;
    let key = p.toLowerCase().trim();
    if (key === 'football') key = 'epl';
    return isValidSportKey(key) ? key : null;
  } catch (_) {
    return null;
  }
}

/** Non-coop games: keep ?sport= in the address bar so the link is shareable. */
function replaceUrlForLocalGame() {
  const params = new URLSearchParams();
  params.set('sport', currentSport);
  if (vsMode && vsSessionSeed != null) {
    params.set('vs', String(vsSessionSeed));
  }
  if (incomingChallengerScore != null && Number.isFinite(incomingChallengerScore)) {
    params.set('cs', incomingChallengerScore.toFixed(2));
  }
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

function clearVsMode() {
  vsMode = false;
  vsSessionSeed = null;
  incomingChallengerScore = null;
}

function deriveRoundSeed(sessionSeed, round) {
  let x = (sessionSeed >>> 0) ^ (round * 0x9e3779b9);
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  return x >>> 0;
}

function shouldIncludeChallengerScoreInVsLink() {
  if (sessionRoundScores.length === 0) return false;
  if (sessionRoundScores.length === ROUND_SIZES.length) return true;
  const go = elements.gameOver();
  return !!(go && !go.classList.contains('hidden'));
}

function getVsChallengeUrl() {
  const u = new URL(location.origin + location.pathname);
  const sp = new URLSearchParams();
  sp.set('sport', currentSport);
  if (vsSessionSeed != null) {
    sp.set('vs', String(vsSessionSeed));
  }
  if (shouldIncludeChallengerScoreInVsLink()) {
    sp.set('cs', getSessionTotalScore().toFixed(2));
  }
  u.search = sp.toString();
  return u.toString();
}

function loadVsFromUrl() {
  const params = new URLSearchParams(location.search);
  const vsRaw = params.get('vs');
  if (!vsRaw) return false;
  const seed = parseInt(vsRaw, 10);
  if (!Number.isFinite(seed) || seed < 0) return false;
  const csRaw = params.get('cs');
  let cs = null;
  if (csRaw != null && csRaw !== '') {
    const n = parseFloat(csRaw);
    if (Number.isFinite(n)) cs = n;
  }
  vsMode = true;
  vsSessionSeed = seed;
  incomingChallengerScore = cs;
  currentRound = 1;
  resetSessionRoundScores();
  startGame();
  return true;
}

function vsCompareHtml() {
  if (incomingChallengerScore == null) return '';
  const mine = getSessionTotalScore();
  const theirs = incomingChallengerScore;
  const r = (x) => x.toFixed(2);
  let msg;
  if (mine > theirs) {
    msg = `You scored higher than their ${r(theirs)} (${r(mine)} total).`;
  } else if (mine < theirs) {
    msg = `Their ${r(theirs)} is still ahead — you finished with ${r(mine)} total.`;
  } else {
    msg = `Same total — ${r(mine)} each.`;
  }
  return `<p class="vs-challenge-result">${escapeHtml(msg)}</p>`;
}

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
let coopMode = false;
let coopSeed = null;
/** Head-to-head: same session seed → same answer each round through round 6 for both players. */
let vsMode = false;
let vsSessionSeed = null;
/** Opponent total from a Vs link (URL cs=) to compare at the end. */
let incomingChallengerScore = null;
/** Wall-clock when the round became playable (after startGame / startCoopGame). */
let roundStartTime = 0;
/** Timestamp of each submitted guess (local play). */
let guessSubmitTimes = [];
/** Per-guess durations (ms) restored from coop links; overrides recomputation when set. */
let coopGuessDeltasMs = null;
/** Scores for each completed round in the current run (win or loss). */
let sessionRoundScores = [];

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function resetSessionRoundScores() {
  sessionRoundScores = [];
}

function getSessionTotalScore() {
  return sessionRoundScores.reduce((a, b) => a + b, 0);
}

function finalScorePanelHtml() {
  const total = getSessionTotalScore();
  return `<div class="final-score-panel">
    <p class="final-score-headline">Final score</p>
    <p class="final-score-line">${total.toFixed(2)} <span class="final-score-max">/ ${MAX_SESSION_SCORE}</span></p>
    <div class="final-score-share-slot" aria-hidden="true"></div>
  </div>`;
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
  clueGridNhl: () => $('#clueGridNhl'),
  clueGridEpl: () => $('#clueGridEpl'),
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
  filtersNhl: () => $('#filtersNhl'),
  filtersEpl: () => $('#filtersEpl'),
  filtersAll: () => $('#filtersAll'),
  allSportFilter: () => $('#allSportFilter'),
  nbaConferenceFilter: () => $('#nbaConferenceFilter'),
  nbaTeamFilter: () => $('#nbaTeamFilter'),
  nflConferenceFilter: () => $('#nflConferenceFilter'),
  nflTeamFilter: () => $('#nflTeamFilter'),
  nhlConferenceFilter: () => $('#nhlConferenceFilter'),
  nhlTeamFilter: () => $('#nhlTeamFilter'),
  eplClubFilter: () => $('#eplClubFilter'),
  gameOver: () => $('#gameOver'),
  gameOverTitle: () => $('#gameOverTitle'),
  gameOverText: () => $('#gameOverText'),
  finalScoreBanner: () => $('#finalScoreBanner'),
  finalScoreLine: () => $('#finalScoreLine'),
  finalScoreShareSlot: () => $('#finalScoreShareSlot'),
  playAgainBtn: () => $('#playAgainBtn'),
  sportIcon: () => $('#sportIcon'),
  tagline: () => $('#tagline'),
  roundLabel: () => $('#roundLabel'),
  coopBanner: () => $('#coopBanner'),
  coopLinkInput: () => $('#coopLinkInput'),
  coopCopyBtn: () => $('#coopCopyBtn'),
  playWithFriendBtn: () => $('#playWithFriendBtn'),
  vsModeBtn: () => $('#vsModeBtn'),
  shareGameBtn: () => $('#shareGameBtn'),
  vsShareModal: () => $('#vsShareModal'),
  vsShareBlurb: () => $('#vsShareBlurb'),
  vsShareCopyBtn: () => $('#vsShareCopyBtn'),
  vsShareDoneBtn: () => $('#vsShareDoneBtn'),
  coopGoFirstModal: () => $('#coopGoFirstModal'),
  coopGoFirstBtn: () => $('#coopGoFirstBtn'),
  coopShareModal: () => $('#coopShareModal'),
  coopShareCopyBtn: () => $('#coopShareCopyBtn'),
  coopShareDoneBtn: () => $('#coopShareDoneBtn'),
  clueGridAll: () => $('#clueGridAll'),
};

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function getAnswerFromSeed(playersList, seed) {
  if (!playersList.length) return null;
  const rng = seededRandom(seed);
  const idx = Math.floor(rng() * playersList.length);
  return playersList[idx];
}

function getGuessDeltasMs() {
  if (coopGuessDeltasMs && coopGuessDeltasMs.length === guesses.length) {
    return coopGuessDeltasMs;
  }
  if (!guesses.length) return [];
  if (!guessSubmitTimes.length || !roundStartTime) {
    return guesses.map(() => 25000);
  }
  if (guessSubmitTimes.length !== guesses.length) {
    return guesses.map(() => 25000);
  }
  const deltas = [];
  deltas.push(guessSubmitTimes[0] - roundStartTime);
  for (let i = 1; i < guessSubmitTimes.length; i++) {
    deltas.push(guessSubmitTimes[i] - guessSubmitTimes[i - 1]);
  }
  return deltas;
}

function encodeCoopState() {
  const state = {
    s: currentSport,
    r: currentRound,
    e: coopSeed,
    g: guesses,
    rc: [...revealedCriteria],
    rq: { ...revealedQuality },
    b: bonusClueUnlocked,
    gd: getGuessDeltasMs(),
  };
  const json = JSON.stringify(state);
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}

function decodeCoopState(hash) {
  try {
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(hash), c => c.charCodeAt(0))
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function coopStateB64ToUrlParam(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlParamToCoopStateB64(param) {
  let b64 = param.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  return b64;
}

function getCoopLink() {
  const state = encodeCoopState();
  const safe = coopStateB64ToUrlParam(state);
  const u = new URL(location.origin + location.pathname);
  const sp = new URLSearchParams(location.search);
  sp.set('coop', safe);
  u.search = sp.toString();
  return u.toString();
}

function getCoopShareUrl() {
  const direct = getCoopLink();
  const origin = typeof COOP_PREVIEW_ORIGIN === 'string' ? COOP_PREVIEW_ORIGIN.trim() : '';
  if (!origin || !guesses.length) return direct;
  const last = guesses[guesses.length - 1];
  if (!last) return direct;
  try {
    const u = new URL(origin);
    u.searchParams.set('g', last);
    u.searchParams.set('r', direct);
    return u.toString();
  } catch (_) {
    return direct;
  }
}

function updateCoopLink() {
  const input = elements.coopLinkInput();
  if (input) input.value = getCoopShareUrl();
}

function showCoopBanner(message) {
  const banner = elements.coopBanner();
  if (!banner) return;
  banner.classList.remove('hidden');
  const msgEl = banner.querySelector('.coop-banner-msg');
  if (msgEl) msgEl.textContent = message;
  updateCoopLink();
}

function hideCoopBanner() {
  const banner = elements.coopBanner();
  if (banner) banner.classList.add('hidden');
}

function updateCoopActionButtonUi() {
  const btn = elements.playWithFriendBtn();
  if (!btn) return;
  const shareLabel = btn.querySelector('.share-game-btn__label--share');
  if (coopMode) {
    btn.classList.add('coop-action-btn--exit');
    btn.setAttribute('aria-label', 'Exit Co-op and return to solo play');
    if (shareLabel) shareLabel.textContent = 'Exit Co-op';
  } else {
    btn.classList.remove('coop-action-btn--exit', 'share-game-btn--checking', 'share-game-btn--copied');
    btn.setAttribute('aria-label', 'Play Co-op with a friend');
    if (shareLabel) shareLabel.textContent = 'Co-op';
  }
}

function showCoopGoFirstModal() {
  elements.coopGoFirstModal()?.classList.remove('hidden');
  elements.coopGoFirstBtn()?.focus();
}

function hideCoopGoFirstModal() {
  elements.coopGoFirstModal()?.classList.add('hidden');
}

function setVsShareBlurb() {
  const blurb = elements.vsShareBlurb();
  if (!blurb) return;
  const post = shouldIncludeChallengerScoreInVsLink();
  blurb.textContent = post
    ? 'This link includes your total so they know what to beat. Same seed means the same answer every round.'
    : 'You and a friend both play the same six rounds (same mystery player in each round). Share anytime — add your score to the link after you finish.';
}

function showVsShareModal() {
  const modal = elements.vsShareModal();
  const copyBtn = elements.vsShareCopyBtn();
  if (!modal) return;
  setVsShareBlurb();
  if (copyBtn) copyBtn.textContent = 'Copy link';
  modal.classList.remove('hidden');
  copyBtn?.focus();
}

function hideVsShareModal() {
  elements.vsShareModal()?.classList.add('hidden');
}

function showCoopShareModal() {
  const modal = elements.coopShareModal();
  const doneBtn = elements.coopShareDoneBtn();
  const copyBtn = elements.coopShareCopyBtn();
  if (!modal) return;
  if (doneBtn) doneBtn.disabled = true;
  if (copyBtn) copyBtn.textContent = 'Copy link';
  modal.classList.remove('hidden');
  copyBtn?.focus();
}

function hideCoopShareModal() {
  elements.coopShareModal()?.classList.add('hidden');
}

async function copyCoopLink() {
  const link = getCoopShareUrl();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      const btn = elements.coopCopyBtn();
      if (btn) {
        btn.textContent = 'Copied!';
        btn.disabled = true;
        setTimeout(() => { btn.textContent = 'Copy link'; btn.disabled = false; }, 2000);
      }
    }
  } catch (_) {}
}

function applyCoopState(state) {
  let sport = state.s || currentSport;
  if (sport === 'football') sport = 'epl';
  currentSport = sport;
  currentRound = state.r || 1;
  coopSeed = state.e;
  guesses = state.g || [];
  const cfgKeys = new Set(getSportConfig().criteriaKeys);
  revealedCriteria = new Set((state.rc || []).filter(k => cfgKeys.has(k)));
  revealedQuality = { ...state.rq || {} };
  Object.keys(revealedQuality).forEach(k => {
    if (!cfgKeys.has(k)) delete revealedQuality[k];
  });
  exactRevealedCriteria = new Set(
    Object.keys(revealedQuality).filter(k => revealedQuality[k] === 'full')
  );
  bonusClueUnlocked = state.b || false;
  guessSubmitTimes = [];
  coopGuessDeltasMs = Array.isArray(state.gd) ? state.gd : null;
  if (coopGuessDeltasMs && coopGuessDeltasMs.length !== guesses.length) {
    coopGuessDeltasMs = null;
  }
  attemptsLeft = MAX_ATTEMPTS - guesses.length;
  coopMode = true;

  players = getPlayersForRound(currentSport, currentRound);
  answer = coopSeed != null ? getAnswerFromSeed(players, coopSeed) : null;
  if (!answer && players.length) answer = players[0];
}

function startCoopGame() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  clearVsMode();
  resetSessionRoundScores();
  coopMode = true;
  coopSeed = Math.floor(Math.random() * 0x7fffffff);
  currentSport = currentSport || 'nfl';
  currentRound = currentRound || 1;
  players = getPlayersForRound(currentSport, currentRound);
  answer = getAnswerFromSeed(players, coopSeed);
  attemptsLeft = MAX_ATTEMPTS;
  bonusClueUnlocked = false;
  guesses = [];
  guessSubmitTimes = [];
  coopGuessDeltasMs = null;
  revealedCriteria.clear();
  exactRevealedCriteria.clear();
  revealedQuality = {};
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
  } else if (currentSport === 'nhl') {
    elements.nhlConferenceFilter().value = '';
    elements.nhlTeamFilter().value = '';
    populateNhlFilters();
  } else if (currentSport === 'epl') {
    elements.eplClubFilter().value = '';
    populateEplFilters();
  } else if (currentSport === 'all') {
    elements.allSportFilter().value = '';
  }

  showSportUI();
  populateSelect();
  resetClueSlots();
  syncClueSlotsFromRevealed();
  updateWrongGuesses();

  elements.guessSelect().value = '';
  elements.guessSelect().disabled = false;
  elements.guessBtn().disabled = false;
  const bonusBtn = elements.bonusClueBtn();
  if (bonusBtn) bonusBtn.disabled = bonusClueUnlocked;
  elements.bonusClue().classList.toggle('hidden', !bonusClueUnlocked);
  elements.bonusClue().classList.toggle('revealed', bonusClueUnlocked);
  elements.bonusClue().textContent = bonusClueUnlocked ? formatBonusClue() : '';
  elements.message().textContent = "Your turn! Pick a player and press Guess.";
  elements.message().className = 'message';
  elements.attempts().textContent = attemptsLeft;
  elements.timer().textContent = '—';
  elements.gameOver().classList.add('hidden');

  roundStartTime = Date.now();
  updateRoundDisplay();
  hideCoopBanner();
  updateCoopActionButtonUi();
  history.replaceState(null, '', getCoopLink());
  if (!isTouchDevice()) elements.guessSelect().focus();
}

function syncClueSlotsFromRevealed() {
  const cfg = getSportConfig();
  const grid = getClueGrid();
  cfg.criteriaKeys.forEach(key => {
    if (!revealedCriteria.has(key)) return;
    const slot = $(`[data-key="${key}"]`, grid);
    if (!slot) return;
    const valEl = slot.querySelector('.clue-value');
    const hiddenEl = slot.querySelector('.clue-hidden');
    if (!valEl || !hiddenEl) return;
    const q = revealedQuality[key];
    let text = q === 'full' ? getAnswerVal(key) : '';
    const cfg2 = getSportConfig();
    if (cfg2.numericKeys.includes(key) && q && q !== 'full') {
      const lastGuess = guesses.length ? findPlayer(guesses[guesses.length - 1]) : null;
      if (lastGuess) {
        const res = getNumericDisplay(key, lastGuess[key], answer[key]);
        text = res.text;
      }
    }
    valEl.querySelector('.value-text').textContent = text;
    valEl.classList.remove('hidden', 'value-correct', 'value-close', 'value-far');
    if (q === 'close') valEl.classList.add('value-close');
    else if (q === 'far') valEl.classList.add('value-far');
    else if (q === 'full') valEl.classList.add('value-correct');
    valEl.classList.remove('hidden');
    hiddenEl.classList.add('hidden');
  });
}

function loadCoopFromUrl() {
  let state = null;
  const params = new URLSearchParams(location.search);
  const q = params.get('coop');
  if (q) {
    state = decodeCoopState(urlParamToCoopStateB64(q));
  } else {
    const hash = location.hash.slice(1);
    if (hash.startsWith('coop-')) {
      state = decodeCoopState(hash.slice(5));
    }
  }
  if (!state || state.e == null) return false;
  vsMode = false;
  vsSessionSeed = null;
  incomingChallengerScore = null;
  applyCoopState(state);
  showSportUI();
  populateSelect();
  syncClueSlotsFromRevealed();
  updateWrongGuesses();

  elements.guessSelect().value = '';
  elements.guessSelect().disabled = false;
  elements.guessBtn().disabled = false;
  const bonusBtn = elements.bonusClueBtn();
  if (bonusBtn) bonusBtn.disabled = bonusClueUnlocked;
  elements.bonusClue().classList.toggle('hidden', !bonusClueUnlocked);
  elements.bonusClue().classList.toggle('revealed', bonusClueUnlocked);
  elements.bonusClue().textContent = bonusClueUnlocked ? formatBonusClue() : '';
  elements.attempts().textContent = attemptsLeft;
  elements.timer().textContent = '—';
  elements.gameOver().classList.add('hidden');

  const gameOver = attemptsLeft <= 0 || guesses.some(n => normalizeName(n) === normalizeName(answer?.name));
  if (gameOver) {
    if (attemptsLeft <= 0) lose();
    else win(guesses.length === 1, guesses.length === MAX_ATTEMPTS);
  } else {
    elements.message().textContent = "Your turn! Pick a player and press Guess.";
    elements.message().className = 'message';
    hideCoopBanner();
  }
  if (!q && location.hash.startsWith('#coop-')) {
    history.replaceState(null, '', getCoopLink());
  }
  updateCoopActionButtonUi();
  return true;
}

function getSportConfig() {
  return SPORTS[currentSport];
}

function getBasePlayers(sport = currentSport) {
  if (sport === 'all') return [];
  if (sport === 'golf' && typeof GOLF_PLAYER_DATA !== 'undefined') return GOLF_PLAYER_DATA;
  if (sport === 'mlb' && typeof PLAYER_DATA !== 'undefined') return PLAYER_DATA;
  if (sport === 'nba' && typeof NBA_PLAYER_DATA !== 'undefined') return NBA_PLAYER_DATA;
  if (sport === 'nfl' && typeof NFL_PLAYER_DATA !== 'undefined') return NFL_PLAYER_DATA;
  if (sport === 'nhl' && typeof NHL_PLAYER_DATA !== 'undefined') return NHL_PLAYER_DATA;
  if (sport === 'epl' && typeof EPL_PLAYER_DATA !== 'undefined') return EPL_PLAYER_DATA;
  return [];
}

function stableHash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function deriveHandedness(name) {
  return (stableHash32(name) % 2) === 0 ? 'R' : 'L';
}

function deriveHeightInches(name, sportKey) {
  const h = stableHash32(`${sportKey}:${name}`);
  // Rough, non-cursed ranges to keep the UI sane.
  const min = sportKey === 'golf' ? 66 : sportKey === 'mlb' ? 67 : sportKey === 'epl' ? 66 : 68;
  const max = sportKey === 'golf' ? 78 : sportKey === 'mlb' ? 79 : sportKey === 'epl' ? 79 : 80;
  return min + (h % (max - min + 1));
}

/** Used for All Sports when a league dataset has no `age` field (NBA/NFL/NHL). */
function deriveAgeYears(name, sportKey) {
  const h = stableHash32(`${sportKey}:${name}:age`);
  const min = 22;
  const max = 40;
  return min + (h % (max - min + 1));
}

function getAllSportsAllocations(round) {
  const clampedRound = Math.max(1, Math.min(round, ROUND_SIZES.length));
  const size = ROUND_SIZES[clampedRound - 1];
  const sportKeys = ['nfl', 'nba', 'mlb', 'nhl', 'golf', 'epl'];
  const base = Math.floor(size / sportKeys.length);
  let remainder = size - base * sportKeys.length;
  const counts = {};
  for (const k of sportKeys) {
    counts[k] = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
  }
  const starts = {};
  for (const k of sportKeys) starts[k] = 0;
  for (let r = 1; r < clampedRound; r++) {
    const s = ROUND_SIZES[r - 1];
    const b = Math.floor(s / sportKeys.length);
    let rem = s - b * sportKeys.length;
    for (const k of sportKeys) {
      const c = b + (rem > 0 ? 1 : 0);
      rem = Math.max(0, rem - 1);
      starts[k] += c;
    }
  }
  return { sportKeys, counts, starts };
}

function buildAllSportsPlayersForRound(round) {
  const { sportKeys, counts, starts } = getAllSportsAllocations(round);
  const out = [];

  for (const sportKey of sportKeys) {
    const basePlayers = getBasePlayers(sportKey) || [];
    const start = starts[sportKey] ?? 0;
    const count = counts[sportKey] ?? 0;
    const slice = basePlayers.slice(start, start + count);

    slice.forEach((p, i) => {
      const rankIndex = start + i; // 0-based in that sport list
      const teamOrCountry = sportKey === 'golf' ? p.country : sportKey === 'epl' ? p.club : p.team;
      const posOrHand = sportKey === 'golf' ? deriveHandedness(p.name) : p.position;
      const height = (typeof p.height === 'number' && !isNaN(p.height)) ? p.height : deriveHeightInches(p.name, sportKey);
      const titles =
        sportKey === 'golf' ? (Number(p.majorWins) || 0) :
        sportKey === 'epl' ? (Number(p.trophies) || 0) :
        (typeof p.rings === 'number' ? p.rings : 0);
      const age =
        typeof p.age === 'number' && !isNaN(p.age) ? p.age : deriveAgeYears(p.name, sportKey);

      const sportLabel = sportKey.toUpperCase();
      out.push({
        name: p.name,
        sport: sportLabel,
        team: teamOrCountry || '—',
        position: posOrHand || '—',
        height,
        titles,
        age,
      });
    });
  }

  return out;
}

/** One player per club in rotation so early rounds spread across EPL teams (not just file order). */
function buildEplRoundPool(base, size) {
  if (base.length <= size) return base.slice();
  const byClub = {};
  for (const p of base) {
    const c = p.club || '—';
    if (!byClub[c]) byClub[c] = [];
    byClub[c].push(p);
  }
  const clubs = Object.keys(byClub).sort();
  const out = [];
  while (out.length < size) {
    let addedInSweep = false;
    for (const c of clubs) {
      if (byClub[c].length) {
        out.push(byClub[c].shift());
        addedInSweep = true;
        if (out.length >= size) break;
      }
    }
    if (!addedInSweep) break;
  }
  return out;
}

function getPlayersForRound(sport = currentSport, round = currentRound) {
  if (sport === 'all') return buildAllSportsPlayersForRound(round);
  const base = getBasePlayers(sport) || [];
  if (!base.length) return [];
  const clampedRound = Math.max(1, Math.min(round, ROUND_SIZES.length));
  const size = Math.min(ROUND_SIZES[clampedRound - 1], base.length);
  if (sport === 'epl') {
    return buildEplRoundPool(base, size);
  }
  return base.slice(0, size);
}

function getPlayers() {
  return getPlayersForRound();
}

function getClueGrid() {
  if (currentSport === 'golf') return elements.clueGridGolf();
  if (currentSport === 'nba') return elements.clueGridNba();
  if (currentSport === 'nfl') return elements.clueGridNfl();
  if (currentSport === 'nhl') return elements.clueGridNhl();
  if (currentSport === 'epl') return elements.clueGridEpl();
  if (currentSport === 'all') return elements.clueGridAll();
  return elements.clueGridMlb();
}

const TAGLINES = {
  mlb: 'Find the mystery player using 6 clues. 6 guesses.',
  golf: 'Find the mystery player using 6 clues. 6 guesses.',
  nba: 'Find the mystery hooper using 6 clues. 6 guesses.',
  nfl: 'Find the mystery player using 6 clues. 6 guesses.',
  nhl: 'Find the mystery skater using 6 clues. 6 guesses.',
  epl: 'Find the mystery Premier League player using 6 clues. 6 guesses.',
  all: 'All sports, one mystery athlete. 6 clues. 6 guesses.',
};

const SPORT_ICONS = {
  mlb: '⚾',
  golf: '⛳',
  nba: '🏀',
  nfl: '🏈',
  nhl: '🏒',
  epl: '⚽',
  all: '🌐',
};

function updateHeaderForSport() {
  if (elements.tagline()) {
    elements.tagline().textContent = TAGLINES[currentSport] || 'Find the mystery player using 6 clues. 6 guesses.';
  }
  if (elements.sportIcon()) {
    elements.sportIcon().textContent = SPORT_ICONS[currentSport] || '⚾';
    const ariaLabels = { mlb: 'MLB mode', golf: 'Golf mode', nba: 'NBA mode', nfl: 'NFL mode', nhl: 'NHL mode', epl: 'EPL mode', all: 'All sports mode' };
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
  if (currentSport === 'nhl') {
    const conf = elements.nhlConferenceFilter().value;
    const team = elements.nhlTeamFilter().value;
    return players.filter(p => {
      if (guessedSet.has(p.name)) return false;
      if (conf && p.league !== conf) return false;
      if (team && p.team !== team) return false;
      return true;
    });
  }
  if (currentSport === 'all') {
    const sport = elements.allSportFilter().value;
    return players.filter(p => {
      if (guessedSet.has(p.name)) return false;
      if (sport && p.sport !== sport) return false;
      return true;
    });
  }
  if (currentSport === 'epl') {
    const club = elements.eplClubFilter().value;
    return players.filter(p => {
      if (guessedSet.has(p.name)) return false;
      if (club && p.club !== club) return false;
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

function populateNhlFilters() {
  if (currentSport !== 'nhl') return;
  const confSel = elements.nhlConferenceFilter();
  const teamSel = elements.nhlTeamFilter();
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

function populateEplFilters() {
  if (currentSport !== 'epl') return;
  const clubSel = elements.eplClubFilter();
  const clubs = [...new Set(players.map(p => p.club))].sort();
  let clubVal = clubSel.value;
  if (clubVal && !clubs.includes(clubVal)) {
    clubVal = '';
    clubSel.value = '';
  }
  clubSel.innerHTML = '<option value="">All</option>' +
    clubs.map(c => `<option value="${escapeHtml(c)}" ${c === clubVal ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
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
  if (currentSport === 'all') {
    if (key === 'height') return formatHeight(answer.height);
    if (cfg.numericKeys.includes(key)) return String(answer[key]);
    return answer[key];
  }
  if (key === 'height') return formatHeight(answer.height);
  if (cfg.numericKeys.includes(key)) return String(answer[key]);
  return answer[key];
}

const audioCtx = typeof AudioContext !== 'undefined' ? new (window.AudioContext || window.webkitAudioContext)() : null;

function playOscillatorPattern(type) {
  if (!audioCtx) return;
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

/** Mobile browsers (especially iOS Safari) start AudioContext suspended; resume() is async. */
function playSound(type) {
  if (!audioCtx) return;
  const run = () => {
    try {
      playOscillatorPattern(type);
    } catch (_) {}
  };
  if (audioCtx.state !== 'running') {
    audioCtx.resume().then(run).catch(run);
  } else {
    run();
  }
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
  n => `From 25 to 150 — you ran the whole gauntlet. All six rounds, no mercy. The answer was ${n}.`,
  n => `You cleared the gauntlet. Every round. The mystery players never stood a chance. The answer was ${n}.`,
  n => `Six rounds, six W's. You didn't just play — you dominated. The answer was ${n}.`,
  n => `25, 50, 75, 100, 125, 150 … you crushed 'em all. Full run complete. The answer was ${n}.`,
  n => `Who hurt you? You just breezed through all six rounds. Legendary. The answer was ${n}.`,
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
  elements.filtersNhl().classList.toggle('hidden', currentSport !== 'nhl');
  elements.filtersEpl().classList.toggle('hidden', currentSport !== 'epl');
  elements.filtersAll().classList.toggle('hidden', currentSport !== 'all');
  elements.clueGridMlb().classList.toggle('hidden', currentSport !== 'mlb');
  elements.clueGridGolf().classList.toggle('hidden', currentSport !== 'golf');
  elements.clueGridNba().classList.toggle('hidden', currentSport !== 'nba');
  elements.clueGridNfl().classList.toggle('hidden', currentSport !== 'nfl');
  elements.clueGridNhl().classList.toggle('hidden', currentSport !== 'nhl');
  elements.clueGridEpl().classList.toggle('hidden', currentSport !== 'epl');
  elements.clueGridAll()?.classList.toggle('hidden', currentSport !== 'all');
  updateHeaderForSport();
  $$('.sport-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.sport === currentSport);
    tab.setAttribute('aria-selected', tab.dataset.sport === currentSport);
  });
}

function startGame() {
  coopMode = false;
  coopSeed = null;
  replaceUrlForLocalGame();
  hideCoopBanner();
  hideCoopGoFirstModal();
  hideCoopShareModal();
  hideVsShareModal();

  players = getPlayers();
  if (players.length === 0) {
    elements.message().textContent = 'Player data failed to load.';
    return;
  }
  if (vsMode && vsSessionSeed != null) {
    const roundSeed = deriveRoundSeed(vsSessionSeed, currentRound);
    answer = getAnswerFromSeed(players, roundSeed);
  } else {
    answer = players[Math.floor(Math.random() * players.length)];
  }
  attemptsLeft = MAX_ATTEMPTS;
  bonusClueUnlocked = false;
  guesses = [];
  guessSubmitTimes = [];
  coopGuessDeltasMs = null;
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
  } else if (currentSport === 'nhl') {
    elements.nhlConferenceFilter().value = '';
    elements.nhlTeamFilter().value = '';
    populateNhlFilters();
  } else if (currentSport === 'epl') {
    elements.eplClubFilter().value = '';
    populateEplFilters();
  } else if (currentSport === 'all') {
    elements.allSportFilter().value = '';
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
  const bonusBtnReset = elements.bonusClueBtn();
  if (bonusBtnReset) bonusBtnReset.disabled = false;
  elements.bonusClue().classList.add('hidden');
  elements.bonusClue().classList.remove('revealed');
  elements.bonusClue().textContent = '';
  elements.message().textContent = '';
  elements.message().className = 'message';
  elements.attempts().textContent = attemptsLeft;
  elements.timer().textContent = '—';
  elements.gameOver().classList.add('hidden');
  elements.finalScoreBanner()?.classList.add('hidden');

  roundStartTime = Date.now();
  updateRoundDisplay();
  updateCoopActionButtonUi();
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
  if (currentSport === 'nhl') {
    return `${formatHeight(answer.height)} · ${answer.rings} Stanley Cup${answer.rings !== 1 ? 's' : ''}`;
  }
  if (currentSport === 'epl') {
    const age = Number(answer.age) || 0;
    return `${formatHeight(answer.height)} · age ${age} · ${answer.trophies} major title${answer.trophies !== 1 ? 's' : ''} (approx.)`;
  }
  if (currentSport === 'all') {
    const age = Number(answer.age) || 0;
    return `${answer.sport} · ${formatHeight(answer.height)} · ${answer.titles} title${answer.titles !== 1 ? 's' : ''} · age ${age}`;
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
  const bonusBtnOff = elements.bonusClueBtn();
  if (bonusBtnOff) bonusBtnOff.disabled = true;
}

function calculateScore(won) {
  return getScoreBreakdown(won).score;
}

function hashStringToUnit(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function scoreSeedString(won) {
  const deltas = getGuessDeltasMs().map(d => Math.round(d));
  const rq = Object.keys(revealedQuality).sort().map(k => `${k}:${revealedQuality[k]}`).join(',');
  return [
    answer?.name || '',
    currentSport,
    guesses.join('|'),
    String(guesses.length),
    deltas.join(','),
    rq,
    won ? 'w' : 'l',
  ].join('~');
}

function roundScore2(x) {
  return Math.round(Math.min(10, Math.max(1, x)) * 100) / 100;
}

/** Only a 1-guess win can be 10. Max drops 0.5 per extra guess (2nd try cap 9.50, 3rd 9.00, …). */
function maxWinScoreForGuessCount(n) {
  if (n <= 1) return 10;
  return Math.round((10 - 0.5 * (n - 1)) * 100) / 100;
}

function fmt2(x) {
  return Math.round(x * 100) / 100;
}

function applyScoreJitter(base, won) {
  const u = hashStringToUnit(scoreSeedString(won));
  return base + (u - 0.5) * 0.14;
}

function getScoreBreakdown(won) {
  const lines = [];
  const cfg = getSportConfig();
  const n = guesses.length;
  const deltas = getGuessDeltasMs();

  const filterPenaltyApplied =
    cfg.hasFilters && !legendsMode && filtersUsedThisGame;

  if (won) {
    if (n === 1) {
      let score = 10;
      if (filterPenaltyApplied) {
        score = 9;
      }
      lines.push({ label: 'Perfect round (1 guess)', value: null });
      if (filterPenaltyApplied) {
        lines.push({ label: 'Filters used', value: -1 });
      }
      lines.push({ label: 'Round score', value: score });
      return { score, lines };
    }

    const extraGuesses = n - 1;
    let guessPenalty = 0;
    for (let i = 0; i < extraGuesses; i++) {
      guessPenalty += 0.52 + i * 0.1;
    }

    let timePenalty = 0;
    deltas.forEach((d, idx) => {
      const sec = Math.max(0.05, d / 1000);
      const w = 0.016 + idx * 0.0045;
      timePenalty += w * Math.pow(sec, 0.55);
    });

    let raw = 10 - guessPenalty - timePenalty;

    if (filterPenaltyApplied) {
      raw -= 1;
    }

    raw = applyScoreJitter(raw, true);
    let score = roundScore2(raw);
    const ceiling = maxWinScoreForGuessCount(n);
    score = Math.min(score, ceiling);
    score = Math.round(Math.min(10, Math.max(1, score)) * 100) / 100;

    lines.push({ label: 'Starting from', value: 10 });
    if (guessPenalty > 0) {
      lines.push({
        label: `${extraGuesses} miss${extraGuesses !== 1 ? 'es' : ''} before correct`,
        value: -fmt2(guessPenalty),
      });
    }
    if (timePenalty > 0) {
      lines.push({ label: 'Time across guesses (slower = lower)', value: -fmt2(timePenalty) });
    }
    if (filterPenaltyApplied) {
      lines.push({ label: 'Filters used', value: -1 });
    }
    lines.push({ label: `Round score (max ${ceiling.toFixed(2)} for ${n} guesses)`, value: score });
    return { score, lines };
  }

  const score = 0;
  lines.push({ label: 'Wrong answer — no points this round', value: null });
  lines.push({ label: 'Round score', value: score });
  return { score, lines };
}

function showScoreBreakdown(won) {
  const { score, lines } = getScoreBreakdown(won);
  const content = $('#scoreBreakdownContent');
  const overlay = $('#scoreBreakdownOverlay');
  if (!content || !overlay) return;
  content.innerHTML = `<p class="score-breakdown-total">Final: ${typeof score === 'number' ? score.toFixed(2) : escapeHtml(String(score))}</p><ul class="score-breakdown-list">` +
    lines.map(l => `<li>${escapeHtml(l.label)}${l.value !== null ? ` <span class="score-breakdown-value">${typeof l.value === 'number' ? l.value.toFixed(2) : escapeHtml(String(l.value))}</span>` : ''}</li>`).join('') +
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
  if (coopMode) hideCoopBanner();
  stopTimer();
  elements.guessSelect().disabled = true;
  elements.guessBtn().disabled = true;
  const bonusBtnOff = elements.bonusClueBtn();
  if (bonusBtnOff) bonusBtnOff.disabled = true;

  const score = calculateScore(true);
  sessionRoundScores.push(score);
  const scoreStr = score.toFixed(2);
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
  const finalBlock = currentRound === ROUND_SIZES.length ? finalScorePanelHtml() + vsCompareHtml() : '';
  elements.message().innerHTML = `${msg} ${legendsBadge} <span class="round-score score-clickable" role="button" tabindex="0" title="Click for breakdown">Score: ${scoreStr}</span> ${finalBlock} <button type="button" id="nextRoundBtn" class="secondary small">${escapeHtml(nextRoundLabel)}</button><div class="answer-summary">${formatAnswerSummary()}</div>`;
  elements.message().className = 'message ' + (isFirstTry ? 'first-try' : 'win');
  $('#nextRoundBtn')?.addEventListener('click', () => {
    if (currentRound < ROUND_SIZES.length) currentRound++;
    startGame();
  });
}

function lose() {
  if (coopMode) hideCoopBanner();
  stopTimer();
  elements.guessSelect().disabled = true;
  elements.guessBtn().disabled = true;
  const bonusBtnOff = elements.bonusClueBtn();
  if (bonusBtnOff) bonusBtnOff.disabled = true;

  const score = calculateScore(false);
  sessionRoundScores.push(score);
  const scoreStr = score.toFixed(2);
  const sessionTotal = getSessionTotalScore();
  elements.gameOver().classList.remove('hidden');
  elements.gameOverTitle().textContent = 'Game over';
  elements.gameOverText().innerHTML = `The answer was <strong>${answer.name}</strong><div class="answer-summary">${formatAnswerSummary()}</div><span class="round-score score-clickable" role="button" tabindex="0" title="Click for breakdown">Round score: ${scoreStr}</span>${vsCompareHtml()}`;
  const line = elements.finalScoreLine();
  const banner = elements.finalScoreBanner();
  if (line) line.innerHTML = `${sessionTotal.toFixed(2)} <span class="final-score-max">/ ${MAX_SESSION_SCORE}</span>`;
  if (banner) banner.classList.remove('hidden');
  replaceUrlForLocalGame();
  elements.playAgainBtn().focus();
}

function handleGuess() {
  if (audioCtx && audioCtx.state !== 'running') {
    void audioCtx.resume();
  }
  const raw = elements.guessSelect().value.trim();
  if (!raw) {
    elements.message().textContent = 'Pick a player!';
    elements.message().className = 'message error';
    return;
  }

  const guessed = findPlayer(raw);
  if (!guessed) {
    elements.message().textContent = 'That name is not in the list. Pick a player from the dropdown.';
    elements.message().className = 'message error';
    return;
  }

  guessSubmitTimes.push(Date.now());

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
    } else if (currentSport === 'nhl' && (elements.nhlConferenceFilter().value || elements.nhlTeamFilter().value)) {
      filtersUsedThisGame = true;
    } else if (currentSport === 'epl' && elements.eplClubFilter().value) {
      filtersUsedThisGame = true;
    } else if (currentSport === 'all' && elements.allSportFilter().value) {
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
    } else if (coopMode) {
      history.replaceState(null, '', getCoopLink());
      elements.guessSelect().disabled = true;
      elements.guessBtn().disabled = true;
      showCoopShareModal();
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
  resetSessionRoundScores();
  clearVsMode();
  startGame();
}

let shareBtnResetTimer = null;
let vsShareBtnResetTimer = null;
let coopActionResetTimer = null;

function runCoopExitThen(callback) {
  const btn = elements.playWithFriendBtn();
  if (!btn) {
    callback();
    return;
  }
  if (btn.classList.contains('share-game-btn--checking')) return;
  if (coopActionResetTimer) {
    clearTimeout(coopActionResetTimer);
    coopActionResetTimer = null;
  }
  btn.classList.remove('share-game-btn--copied');
  btn.classList.add('share-game-btn--checking');
  const pulseStart = Date.now();
  const revealDone = () => {
    btn.classList.remove('share-game-btn--checking');
    btn.classList.add('share-game-btn--copied');
    btn.setAttribute('aria-label', 'Back to solo');
    coopActionResetTimer = setTimeout(() => {
      btn.classList.remove('share-game-btn--copied');
      coopActionResetTimer = null;
      callback();
    }, 650);
  };
  playSound('success');
  setTimeout(revealDone, Math.max(0, 400 - (Date.now() - pulseStart)));
}

function fallbackCopyToClipboard(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    return document.execCommand('copy');
  } catch (_) {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

function copyShareGameLink() {
  if (audioCtx && audioCtx.state !== 'running') {
    void audioCtx.resume();
  }
  /** Static /share/<sport>/ pages carry league-specific Open Graph tags for iMessage & social previews. */
  const origin = location.origin.replace(/\/$/, '');
  const url = `${origin}/share/${encodeURIComponent(currentSport)}/`;
  const btn = elements.shareGameBtn();
  let pulseStart = 0;
  if (btn) {
    btn.classList.remove('share-game-btn--copied');
    btn.classList.add('share-game-btn--checking');
    pulseStart = Date.now();
  }

  const revealCopied = () => {
    if (!btn) return;
    if (shareBtnResetTimer) {
      clearTimeout(shareBtnResetTimer);
      shareBtnResetTimer = null;
    }
    btn.classList.remove('share-game-btn--checking');
    btn.classList.add('share-game-btn--copied');
    btn.setAttribute('aria-label', 'Link copied');
    shareBtnResetTimer = setTimeout(() => {
      btn.classList.remove('share-game-btn--copied');
      btn.setAttribute('aria-label', 'Copy link to play this sport');
      shareBtnResetTimer = null;
    }, 2500);
  };

  const succeed = () => {
    playSound('success');
    if (!btn) return;
    const elapsed = Date.now() - pulseStart;
    const wait = Math.max(0, 400 - elapsed);
    setTimeout(revealCopied, wait);
  };

  const fail = () => {
    if (btn) {
      btn.classList.remove('share-game-btn--checking');
      btn.title = url;
    }
    setTimeout(() => {
      if (btn) btn.title = '';
    }, 12000);
  };

  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    if (fallbackCopyToClipboard(url)) succeed();
    else fail();
    return;
  }

  navigator.clipboard.writeText(url).then(() => {
    succeed();
  }).catch(() => {
    if (fallbackCopyToClipboard(url)) succeed();
    else fail();
  });
}

function copyVsLinkToClipboard() {
  if (audioCtx && audioCtx.state !== 'running') {
    void audioCtx.resume();
  }
  const url = getVsChallengeUrl();
  const btn = elements.vsModeBtn();
  let pulseStart = 0;
  if (btn) {
    btn.classList.remove('share-game-btn--copied');
    btn.classList.add('share-game-btn--checking');
    pulseStart = Date.now();
  }

  const revealCopied = () => {
    if (!btn) return;
    if (vsShareBtnResetTimer) {
      clearTimeout(vsShareBtnResetTimer);
      vsShareBtnResetTimer = null;
    }
    btn.classList.remove('share-game-btn--checking');
    btn.classList.add('share-game-btn--copied');
    btn.setAttribute('aria-label', 'Vs link copied');
    vsShareBtnResetTimer = setTimeout(() => {
      btn.classList.remove('share-game-btn--copied');
      btn.setAttribute('aria-label', 'Copy link to challenge a friend on the same game');
      vsShareBtnResetTimer = null;
    }, 2500);
  };

  const succeed = () => {
    playSound('success');
    if (!btn) return;
    const elapsed = Date.now() - pulseStart;
    const wait = Math.max(0, 400 - elapsed);
    setTimeout(revealCopied, wait);
  };

  const fail = () => {
    if (btn) {
      btn.classList.remove('share-game-btn--checking');
      btn.title = url;
    }
    setTimeout(() => {
      if (btn) btn.title = '';
    }, 12000);
  };

  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    if (fallbackCopyToClipboard(url)) succeed();
    else fail();
    return;
  }

  navigator.clipboard.writeText(url).then(() => {
    succeed();
  }).catch(() => {
    if (fallbackCopyToClipboard(url)) succeed();
    else fail();
  });
}

function openVsShareFlow() {
  if (coopMode) {
    elements.message().textContent = 'You’re in Co-op, tap Exit Co-op to continue.';
    elements.message().className = 'message error';
    return;
  }
  if (!vsMode) {
    vsMode = true;
    vsSessionSeed = Math.floor(Math.random() * 0x7fffffff);
    incomingChallengerScore = null;
    currentRound = 1;
    resetSessionRoundScores();
    startGame();
  }
  showVsShareModal();
  copyVsLinkToClipboard();
}

function init() {
  const urlSport = getSportFromUrl();
  currentSport = urlSport || 'nfl';
  players = getPlayers();
  if (players.length === 0) {
    elements.message().textContent = 'Player data failed to load.';
    return;
  }
  showSportUI();

  resetSessionRoundScores();
  if (!loadCoopFromUrl()) {
    if (!loadVsFromUrl()) {
      startGame();
    }
  }

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
  elements.nhlConferenceFilter()?.addEventListener('change', () => {
    populateNhlFilters();
    populateSelect();
  });
  elements.nhlTeamFilter()?.addEventListener('change', populateSelect);
  elements.eplClubFilter()?.addEventListener('change', populateSelect);
  elements.allSportFilter()?.addEventListener('change', populateSelect);
  document.body.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target : e.target.parentElement;
    if (!el?.closest?.('#guessBtn')) return;
    handleGuess();
  });
  elements.guessSelect().addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleGuess();
  });
  elements.bonusClueBtn()?.addEventListener('click', unlockBonusClue);
  elements.playAgainBtn().addEventListener('click', () => {
    if (currentRound < ROUND_SIZES.length) currentRound++;
    startGame();
  });
  elements.newGameBtn().addEventListener('click', () => {
    currentRound = 1;
    resetSessionRoundScores();
    clearVsMode();
    startGame();
  });
  elements.vsModeBtn()?.addEventListener('click', openVsShareFlow);
  elements.playWithFriendBtn()?.addEventListener('click', () => {
    if (coopMode) {
      runCoopExitThen(() => {
        resetSessionRoundScores();
        clearVsMode();
        startGame();
      });
    } else {
      showCoopGoFirstModal();
    }
  });
  elements.coopGoFirstBtn()?.addEventListener('click', () => {
    hideCoopGoFirstModal();
    startCoopGame();
  });
  elements.coopShareCopyBtn()?.addEventListener('click', async () => {
    const link = getCoopShareUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        elements.coopShareDoneBtn().disabled = false;
        elements.coopShareCopyBtn().textContent = 'Copied!';
      }
    } catch (_) {}
  });
  elements.coopShareDoneBtn()?.addEventListener('click', () => {
    hideCoopShareModal();
    showCoopBanner('Link copied. Send it to your friend so they can take their turn.');
  });
  elements.vsShareCopyBtn()?.addEventListener('click', async () => {
    const link = getVsChallengeUrl();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        const done = elements.vsShareDoneBtn();
        if (done) done.disabled = false;
        const c = elements.vsShareCopyBtn();
        if (c) c.textContent = 'Copied!';
      }
    } catch (_) {}
  });
  elements.coopCopyBtn()?.addEventListener('click', copyCoopLink);
  elements.shareGameBtn()?.addEventListener('click', () => {
    copyShareGameLink();
  });
  document.addEventListener('click', (e) => {
    const t = e.target;
    const el = t instanceof Element ? t : t.parentElement;
    if (!el?.closest?.('.score-clickable')) return;
    const inGameOver = elements.gameOver() && !elements.gameOver().classList.contains('hidden');
    showScoreBreakdown(!inGameOver);
  });
  $('#scoreBreakdownClose')?.addEventListener('click', () => $('#scoreBreakdownOverlay')?.classList.add('hidden'));
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#coop-')) location.reload();
  });
  window.addEventListener('popstate', () => {
    const sp = new URLSearchParams(location.search);
    if (sp.get('coop') || sp.get('vs')) location.reload();
  });

  /** Unlock audio on first tap so clue sounds (fired from setTimeout) and async share copy can play. */
  if (audioCtx) {
    const unlockAudio = () => {
      if (audioCtx.state !== 'closed') {
        audioCtx.resume().catch(() => {});
      }
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('click', unlockAudio);
    };
    document.addEventListener('touchstart', unlockAudio, { passive: true });
    document.addEventListener('click', unlockAudio);
  }

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

/**
 * Help + Vs modal dismiss: runs before init() so it still works if init() throws or
 * returns early. Uses document delegation so clicks on the ❓ inside #helpBtn work
 * reliably. Vs "Done" must not use the HTML disabled attribute or clicks never fire.
 */
function setupGlobalUi() {
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (el.closest('#helpBtn')) {
      e.preventDefault();
      $('#helpPanel')?.classList.remove('hidden');
      $('#helpCloseBtn')?.focus();
      return;
    }
    if (el.closest('#helpCloseBtn')) {
      $('#helpPanel')?.classList.add('hidden');
      $('#helpBtn')?.focus();
      return;
    }
    if (el.closest('#vsShareDoneBtn')) {
      hideVsShareModal();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const hp = $('#helpPanel');
    if (!hp || hp.classList.contains('hidden')) return;
    hp.classList.add('hidden');
    $('#helpBtn')?.focus();
  });
}

setupGlobalUi();
init();
})();
