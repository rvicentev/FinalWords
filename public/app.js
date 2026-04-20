// =============================================================
//  app.js — Final Sentence · Cliente
//  Maneja la UI, Socket.io, y la lógica de tipeo del lado cliente
// =============================================================

'use strict';

// ── Conexión al servidor ──────────────────────────────────────
const socket = io();

// ── Estado global del cliente ─────────────────────────────────
const state = {
  playerId:     null,
  playerName:   '',
  roomCode:     '',
  hostId:       null,
  isHost:       false,
  players:      [],

  // Juego
  currentPhrase:  '',
  phraseIndex:    0,
  totalPhrases:   5,
  lives:          3,
  maxLives:       3,
  typedText:      '',
  isWaiting:      false,   // esperando siguiente frase
  isEliminated:   false,
  isFinished:     false,
  countdownTimer: null,
  focused:        false,
};

// ── Sonidos (Web Audio API) ───────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', gainVal = 0.15) {
  try {
    const ctx  = getAudio();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) { /* silenciar errores de audio */ }
}

function soundCorrectChar() { playTone(880, 0.05, 'sine', 0.08); }
function soundError() {
  playTone(200, 0.12, 'sawtooth', 0.2);
  setTimeout(() => playTone(150, 0.12, 'sawtooth', 0.2), 80);
}
function soundPhraseComplete() {
  [523, 659, 784, 1047].forEach((f, i) =>
    setTimeout(() => playTone(f, 0.15, 'sine', 0.15), i * 80)
  );
}
function soundEliminated() {
  [300, 250, 200, 150].forEach((f, i) =>
    setTimeout(() => playTone(f, 0.2, 'sawtooth', 0.2), i * 100)
  );
}

// ── Utilidades DOM ────────────────────────────────────────────
const $ = id => document.getElementById(id);

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

function showError(elementId, msg) {
  const el = $(elementId);
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

// ── Pantalla: HOME ────────────────────────────────────────────
const inputName  = $('input-name');
const inputCode  = $('input-code');
const btnCreate  = $('btn-create');
const btnJoin    = $('btn-join');

btnCreate.addEventListener('click', () => {
  const name = inputName.value.trim();
  if (!name) return showError('home-error', 'Introduce tu nombre antes de crear la sala.');
  socket.emit('create-room', { playerName: name });
});

btnJoin.addEventListener('click', () => {
  const name = inputName.value.trim();
  const code = inputCode.value.trim().toUpperCase();
  if (!name) return showError('home-error', 'Introduce tu nombre.');
  if (!code || code.length !== 5) return showError('home-error', 'El código de sala debe tener 5 caracteres.');
  socket.emit('join-room', { roomCode: code, playerName: name });
});

inputName.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const code = inputCode.value.trim();
    if (code.length === 5) btnJoin.click();
    else btnCreate.click();
  }
});
inputCode.addEventListener('keydown', e => { if (e.key === 'Enter') btnJoin.click(); });
inputCode.addEventListener('input', () => {
  inputCode.value = inputCode.value.toUpperCase();
});

// ── Pantalla: LOBBY ───────────────────────────────────────────
const btnLeave    = $('btn-leave');
const btnCopyCode = $('btn-copy-code');
const btnStart    = $('btn-start');
const chatInput   = $('chat-input');
const btnChatSend = $('btn-chat-send');

btnLeave.addEventListener('click', () => {
  socket.disconnect();
  setTimeout(() => { socket.connect(); location.reload(); }, 100);
});

btnCopyCode.addEventListener('click', () => {
  copyToClipboard(state.roomCode);
  btnCopyCode.textContent = '✓';
  btnCopyCode.classList.add('copied');
  setTimeout(() => {
    btnCopyCode.textContent = '⧉';
    btnCopyCode.classList.remove('copied');
  }, 1500);
});

btnStart.addEventListener('click', () => {
  socket.emit('start-game');
});

function sendChatMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit('chat-message', { message: msg });
  chatInput.value = '';
}
btnChatSend.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });

