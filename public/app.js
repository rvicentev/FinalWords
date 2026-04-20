// =============================================================
//  app.js — Final Sentence · Cliente
// =============================================================
'use strict';

// ── Seguridad: deshabilitar console en producción parcialmente ─
// (el servidor valida todo; esto dificulta el abuso desde consola)
(function() {
  const _warn = console.warn.bind(console);
  let _token = null;

  // El token se asigna desde el servidor y se guarda aquí
  window.__setToken = (t) => { _token = t; };

  // Monkey-patch del socket para requerir token en eventos críticos
  window.__getToken = () => _token;

  // Bloquear escritura directa de socket desde la consola
  Object.defineProperty(window, '_socketDirect', {
    get() { _warn('[FS] No access'); return null; },
    set() { _warn('[FS] No access'); },
  });
})();

// ── Conexión ──────────────────────────────────────────────────
const socket = io();

// ── Estado ────────────────────────────────────────────────────
const state = {
  playerId:       null,
  playerName:     '',
  roomCode:       '',
  hostId:         null,
  isHost:         false,
  players:        [],
  difficulty:     'normal',
  diffConfig:     null,

  // Juego
  currentPhrase:       '',
  nextPhraseText:      null,
  phraseIndexInBlock:  0,
  blockIndex:          0,
  totalBlocks:         3,
  phrasesPerBlock:     6,
  lives:               3,
  maxLives:            3,
  typedText:           '',

  // Flags de estado de juego
  composing:      false,
  penaltyActive:  false,
  rouletteActive: false,
  isEliminated:   false,
  isFinished:     false,
  inBlockRest:    false,

  // Timers
  penaltyTimer:   null,
  blockRestTimer: null,

  // Resultado de ruleta pendiente
  pendingRoulette: null,
};

// ── Web Audio ─────────────────────────────────────────────────
let _ac = null;
function ac() { if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)(); return _ac; }
function tone(freq, dur, type='sine', vol=0.12) {
  try {
    const o = ac().createOscillator(), g = ac().createGain();
    o.connect(g); g.connect(ac().destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac().currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac().currentTime + dur);
    o.start(); o.stop(ac().currentTime + dur);
  } catch(_) {}
}
const snd = {
  key:     () => tone(900, 0.04, 'sine', 0.07),
  error:   () => { tone(220, 0.1, 'sawtooth', 0.18); setTimeout(() => tone(160, 0.12, 'sawtooth', 0.18), 70); },
  done:    () => [523,659,784,1047].forEach((f,i) => setTimeout(() => tone(f,0.14,'sine',0.13), i*70)),
  block:   () => [440,554,659,880,1047].forEach((f,i) => setTimeout(() => tone(f,0.18,'sine',0.15), i*80)),
  elim:    () => [300,250,200,150].forEach((f,i) => setTimeout(() => tone(f,0.2,'sawtooth',0.2), i*90)),
  roul:    () => { let t=0; for(let i=0;i<8;i++) { setTimeout(()=>tone(600-i*30,0.05,'square',0.08),t); t+=60+i*25; } },
  bullet:  () => { tone(80,0.3,'sawtooth',0.3); setTimeout(()=>tone(50,0.4,'sawtooth',0.2),100); },
  saved:   () => [880,1100,1320].forEach((f,i) => setTimeout(()=>tone(f,0.15,'sine',0.15),i*80)),
};

