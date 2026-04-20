// =============================================================
//  server.js — Final Sentence · Servidor principal
//  Express + Socket.io + Seguridad
// =============================================================

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const crypto   = require('crypto');

const { RoomManager }                          = require('./roomManager');
const { BLOCK_REST_SECS, PENALTY_SECS, GAME_SECRET } = require('./gameLogic');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e4, // 10 KB máximo por mensaje
  pingTimeout:  30000,
  pingInterval: 10000,
});

const PORT        = process.env.PORT || 3000;
const roomManager = new RoomManager(io);

// ── Cabeceras de seguridad HTTP ───────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' https://cdn.socket.io; " +
    "style-src 'self' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "connect-src 'self' wss: ws:;"
  );
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiter por socket ───────────────────────────────────
class RateLimiter {
  constructor() {
    this.counts   = new Map(); // socketId → { count, resetAt }
    this.chatMap  = new Map(); // socketId → lastChatTs
  }
  // Eventos de juego: máx 30 por 5 s
  check(socketId, limit = 30, windowMs = 5000) {
    const now  = Date.now();
    const prev = this.counts.get(socketId);
    if (!prev || now > prev.resetAt) {
      this.counts.set(socketId, { count: 1, resetAt: now + windowMs });
      return true;
    }
    prev.count++;
    return prev.count <= limit;
  }
  // Chat: 1 mensaje cada 1.5 s
  checkChat(socketId) {
    const now  = Date.now();
    const last = this.chatMap.get(socketId) || 0;
    if (now - last < 1500) return false;
    this.chatMap.set(socketId, now);
    return true;
  }
  remove(socketId) {
    this.counts.delete(socketId);
    this.chatMap.delete(socketId);
  }
}
const rateLimiter = new RateLimiter();

// ── Sanitización de texto ─────────────────────────────────────
function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>"'`]/g, '').trim().substring(0, maxLen);
}

// ── Tokens de sesión (anti-suplantación) ─────────────────────
const sessionTokens = new Map(); // socketId → token

function generateToken(socketId) {
  const token = crypto
    .createHmac('sha256', GAME_SECRET)
    .update(socketId + Date.now())
    .digest('hex');
  sessionTokens.set(socketId, token);
  return token;
}