function addChatMessage(playerName, message, isSystem = false) {
  const messages = $('chat-messages');
  const div = document.createElement('div');
  div.className = `chat-msg ${isSystem ? 'system-msg' : ''}`;
  if (!isSystem) {
    div.innerHTML = `<span class="msg-name">${escapeHtml(playerName)}</span><span class="msg-text">${escapeHtml(message)}</span>`;
  } else {
    div.innerHTML = `<span class="msg-text">${escapeHtml(message)}</span>`;
  }
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLobbyPlayers(players) {
  const list = $('lobby-players');
  list.innerHTML = '';
  players.forEach(p => {
    const div = document.createElement('div');
    div.className = `player-entry ${p.id === state.playerId ? 'is-you' : ''}`;
    const badges = [];
    if (p.isHost) badges.push('<span class="player-badge badge-host">ANFITRIÓN</span>');
    if (p.id === state.playerId) badges.push('<span class="player-badge badge-you">TÚ</span>');
    div.innerHTML = `
      <div class="player-avatar">${getPlayerEmoji(p.name)}</div>
      <div class="player-name">${escapeHtml(p.name)}</div>
      ${badges.join('')}
    `;
    list.appendChild(div);
  });
  $('player-count').textContent = players.length;
}

function getPlayerEmoji(name) {
  const emojis = ['🎮','🕹️','⚡','🔥','💀','🌀','🎯','⭐','🚀','💎'];
  let code = 0;
  for (const c of name) code += c.charCodeAt(0);
  return emojis[code % emojis.length];
}

function updateLobbyHostUI() {
  if (state.isHost) {
    $('lobby-host-controls').classList.remove('hidden');
    $('lobby-waiting-msg').classList.add('hidden');
  } else {
    $('lobby-host-controls').classList.add('hidden');
    $('lobby-waiting-msg').classList.remove('hidden');
  }
}

// ── Pantalla: JUEGO ───────────────────────────────────────────
const typingInput = $('typing-input');
const phraseDisplay = $('phrase-display');
const typingHint  = $('typing-hint');
const hudLives    = $('hud-lives');

// Hacer focus en el input al hacer clic en el área
document.querySelector('.typing-area').addEventListener('click', () => {
  if (!state.isWaiting && !state.isEliminated && !state.isFinished) {
    typingInput.focus();
    state.focused = true;
    typingHint.classList.add('active');
  }
});

// También focus con cualquier tecla en la pantalla de juego
document.addEventListener('keydown', (e) => {
  if ($('screen-game').classList.contains('active') &&
      !state.isWaiting && !state.isEliminated && !state.isFinished &&
      !e.ctrlKey && !e.altKey && !e.metaKey) {
    typingInput.focus();
    state.focused = true;
    typingHint.classList.add('active');
  }
});

// ── Lógica de escritura ───────────────────────────────────────
typingInput.addEventListener('input', (e) => {
  if (state.isWaiting || state.isEliminated || state.isFinished) {
    typingInput.value = '';
    return;
  }

  const typed   = typingInput.value;
  const phrase  = state.currentPhrase;

  // Validación carácter a carácter
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== phrase[i]) {
      // ERROR: reset inmediato
      triggerError();
      return;
    }
  }

  state.typedText = typed;
  renderPhrase(typed);
  soundCorrectChar();

  // ¿Completó la frase?
  if (typed === phrase) {
    handlePhraseComplete();
  }
});

// Evitar pegar texto
typingInput.addEventListener('paste', e => e.preventDefault());

// Evitar borrar más de lo que se tiene (backspace no borra chars correctos...)
// En este juego no permitimos borrar: cualquier error reinicia
typingInput.addEventListener('keydown', (e) => {
  if (e.key === 'Backspace') {
    e.preventDefault(); // No se puede borrar
    // Si hay texto y el último char es incorrecto, tratarlo como error
    // (el usuario no puede corregir, debe escribir perfecto)
    if (typingInput.value.length > 0) {
      triggerError();
    }
  }
});