// ── DOM helpers ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const html = str => { const d = document.createElement('div'); d.innerHTML = str; return d.firstChild; };

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}
function showError(id, msg) {
  const el = $(id); el.textContent = msg; el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function emoji(name) {
  const e=['🎮','🕹️','⚡','🔥','💀','🌀','🎯','⭐','🚀','💎'];
  let c=0; for(const ch of name) c+=ch.charCodeAt(0); return e[c%e.length];
}

// ── Seguridad: token de sesión ────────────────────────────────
socket.on('session-token', ({ token }) => {
  window.__setToken(token);
});

// ════════════════════════════════════════════════════
//  HOME
// ════════════════════════════════════════════════════
const inputName = $('input-name');
const inputCode = $('input-code');

$('btn-create').addEventListener('click', () => {
  const name = inputName.value.trim();
  const diff = state.difficulty || 'normal';
  if (!name) return showError('home-error', 'Introduce tu nombre.');
  socket.emit('create-room', { playerName: name, difficulty: diff });
});
$('btn-join').addEventListener('click', () => {
  const name = inputName.value.trim();
  const code = inputCode.value.trim().toUpperCase();
  if (!name) return showError('home-error', 'Introduce tu nombre.');
  if (code.length !== 5) return showError('home-error', 'El código debe tener 5 caracteres.');
  socket.emit('join-room', { roomCode: code, playerName: name });
});
inputName.addEventListener('keydown', e => { if (e.key==='Enter') { inputCode.value.trim().length===5 ? $('btn-join').click() : $('btn-create').click(); } });
inputCode.addEventListener('keydown', e => { if (e.key==='Enter') $('btn-join').click(); });
inputCode.addEventListener('input', () => { inputCode.value = inputCode.value.toUpperCase(); });

// ════════════════════════════════════════════════════
//  LOBBY
// ════════════════════════════════════════════════════
$('btn-leave').addEventListener('click', () => { socket.disconnect(); setTimeout(()=>location.reload(),100); });
$('btn-copy-code').addEventListener('click', () => {
  navigator.clipboard?.writeText(state.roomCode);
  const b=$('btn-copy-code'); b.textContent='✓'; b.classList.add('copied');
  setTimeout(()=>{ b.textContent='⧉'; b.classList.remove('copied'); }, 1600);
});
$('btn-start').addEventListener('click', () => socket.emit('start-game'));

// Difficulty buttons
document.querySelectorAll('.diff-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.diff-opt').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    // host changes difficulty by leaving and re-creating... or we just track locally for create
    state.difficulty = btn.dataset.diff;
    updateDiffDesc(state.difficulty);
  });
});

function updateDiffDesc(diff) {
  const descs = {
    easy:   'Sin tildes · Frases cortas · 3 vidas por bloque · Ruleta suave',
    normal: 'Con tildes · Frases medianas · 3 vidas por bloque',
    hard:   'Tildes + diéresis · Frases largas · 2 vidas · Ruleta agresiva',
    hell:   'Todo · Frases muy largas · 2 vidas · Ruleta extrema',
  };
  $('diff-desc').textContent = descs[diff] || '';
}
updateDiffDesc('normal');

// Chat
function sendChat() {
  const msg = $('chat-input').value.trim();
  if (!msg) return;
  socket.emit('chat-message', { message: msg });
  $('chat-input').value = '';
}
$('btn-chat-send').addEventListener('click', sendChat);
$('chat-input').addEventListener('keydown', e => { if(e.key==='Enter') sendChat(); });