// ── Conexiones ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id}`);
  const token = generateToken(socket.id);
  socket.emit('session-token', { token });

  // ── Helper: verificar rate limit ──────────────────────────
  function rl() {
    if (!rateLimiter.check(socket.id)) {
      socket.emit('error-msg', { message: 'Demasiadas acciones. Espera un momento.' });
      return false;
    }
    return true;
  }

  // ── CREAR SALA ────────────────────────────────────────────
  socket.on('create-room', ({ playerName, difficulty }) => {
    if (!rl()) return;
    try {
      const name = sanitize(playerName, 20);
      const diff = ['easy','normal','hard','hell'].includes(difficulty) ? difficulty : 'normal';
      const { room, player } = roomManager.createRoom(socket.id, name, diff);
      socket.join(room.code);
      socket.emit('room-created', {
        roomCode:         room.code,
        playerId:         socket.id,
        hostId:           room.hostId,
        players:          room.getPlayersInfo(),
        difficulty:       room.difficulty,
        difficultyConfig: room.config,
      });
    } catch (err) { socket.emit('error-msg', { message: err.message }); }
  });

  // ── UNIRSE ────────────────────────────────────────────────
  socket.on('join-room', ({ roomCode, playerName }) => {
    if (!rl()) return;
    try {
      const name = sanitize(playerName, 20);
      const code = sanitize(roomCode, 5).toUpperCase();
      const { room, player } = roomManager.joinRoom(socket.id, code, name);
      socket.join(room.code);
      socket.emit('room-joined', {
        roomCode:         room.code,
        playerId:         socket.id,
        hostId:           room.hostId,
        players:          room.getPlayersInfo(),
        difficulty:       room.difficulty,
        difficultyConfig: room.config,
      });
      socket.to(room.code).emit('player-joined', {
        players: room.getPlayersInfo(), playerName: player.name,
      });
    } catch (err) { socket.emit('error-msg', { message: err.message }); }
  });

  // ── INICIAR ───────────────────────────────────────────────
  socket.on('start-game', () => {
    if (!rl()) return;
    try {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room)                    throw new Error('No estás en ninguna sala.');
      if (room.hostId !== socket.id) throw new Error('Solo el anfitrión puede iniciar.');
      if (room.players.length < 1)   throw new Error('Se necesita al menos 1 jugador.');
      if (room.state !== 'waiting')  throw new Error('La partida ya ha comenzado.');

      room.startGame();
      // Enviar estado inicial a cada jugador por separado (frases individualizadas)
      room.players.forEach(p => {
        const target = io.sockets.sockets.get(p.id);
        if (target) target.emit('game-started', room.getInitialState(p.id));
      });
      console.log(`[JUEGO] Sala ${room.code} iniciada`);
    } catch (err) { socket.emit('error-msg', { message: err.message }); }
  });

  // ── ERROR EN FRASE ────────────────────────────────────────
  socket.on('phrase-error', () => {
    if (!rl()) return;
    const room = roomManager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'playing') return;

    const result = room.handleRoulette(socket.id);
    if (!result) return;

    // Enviar resultado de ruleta al jugador (incluye probabilidad)
    socket.emit('roulette-result', result);

    // Actualizar ranking para todos
    io.to(room.code).emit('ranking-update', { players: room.getPlayersInfo() });

    if (result.eliminated) {
      // Delay para que el jugador vea la animación primero
      setTimeout(() => {
        io.to(room.code).emit('player-eliminated', {
          playerId:   socket.id,
          playerName: room.getPlayer(socket.id)?.name || '?',
          players:    room.getPlayersInfo(),
        });
        _checkEnd(room);
      }, 3200); // ~3s de animación de ruleta
    } else {
      // Sobrevivió: la penalización empieza en el cliente.
      // Al terminar la penalización, el cliente pide el reinicio de temporizador.
    }
  });

  // ── Cliente avisa que terminó penalización (reinicia timer) ─
  socket.on('penalty-done', () => {
    const room = roomManager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'playing') return;
    room.resetPhraseTimer(socket.id);
  });

  // ── FRASE COMPLETADA ──────────────────────────────────────
  socket.on('phrase-complete', ({ typedText }) => {
    if (!rl()) return;
    const room = roomManager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'playing') return;

    const safe = sanitize(typedText, 500);
    const result = room.handlePhraseComplete(socket.id, safe);

    if (!result.valid) {
      if (result.reason === 'too-fast') {
        console.warn(`[ANTICHEAT] ${socket.id} demasiado rápido (${result.elapsed}ms < ${result.minMs}ms)`);
      }
      socket.emit('phrase-rejected', { reason: result.reason });
      return;
    }

    // Ranking actualizado
    io.to(room.code).emit('ranking-update', { players: room.getPlayersInfo() });

    if (result.gameWon) {
      room.state = 'finished';
      io.to(room.code).emit('game-over', { winner: result.winner, players: room.getPlayersInfo() });
      return;
    }

    if (result.blockComplete) {
      // Frase completada, descanso entre bloques
      socket.emit('block-complete', {
        completedBlock: result.newBlockIndex - 1,
        nextBlock:      result.newBlockIndex,
        restSecs:       BLOCK_REST_SECS,
        newLives:       result.newLives,
        maxLives:       result.maxLives,
      });

      setTimeout(() => {
        if (room.state !== 'playing') return;
        const data = room.getBlockStartData(socket.id);
        if (data) socket.emit('block-start', data);
      }, BLOCK_REST_SECS * 1000);
    } else {
      // Siguiente frase inmediata (mismo bloque)
      socket.emit('next-phrase', {
        phrase:             result.phrase,
        nextPhrase:         result.nextPhrase,
        phraseIndexInBlock: result.phraseIndexInBlock,
        blockIndex:         result.blockIndex,
      });
    }

    _checkEnd(room);
  });

  // ── CHAT ──────────────────────────────────────────────────
  socket.on('chat-message', ({ message }) => {
    if (!rateLimiter.checkChat(socket.id)) return; // rate limit de chat
    const room = roomManager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'waiting') return;
    const player = room.getPlayer(socket.id);
    if (!player) return;
    const safe = sanitize(message, 180);
    if (!safe) return;
    io.to(room.code).emit('chat-message', {
      playerName: player.name,
      message:    safe,
      timestamp:  Date.now(),
    });
  });

  // ── REVANCHA ──────────────────────────────────────────────
  socket.on('request-rematch', () => {
    if (!rl()) return;
    try {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room)                     throw new Error('No estás en ninguna sala.');
      if (room.hostId !== socket.id) throw new Error('Solo el anfitrión puede reiniciar.');
      if (room.state !== 'finished') throw new Error('La partida no ha terminado.');
      room.state = 'waiting';
      room.players.forEach(p => {
        p.lives = 3; p.blockIndex = 0; p.phraseIndexInBlock = 0;
        p.completedBlocks = 0; p.eliminated = false; p.finished = false;
        p.blockErrors = 0;
      });
      io.to(room.code).emit('rematch-ready', {
        players:          room.getPlayersInfo(),
        hostId:           room.hostId,
        difficulty:       room.difficulty,
        difficultyConfig: room.config,
      });
    } catch (err) { socket.emit('error-msg', { message: err.message }); }
  });

  // ── DESCONEXIÓN ───────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id}`);
    rateLimiter.remove(socket.id);
    sessionTokens.delete(socket.id);
    const result = roomManager.handleDisconnect(socket.id);
    if (!result || !result.room) return;
    const { room, wasHost, newHostId } = result;
    if (wasHost && newHostId) io.to(room.code).emit('new-host', { hostId: newHostId });
    io.to(room.code).emit('player-left', {
      playerId: socket.id, players: room.getPlayersInfo(),
    });
    if (room.state === 'playing') _checkEnd(room);
  });

  // ── Helper: comprobar fin ─────────────────────────────────
  function _checkEnd(room) {
    const winner = room.checkWinCondition();
    if (winner) {
      room.state = 'finished';
      io.to(room.code).emit('game-over', {
        winner, players: room.getPlayersInfo(),
      });
    }
  }
});

server.listen(PORT, () => {
  console.log(`\n  🎮 FINAL SENTENCE corriendo en http://localhost:${PORT}\n`);
});