function triggerError() {
  soundError();
  typingInput.value = '';
  state.typedText   = '';
  renderPhrase('');

  // Efecto visual de error
  const arena = document.querySelector('.game-arena');
  arena.classList.remove('shake');
  void arena.offsetWidth; // forzar reflow
  arena.classList.add('shake');

  // Barra roja
  const errorBar = $('error-bar');
  errorBar.classList.remove('hidden');
  setTimeout(() => errorBar.classList.add('hidden'), 400);

  // Notificar al servidor
  socket.emit('phrase-error');
}

function handlePhraseComplete() {
  soundPhraseComplete();
  state.isWaiting = true;
  typingInput.value = '';

  socket.emit('phrase-complete', { typedText: state.currentPhrase });
}

function renderPhrase(typed) {
  const phrase = state.currentPhrase;
  phraseDisplay.innerHTML = '';

  for (let i = 0; i < phrase.length; i++) {
    const span = document.createElement('span');
    span.className = 'char';

    if (i < typed.length) {
      span.classList.add(typed[i] === phrase[i] ? 'correct' : 'error');
    } else if (i === typed.length) {
      span.classList.add('current');
    } else {
      span.classList.add('pending');
    }

    // Espacio se renderiza como espacio visible
    span.textContent = phrase[i] === ' ' ? '\u00A0' : phrase[i];
    phraseDisplay.appendChild(span);
  }
}

function startPhrase(phrase, index, total) {
  state.currentPhrase = phrase;
  state.phraseIndex   = index;
  state.totalPhrases  = total;
  state.typedText     = '';
  state.isWaiting     = false;

  typingInput.value   = '';
  renderPhrase('');

  $('hud-phrase-counter').textContent = `${index + 1}/${total}`;
  $('waiting-overlay').classList.add('hidden');
  $('eliminated-overlay').classList.add('hidden');

  // Focus automático
  setTimeout(() => {
    typingInput.focus();
    typingHint.classList.add('active');
  }, 100);
}

function updateLives(lives, maxLives) {
  state.lives    = lives;
  state.maxLives = maxLives;
  const hearts = '❤'.repeat(lives) + '🖤'.repeat(maxLives - lives);
  hudLives.textContent = hearts;
}

// ── Race track ────────────────────────────────────────────────
function renderRaceTrack(players) {
  const container = $('race-players');
  container.innerHTML = '';
  const total = state.totalPhrases || 5;

  players.forEach(p => {
    const pct = Math.round((p.completedPhrases / total) * 100);
    const isYou = p.id === state.playerId;
    const div = document.createElement('div');
    div.className = 'race-player';
    div.innerHTML = `
      <div class="race-name ${isYou ? 'is-you' : ''}">${escapeHtml(p.name.substring(0, 10))}</div>
      <div class="race-bar-bg">
        <div class="race-bar-fill ${isYou ? 'is-you' : ''} ${p.eliminated ? 'eliminated' : ''}"
             style="width: ${pct}%"></div>
      </div>
      <div class="race-car">${p.eliminated ? '💀' : isYou ? '🏎' : '🚗'}</div>
    `;
    container.appendChild(div);
  });
}

// ── Live ranking ──────────────────────────────────────────────
function renderLiveRanking(players) {
  const container = $('live-players');
  container.innerHTML = '';
  const total = state.totalPhrases || 5;

  players.forEach((p, i) => {
    const isYou = p.id === state.playerId;
    const rankLabel = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
    const chip = document.createElement('div');
    chip.className = `live-player-chip ${i === 0 ? 'rank-1' : ''} ${isYou ? 'is-you' : ''} ${p.eliminated ? 'eliminated' : ''}`;
    chip.innerHTML = `
      <span class="chip-rank ${i === 0 ? 'gold' : ''}">${rankLabel}</span>
      <span class="chip-name">${escapeHtml(p.name)}</span>
      <span class="chip-lives">${'❤'.repeat(p.lives)}${'🖤'.repeat(p.maxLives - p.lives)}</span>
      <span class="chip-phrase">${p.completedPhrases}/${total}</span>
    `;
    container.appendChild(chip);
  });
}