function addChat(playerName, message, sys=false) {
  const log = $('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-entry${sys?' sys':''}`;
  if (sys) div.innerHTML = `<span class="cm">${escHtml(message)}</span>`;
  else div.innerHTML = `<span class="cn">${escHtml(playerName)}</span><span class="cm">${escHtml(message)}</span>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function renderLobbyPlayers(players) {
  const list = $('lobby-players');
  list.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = `player-entry${p.id===state.playerId?' is-you':''}`;
    const badges = [];
    if (p.isHost) badges.push(`<span class="badge badge-host">ANFITRIÓN</span>`);
    if (p.id===state.playerId) badges.push(`<span class="badge badge-you">TÚ</span>`);
    div.innerHTML = `
      <div class="player-avatar">${emoji(p.name)}</div>
      <div class="player-name">${escHtml(p.name)}</div>
      ${badges.join('')}`;
    list.appendChild(div);
  });
  $('player-count').textContent = players.length;
}

function updateLobbyHostUI() {
  const hc = $('lobby-host-controls');
  const wm = $('lobby-waiting-msg');
  const ds = $('diff-selector');
  if (state.isHost) {
    hc.classList.remove('hidden'); wm.classList.add('hidden');
    ds.classList.remove('hidden');
  } else {
    hc.classList.add('hidden'); wm.classList.remove('hidden');
    ds.classList.add('hidden');
  }
}

function setDiffBadge(diff, config) {
  const badge = $('lobby-diff-badge');
  badge.textContent = `${config?.emoji||''} ${config?.label||diff}`;
  badge.className = `diff-badge ${diff}`;
}

// ════════════════════════════════════════════════════
//  JUEGO — Área de escritura
// ════════════════════════════════════════════════════
const typingInput   = $('typing-input');
const phraseDisplay = $('phrase-display');
const typingHint    = $('typing-hint');

function canType() {
  return !state.penaltyActive && !state.rouletteActive
      && !state.isEliminated && !state.isFinished && !state.inBlockRest;
}

// Click / keydown → focus
$('game-arena').addEventListener('click', () => { if (canType()) { typingInput.focus(); typingHint.classList.add('gone'); } });
document.addEventListener('keydown', e => {
  if (!$('screen-game').classList.contains('active')) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (canType()) { typingInput.focus(); typingHint.classList.add('gone'); }
});

// Composition (dead keys, tildes)
typingInput.addEventListener('compositionstart', () => { state.composing = true; });
typingInput.addEventListener('compositionend',   () => { state.composing = false; validate(); });
typingInput.addEventListener('input', () => { if (!state.composing) validate(); });
typingInput.addEventListener('paste', e => e.preventDefault());
typingInput.addEventListener('keydown', e => {
  if (e.key === 'Backspace') {
    e.preventDefault();
    if (canType() && typingInput.value.length > 0) triggerError();
  }
});

function validate() {
  if (!canType()) { typingInput.value = state.typedText; return; }
  const typed  = typingInput.value;
  const phrase = state.currentPhrase;
  for (let i=0; i<typed.length; i++) {
    if (typed[i] !== phrase[i]) { triggerError(); return; }
  }
  state.typedText = typed;
  renderPhrase(typed);
  snd.key();
  if (typed === phrase) phraseComplete();
}

// ── Render de frase con palabras como unidades atómicas ───────
function renderPhrase(typed) {
  const phrase = state.currentPhrase;
  phraseDisplay.innerHTML = '';
  let charIdx = 0;

  // Dividir en tokens: palabras y espacios
  const tokens = phrase.split(/(\s+)/);

  tokens.forEach(token => {
    if (!token) return;
    const isSpace = /^\s+$/.test(token);

    if (isSpace) {
      // Renderizar cada espacio como char independiente (no en .word para permitir salto)
      for (const ch of token) {
        const span = document.createElement('span');
        span.className = 'char ' + charState(charIdx, typed);
        span.textContent = '\u00A0';
        phraseDisplay.appendChild(span);
        charIdx++;
      }
    } else {
      // Palabra: envolver en .word para que no se parta
      const wordSpan = document.createElement('span');
      wordSpan.className = 'word';
      for (const ch of token) {
        const span = document.createElement('span');
        span.className = 'char ' + charState(charIdx, typed);
        span.textContent = ch;
        wordSpan.appendChild(span);
        charIdx++;
      }
      phraseDisplay.appendChild(wordSpan);
    }
  });
}

function charState(i, typed) {
  if (i < typed.length) return typed[i] === state.currentPhrase[i] ? 'correct' : 'error';
  if (i === typed.length) return 'current';
  return 'pending';
}

// ── Inicio de frase ───────────────────────────────────────────
function startPhrase(phrase, nextPhrase, idxInBlock, blockIdx) {
  state.currentPhrase      = phrase;
  state.nextPhraseText     = nextPhrase;
  state.phraseIndexInBlock = idxInBlock;
  state.blockIndex         = blockIdx;
  state.typedText          = '';
  state.penaltyActive      = false;
  state.rouletteActive     = false;
  state.inBlockRest        = false;
  if (state.penaltyTimer) { clearInterval(state.penaltyTimer); state.penaltyTimer = null; }

  typingInput.value = '';
  $('penalty-bar').classList.add('hidden');
  $('roulette-overlay').classList.add('hidden');
  $('block-rest-overlay').classList.add('hidden');
  $('eliminated-overlay').classList.add('hidden');

  renderPhrase('');
  updateHUDPhrase();
  updateNextPreview();
  setTimeout(() => { typingInput.focus(); typingHint.classList.add('gone'); }, 80);
}

function updateNextPreview() {
  const prev = $('next-phrase-preview');
  if (state.nextPhraseText) {
    $('next-phrase-text').textContent = state.nextPhraseText;
    prev.classList.remove('hidden');
  } else {
    prev.classList.add('hidden');
  }
}

// ── Error / Ruleta ────────────────────────────────────────────
function triggerError() {
  if (!canType()) return;
  snd.error();
  state.rouletteActive = true;
  typingInput.value = '';
  state.typedText   = '';
  renderPhrase('');

  // Sacudida
  const arena = $('game-arena');
  arena.classList.remove('shake');
  void arena.offsetWidth;
  arena.classList.add('shake');

  // Mostrar ruleta con animación, servidor responde con resultado
  showRoulette(null); // sin resultado aún
  socket.emit('phrase-error');
}

function showRoulette(result) {
  // Marcar la cámara con bala (si ya hay resultado)
  const wheel = $('roulette-wheel');
  const pctEl = $('roulette-pct');
  const verdEl = $('roulette-result');
  const centerEl = wheel.querySelector('.rw-center');

  // Reset cámaras
  wheel.querySelectorAll('.rw-chamber').forEach(c => {
    c.classList.remove('bullet', 'safe');
  });
  verdEl.classList.add('hidden');
  verdEl.textContent = '';
  centerEl.textContent = '?';

  $('roulette-overlay').classList.remove('hidden');

  if (result === null) {
    // Esperando resultado del servidor: girar rápido
    wheel.className = 'roulette-wheel spinning';
    snd.roul();
    return;
  }

  // Resultado recibido
  state.pendingRoulette = result;
  pctEl.textContent = `Peligro: ${Math.round(result.deathChance * 100)}%`;

  // Detener y desacelerar
  wheel.className = 'roulette-wheel slowing';

  // Esperar a que pare (~2s) y mostrar resultado
  setTimeout(() => {
    wheel.className = 'roulette-wheel'; // parado

    // Elegir qué cámara mostrar
    if (result.dies || result.lifeElim) {
      // Bullet en posición aleatoria
      const bulletIdx = Math.floor(Math.random() * 6);
      wheel.querySelectorAll('.rw-chamber')[bulletIdx].classList.add('bullet');
      centerEl.textContent = '💀';
      verdEl.className = 'roulette-verdict dead';
      verdEl.textContent = result.dies ? '☠ ELIMINADO' : '💔 SIN VIDAS';
      verdEl.classList.remove('hidden');
      snd.bullet();
    } else {
      // Cámaras vacías: marcarlas en verde
      wheel.querySelectorAll('.rw-chamber').forEach(c => c.classList.add('safe'));
      centerEl.textContent = '✓';
      verdEl.className = 'roulette-verdict saved';
      verdEl.textContent = '✓ SALVADO';
      verdEl.classList.remove('hidden');
      snd.saved();
    }
  }, 2200);

  // Después del resultado: aplicar consecuencias
  setTimeout(() => {
    $('roulette-overlay').classList.add('hidden');
    state.rouletteActive = false;

    if (result.dies || result.lifeElim) {
      // Eliminación gestionada por el servidor (evento player-eliminated)
      state.isEliminated = true;
      snd.elim();
      $('eliminated-overlay').classList.remove('hidden');
    } else {
      // Sobrevivió: actualizar vidas y aplicar penalización
      updateLives(result.lives, state.maxLives);
      startPenalty();
    }
  }, 4000);
}

// ── Penalización de 5s ────────────────────────────────────────
function startPenalty() {
  state.penaltyActive = true;
  typingInput.blur();
  $('penalty-bar').classList.remove('hidden');
  let rem = 5;
  $('penalty-count').textContent = rem;
  if (state.penaltyTimer) clearInterval(state.penaltyTimer);
  state.penaltyTimer = setInterval(() => {
    rem--;
    $('penalty-count').textContent = rem;
    if (rem <= 0) {
      clearInterval(state.penaltyTimer);
      state.penaltyTimer  = null;
      state.penaltyActive = false;
      $('penalty-bar').classList.add('hidden');
      // Avisar servidor para reiniciar timer anti-trampa
      socket.emit('penalty-done');
      if (canType()) { typingInput.focus(); }
    }
  }, 1000);
}

// ── Completar frase ───────────────────────────────────────────
function phraseComplete() {
  snd.done();
  state.typedText = '';
  typingInput.value = '';
  socket.emit('phrase-complete', { typedText: state.currentPhrase });
}

// ── Actualizar vidas ──────────────────────────────────────────
function updateLives(lives, maxLives) {
  state.lives    = lives;
  state.maxLives = maxLives;
  $('hud-lives').textContent = '❤'.repeat(lives) + '🖤'.repeat(Math.max(0, maxLives - lives));
}

// ── HUD Frase ─────────────────────────────────────────────────
function updateHUDPhrase() {
  const i   = state.phraseIndexInBlock;
  const tot = state.phrasesPerBlock;
  $('pp-fill').style.width = `${(i / tot) * 100}%`;
  $('pp-label').textContent = `${i}/${tot}`;
}

// ── Bloques ───────────────────────────────────────────────────
function updateBlockPips(blockIndex) {
  const pips = document.querySelectorAll('.bp');
  pips.forEach((p, i) => {
    p.classList.remove('done', 'active');
    if (i < blockIndex) p.classList.add('done');
    else if (i === blockIndex) p.classList.add('active');
  });
}

// ── Race track ────────────────────────────────────────────────
function renderRace(players) {
  const container = $('race-players');
  container.innerHTML = '';
  const total = state.totalBlocks * state.phrasesPerBlock || 18;
  players.forEach(p => {
    const pct = Math.min(100, Math.round((p.totalCompleted / total) * 100));
    const you = p.id === state.playerId;
    const div = document.createElement('div');
    div.className = 'race-player';
    div.innerHTML = `
      <div class="race-name${you?' you':''}">${escHtml(p.name.substring(0,10))}</div>
      <div class="race-bg"><div class="race-fill${you?' you':''}${p.eliminated?' elim':''}" style="width:${pct}%"></div></div>
      <div class="race-icon">${p.eliminated?'💀':you?'🏎':'🚗'}</div>`;
    container.appendChild(div);
  });
}

// ── Live ranking ──────────────────────────────────────────────
function renderLiveRanking(players) {
  const container = $('live-players');
  container.innerHTML = '';
  const total = state.totalBlocks * state.phrasesPerBlock || 18;
  players.forEach((p, i) => {
    const you   = p.id === state.playerId;
    const rank  = ['🥇','🥈','🥉'][i] || `#${i+1}`;
    const chip  = document.createElement('div');
    chip.className = `live-chip${i===0?' rank1':''}${you?' you':''}${p.eliminated?' elim':''}`;
    chip.innerHTML = `
      <span class="chip-rank${i===0?' gold':''}">${rank}</span>
      <span class="chip-name">${escHtml(p.name)}</span>
      <span class="chip-lives">${'❤'.repeat(p.lives)}${'🖤'.repeat(p.maxLives-p.lives)}</span>
      <span class="chip-progress">${p.completedBlocks}/${state.totalBlocks}B</span>`;
    container.appendChild(chip);
  });
}

// ════════════════════════════════════════════════════
//  EVENTOS SOCKET — SERVIDOR
// ════════════════════════════════════════════════════

socket.on('error-msg', ({ message }) => {
  const id = $('screen-game').classList.contains('active') ? null
           : $('screen-lobby').classList.contains('active') ? 'lobby-error' : 'home-error';
  if (id) showError(id, message);
});

// ── Room created / joined ─────────────────────────────────────
function onRoomEntered({ roomCode, playerId, hostId, players, difficulty, difficultyConfig }) {
  state.playerId  = playerId;
  state.roomCode  = roomCode;
  state.hostId    = hostId;
  state.isHost    = hostId === playerId;
  state.players   = players;
  state.difficulty = difficulty;
  state.diffConfig = difficultyConfig;

  $('lobby-room-code').textContent = roomCode;
  $('hud-room-code').textContent   = roomCode;
  setDiffBadge(difficulty, difficultyConfig);
  renderLobbyPlayers(players);
  updateLobbyHostUI();
  $('chat-messages').innerHTML = '';
}

socket.on('room-created', data => {
  onRoomEntered(data);
  addChat('', `Sala creada: ${data.roomCode}`, true);
  showScreen('lobby');
});
socket.on('room-joined', data => {
  onRoomEntered(data);
  addChat('', `Te uniste a la sala ${data.roomCode}`, true);
  showScreen('lobby');
});
socket.on('player-joined', ({ players, playerName }) => {
  state.players = players;
  renderLobbyPlayers(players);
  addChat('', `${playerName} se unió.`, true);
});
socket.on('player-left', ({ playerId, players }) => {
  state.players = players;
  renderLobbyPlayers(players);
  addChat('', 'Un jugador abandonó la sala.', true);
});
socket.on('new-host', ({ hostId }) => {
  state.hostId = hostId;
  state.isHost = hostId === state.playerId;
  updateLobbyHostUI();
  if (state.isHost) addChat('', 'Ahora eres el anfitrión.', true);
});
socket.on('chat-message', ({ playerName, message }) => addChat(playerName, message));