// ── Game Over ─────────────────────────────────────────────────
function renderGameOver(winner, players) {
  $('gameover-winner').textContent = winner.name;

  const list = $('final-player-list');
  list.innerHTML = '';
  const sorted = [...players].sort((a, b) => b.completedPhrases - a.completedPhrases);

  sorted.forEach((p, i) => {
    const rankClasses = ['rank-gold', 'rank-silver', 'rank-bronze'];
    const rankSymbols = ['🥇', '🥈', '🥉'];
    const rankClass   = rankClasses[i] || 'rank-other';
    const rankSymbol  = rankSymbols[i] || `#${i+1}`;
    const isYou = p.id === state.playerId;

    const entry = document.createElement('div');
    entry.className = 'final-player-entry';
    entry.innerHTML = `
      <div class="final-rank ${rankClass}">${rankSymbol}</div>
      <div class="final-player-name ${isYou ? 'is-you' : ''}">${escapeHtml(p.name)}</div>
      <div class="final-phrases">${p.completedPhrases}/${state.totalPhrases} frases</div>
      ${p.eliminated ? '<div class="final-elim-badge">ELIMINADO</div>' : ''}
    `;
    list.appendChild(entry);
  });

  // Controles según rol
  if (state.isHost) {
    $('gameover-host-controls').classList.remove('hidden');
    $('gameover-guest-controls').classList.add('hidden');
  } else {
    $('gameover-host-controls').classList.add('hidden');
    $('gameover-guest-controls').classList.remove('hidden');
  }

  // Partículas de celebración
  spawnParticles();

  showScreen('gameover');
}