// ── Game started ──────────────────────────────────────────────
socket.on('game-started', ({ phrase, nextPhrase, phraseIndexInBlock, blockIndex,
                              totalBlocks, phrasesPerBlock, lives, maxLives,
                              players, difficulty, difficultyLabel, difficultyEmoji }) => {
  state.players           = players;
  state.totalBlocks       = totalBlocks;
  state.phrasesPerBlock   = phrasesPerBlock;
  state.isEliminated      = false;
  state.isFinished        = false;
  state.penaltyActive     = false;
  state.rouletteActive    = false;
  state.inBlockRest       = false;
  state.difficultyLabel   = difficultyLabel;

  updateLives(lives, maxLives);
  updateBlockPips(blockIndex);
  renderRace(players);
  renderLiveRanking(players);
  showScreen('game');

  setTimeout(() => startPhrase(phrase, nextPhrase, phraseIndexInBlock, blockIndex), 400);
});

// ── Resultado de ruleta ───────────────────────────────────────
socket.on('roulette-result', result => {
  state.pendingRoulette = result;
  $('roulette-pct').textContent = `Peligro: ${Math.round(result.deathChance * 100)}%`;
  showRoulette(result);
});

// ── Vidas actualizadas (ya gestionado dentro de roulette-result) ──
socket.on('lives-updated', ({ lives, maxLives }) => updateLives(lives, maxLives));

// ── Jugador eliminado (notificación a todos) ──────────────────
socket.on('player-eliminated', ({ playerId, playerName, players }) => {
  state.players = players;
  renderRace(players);
  renderLiveRanking(players);
  if (playerId === state.playerId) {
    state.isEliminated = true;
    // La UI de eliminación ya se muestra desde showRoulette()
  }
});

// ── Ranking update ────────────────────────────────────────────
socket.on('ranking-update', ({ players }) => {
  state.players = players;
  renderRace(players);
  renderLiveRanking(players);
});

// ── Siguiente frase (mismo bloque) ───────────────────────────
socket.on('next-phrase', ({ phrase, nextPhrase, phraseIndexInBlock, blockIndex }) => {
  startPhrase(phrase, nextPhrase, phraseIndexInBlock, blockIndex);
  updateHUDPhrase();
  updateBlockPips(blockIndex);
});

// ── Frase rechazada (anti-trampa) ─────────────────────────────
socket.on('phrase-rejected', ({ reason }) => {
  console.warn('[FS] Frase rechazada:', reason);
  // Si fue "too-fast", simplemente reiniciar sin penalización (edge case)
  if (reason === 'too-fast') {
    typingInput.value = '';
    state.typedText   = '';
    renderPhrase('');
  }
});

// ── Bloque completado ─────────────────────────────────────────
socket.on('block-complete', ({ completedBlock, nextBlock, restSecs, newLives, maxLives }) => {
  state.inBlockRest = true;
  snd.block();
  updateLives(newLives, maxLives);
  updateBlockPips(nextBlock);

  const restOv   = $('block-rest-overlay');
  const titleEl  = $('block-rest-title');
  const livesEl  = $('block-rest-lives');
  const countEl  = $('block-rest-count');

  titleEl.textContent = `BLOQUE ${completedBlock + 1} COMPLETADO`;
  livesEl.textContent = `Vidas restauradas: ${'❤'.repeat(newLives)}`;
  countEl.textContent = restSecs;
  restOv.classList.remove('hidden');

  let rem = restSecs - 1;
  if (state.blockRestTimer) clearInterval(state.blockRestTimer);
  state.blockRestTimer = setInterval(() => {
    countEl.textContent = rem;
    rem--;
    if (rem < 0) {
      clearInterval(state.blockRestTimer);
      state.blockRestTimer = null;
    }
  }, 1000);
});