function spawnParticles() {
  const container = $('particles');
  container.innerHTML = '';
  const colors = ['#ffd60a', '#00e5ff', '#39ff14', '#ff6b2b', '#bf5af2', '#ff2d55'];
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      bottom: 0;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.5}s;
      width: ${3 + Math.random() * 5}px;
      height: ${3 + Math.random() * 5}px;
    `;
    container.appendChild(p);
  }
}

// Botones de Game Over
$('btn-rematch').addEventListener('click', () => {
  socket.emit('request-rematch');
});
$('btn-exit').addEventListener('click', exitToHome);
$('btn-exit-guest').addEventListener('click', exitToHome);

function exitToHome() {
  socket.disconnect();
  setTimeout(() => { location.reload(); }, 100);
}

// ── Countdown para siguiente frase ────────────────────────────
function startCountdown(seconds) {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  let remaining = seconds;
  $('countdown-num').textContent = remaining;
  $('waiting-overlay').classList.remove('hidden');

  state.countdownTimer = setInterval(() => {
    remaining--;
    $('countdown-num').textContent = remaining;
    if (remaining <= 0) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
  }, 1000);
}

// ── Eventos Socket.io ─────────────────────────────────────────

// Error del servidor
socket.on('error-msg', ({ message }) => {
  const screenName = document.querySelector('.screen.active').id;
  if (screenName === 'screen-home')  showError('home-error', message);
  if (screenName === 'screen-lobby') showError('lobby-error', message);
});

// Sala creada
socket.on('room-created', ({ roomCode, playerId, hostId, players }) => {
  state.playerId  = playerId;
  state.roomCode  = roomCode;
  state.hostId    = hostId;
  state.isHost    = true;
  state.players   = players;
  state.playerName = inputName.value.trim();

  $('lobby-room-code').textContent = roomCode;
  $('hud-room-code').textContent   = roomCode;
  renderLobbyPlayers(players);
  updateLobbyHostUI();
  addChatMessage('', '¡Sala creada! Comparte el código con tus amigos.', true);
  showScreen('lobby');
});

// Sala unida
socket.on('room-joined', ({ roomCode, playerId, hostId, players }) => {
  state.playerId  = playerId;
  state.roomCode  = roomCode;
  state.hostId    = hostId;
  state.isHost    = false;
  state.players   = players;
  state.playerName = inputName.value.trim();

  $('lobby-room-code').textContent = roomCode;
  $('hud-room-code').textContent   = roomCode;
  renderLobbyPlayers(players);
  updateLobbyHostUI();
  addChatMessage('', `Te has unido a la sala ${roomCode}.`, true);
  showScreen('lobby');
});

// Otro jugador se unió
socket.on('player-joined', ({ players, playerName }) => {
  state.players = players;
  renderLobbyPlayers(players);
  addChatMessage('', `${playerName} se ha unido a la sala.`, true);
});

// Jugador salió en lobby
socket.on('player-left', ({ playerId, players }) => {
  state.players = players;
  const p = state.players.find(p => p.id === playerId);
  renderLobbyPlayers(players);
  addChatMessage('', 'Un jugador ha abandonado la sala.', true);
});

// Nuevo anfitrión
socket.on('new-host', ({ hostId }) => {
  state.hostId = hostId;
  state.isHost = hostId === state.playerId;
  updateLobbyHostUI();
  if (state.isHost) addChatMessage('', 'Ahora eres el anfitrión.', true);
});

// Mensaje de chat
socket.on('chat-message', ({ playerName, message }) => {
  addChatMessage(playerName, message);
});

// Partida iniciada
socket.on('game-started', ({ phrase, phraseIndex, totalPhrases, players }) => {
  state.players      = players;
  state.isEliminated = false;
  state.isFinished   = false;
  state.isWaiting    = false;

  // Resetear HUD
  updateLives(3, 3);
  $('hud-room-code').textContent = state.roomCode;

  renderRaceTrack(players);
  renderLiveRanking(players);
  showScreen('game');

  // Pequeño delay dramático antes de mostrar la frase
  setTimeout(() => {
    startPhrase(phrase, phraseIndex, totalPhrases);
  }, 500);
});

// Actualización de vidas (tras error sin eliminación)
socket.on('lives-updated', ({ lives, maxLives }) => {
  updateLives(lives, maxLives);
});

// Jugador eliminado
socket.on('player-eliminated', ({ playerId, playerName, players }) => {
  state.players = players;
  renderRaceTrack(players);
  renderLiveRanking(players);

  if (playerId === state.playerId) {
    // Soy yo quien fue eliminado
    state.isEliminated = true;
    soundEliminated();
    updateLives(0, state.maxLives);
    $('eliminated-overlay').classList.remove('hidden');
    $('waiting-overlay').classList.add('hidden');
    typingInput.blur();
  }
});

// Actualización de ranking
socket.on('ranking-update', ({ players }) => {
  state.players = players;
  renderRaceTrack(players);
  renderLiveRanking(players);
});

// Frase completada (confirmación del servidor)
socket.on('phrase-complete-ack', ({ phraseIndex, totalPhrases, nextIn }) => {
  startCountdown(nextIn);
});

// Siguiente frase (enviada tras la pausa de 5 s)
socket.on('next-phrase', ({ phrase, phraseIndex, totalPhrases }) => {
  if (state.isEliminated || state.isFinished) return;
  startPhrase(phrase, phraseIndex, totalPhrases);
});

// El servidor rechazó la frase (anti-trampa)
socket.on('phrase-rejected', ({ message }) => {
  console.warn('Frase rechazada por el servidor:', message);
  triggerError();
});

// Fin de partida
socket.on('game-over', ({ winner, players }) => {
  state.isFinished = true;
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  setTimeout(() => renderGameOver(winner, players), 800);
});

// Revancha lista
socket.on('rematch-ready', ({ players, hostId }) => {
  state.hostId  = hostId;
  state.isHost  = hostId === state.playerId;
  state.players = players;

  $('lobby-room-code').textContent = state.roomCode;
  renderLobbyPlayers(players);
  updateLobbyHostUI();
  $('chat-messages').innerHTML = '';
  addChatMessage('', '¡Revancha! El anfitrión puede iniciar cuando esté listo.', true);
  showScreen('lobby');
});

// Desconexión inesperada
socket.on('disconnect', () => {
  console.warn('Desconectado del servidor.');
});

// ── Inicialización ────────────────────────────────────────────
showScreen('home');
inputName.focus();

console.log('%c FINAL SENTENCE ', 'background:#00e5ff;color:#06060d;font-family:monospace;font-size:18px;font-weight:bold;padding:6px 12px;border-radius:4px;');
console.log('%c Speed Typing Battle · Online Multiplayer ', 'color:#6c7086;font-family:monospace;');