// ── Inicio de nuevo bloque ────────────────────────────────────
socket.on('block-start', ({ phrase, nextPhrase, phraseIndexInBlock, blockIndex, lives, maxLives }) => {
  state.inBlockRest = false;
  updateLives(lives, maxLives);
  updateBlockPips(blockIndex);
  startPhrase(phrase, nextPhrase, phraseIndexInBlock, blockIndex);
});

// ── Fin de partida ────────────────────────────────────────────
socket.on('game-over', ({ winner, players }) => {
  state.isFinished = true;
  if (state.penaltyTimer)  { clearInterval(state.penaltyTimer); }
  if (state.blockRestTimer){ clearInterval(state.blockRestTimer); }
  setTimeout(() => renderGameOver(winner, players), 700);
});

// ═══════════════════════════════════════════
//  GAME OVER
// ═══════════════════════════════════════════
function renderGameOver(winner, players) {
  $('go-winner-name').textContent = winner.name;
  const list = $('go-player-list');
  list.innerHTML = '';
  const sorted = [...players].sort((a,b) => b.totalCompleted - a.totalCompleted);
  sorted.forEach((p, i) => {
    const rankSyms  = ['🥇','🥈','🥉'];
    const rankClass = ['rank-g','rank-s','rank-b'][i] || 'rank-o';
    const sym       = rankSyms[i] || `#${i+1}`;
    const you = p.id === state.playerId;
    const div = document.createElement('div');
    div.className = 'go-entry';
    div.innerHTML = `
      <div class="go-rank ${rankClass}">${sym}</div>
      <div class="go-name${you?' you':''}">${escHtml(p.name)}</div>
      <div class="go-stat">${p.completedBlocks}/${state.totalBlocks} bloq · ${p.totalCompleted} frases</div>
      ${p.eliminated?'<div class="go-elim-badge">ELIM</div>':''}`;
    list.appendChild(div);
  });

  if (state.isHost) {
    $('go-host-btns').classList.remove('hidden');
    $('go-guest-btns').classList.add('hidden');
  } else {
    $('go-host-btns').classList.add('hidden');
    $('go-guest-btns').classList.remove('hidden');
  }
  spawnParticles();
  showScreen('gameover');
}

function spawnParticles() {
  const c = $('particles'); c.innerHTML = '';
  const cols = ['#ffc400','#00f0ff','#00ff88','#ff7700','#c44fff','#ff2255'];
  for (let i=0; i<55; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `left:${Math.random()*100}%;bottom:0;
      background:${cols[i%cols.length]};
      animation-duration:${1.5+Math.random()*2}s;
      animation-delay:${Math.random()*0.6}s;
      width:${3+Math.random()*5}px;height:${3+Math.random()*5}px;`;
    c.appendChild(p);
  }
}

$('btn-rematch').addEventListener('click', () => socket.emit('request-rematch'));
$('btn-exit').addEventListener('click', () => { socket.disconnect(); setTimeout(()=>location.reload(),100); });
$('btn-exit-guest').addEventListener('click', () => { socket.disconnect(); setTimeout(()=>location.reload(),100); });

socket.on('rematch-ready', ({ players, hostId, difficulty, difficultyConfig }) => {
  state.hostId    = hostId;
  state.isHost    = hostId === state.playerId;
  state.players   = players;
  state.difficulty = difficulty;
  state.diffConfig = difficultyConfig;
  $('lobby-room-code').textContent = state.roomCode;
  setDiffBadge(difficulty, difficultyConfig);
  renderLobbyPlayers(players);
  updateLobbyHostUI();
  $('chat-messages').innerHTML = '';
  addChat('', '¡Revancha lista! El anfitrión puede iniciar.', true);
  showScreen('lobby');
});

// ── Init ──────────────────────────────────────────────────────
showScreen('home');
inputName.focus();
