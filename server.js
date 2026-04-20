// =============================================================
//  server.js — Servidor principal de Final Sentence
//  Node.js + Express + Socket.io
// =============================================================

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');
const { RoomManager } = require('./roomManager');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT       = process.env.PORT || 3000;
const roomManager = new RoomManager(io);

// ── Archivos estáticos ────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Conexiones Socket.io ──────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] Conectado: ${socket.id}`);

  // ── CREAR SALA ──────────────────────────────────────────────
  socket.on('create-room', ({ playerName }) => {
    try {
      const { room, player } = roomManager.createRoom(socket.id, playerName);
      socket.join(room.code);
      socket.emit('room-created', {
        roomCode:  room.code,
        playerId:  socket.id,
        hostId:    room.hostId,
        players:   room.getPlayersInfo()
      });
      console.log(`[SALA] Creada: ${room.code} por ${player.name}`);
    } catch (err) {
      socket.emit('error-msg', { message: err.message });
    }
  });

  // ── UNIRSE A SALA ───────────────────────────────────────────
  socket.on('join-room', ({ roomCode, playerName }) => {
    try {
      const { room, player } = roomManager.joinRoom(
        socket.id, roomCode, playerName
      );
      socket.join(room.code);
      socket.emit('room-joined', {
        roomCode:  room.code,
        playerId:  socket.id,
        hostId:    room.hostId,
        players:   room.getPlayersInfo()
      });
      // Notificar a los demás en la sala
      socket.to(room.code).emit('player-joined', {
        players:    room.getPlayersInfo(),
        playerName: player.name
      });
      console.log(`[SALA] ${player.name} se unió a ${room.code}`);
    } catch (err) {
      socket.emit('error-msg', { message: err.message });
    }
  });

  // ── INICIAR PARTIDA (solo anfitrión) ────────────────────────
  socket.on('start-game', () => {
    try {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room)               throw new Error('No estás en ninguna sala.');
      if (room.hostId !== socket.id)
                               throw new Error('Solo el anfitrión puede iniciar.');
      if (room.players.length < 1)
                               throw new Error('Se necesita al menos 1 jugador.');
      if (room.state !== 'waiting')
                               throw new Error('La partida ya ha comenzado.');

      room.startGame();
      const state = room.getGameState();
      io.to(room.code).emit('game-started', state);
      console.log(`[JUEGO] Partida iniciada en sala ${room.code}`);
    } catch (err) {
      socket.emit('error-msg', { message: err.message });
    }
  });

  // ── ERROR EN FRASE ──────────────────────────────────────────
  socket.on('phrase-error', () => {
    try {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room || room.state !== 'playing') return;

      const result = room.handleError(socket.id);
      if (!result) return;

      if (result.eliminated) {
        // Jugador eliminado
        io.to(room.code).emit('player-eliminated', {
          playerId:   socket.id,
          playerName: result.playerName,
          players:    room.getPlayersInfo()
        });
        console.log(`[JUEGO] ${result.playerName} eliminado en ${room.code}`);
      } else {
        // Solo pierde vida
        socket.emit('lives-updated', {
          lives:    result.lives,
          maxLives: result.maxLives
        });
      }

      // Actualizar ranking en tiempo real
      io.to(room.code).emit('ranking-update', {
        players: room.getPlayersInfo()
      });

      // Comprobar si el juego ha terminado
      _checkAndEndGame(room);

    } catch (err) {
      socket.emit('error-msg', { message: err.message });
    }
  });

  // ── FRASE COMPLETADA ────────────────────────────────────────
  socket.on('phrase-complete', ({ typedText }) => {
    try {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room || room.state !== 'playing') return;

      const result = room.handlePhraseComplete(socket.id, typedText);

      if (!result.valid) {
        // Validación fallida en servidor (posible trampa)
        socket.emit('phrase-rejected', {
          message: 'Texto inválido. ¡Nada de trampas!'
        });
        return;
      }

      // Actualizar ranking
      io.to(room.code).emit('ranking-update', {
        players: room.getPlayersInfo()
      });

      // ¿Ganó?
      if (result.gameWon) {
        room.state = 'finished';
        io.to(room.code).emit('game-over', {
          winner:  result.winner,
          players: room.getPlayersInfo()
        });
        console.log(`[JUEGO] Ganador: ${result.winner.name} en sala ${room.code}`);
        return;
      }

      // Confirmar frase y programar la siguiente
      socket.emit('phrase-complete-ack', {
        phraseIndex:  result.phraseIndex - 1,
        totalPhrases: result.totalPhrases,
        nextIn:       5
      });

      // Pausa de 5 segundos antes de la siguiente frase
      setTimeout(() => {
        if (room.state !== 'playing') return;
        const next = room.getNextPhrase(socket.id);
        if (next) {
          socket.emit('next-phrase', {
            phrase:       next.text,
            phraseIndex:  next.index,
            totalPhrases: next.total
          });
        }
      }, 5000);

    } catch (err) {
      socket.emit('error-msg', { message: err.message });
    }
  });

  // ── CHAT (solo en sala de espera) ───────────────────────────
  socket.on('chat-message', ({ message }) => {
    const room = roomManager.getRoomByPlayer(socket.id);
    if (!room || room.state !== 'waiting') return;

    const player = room.getPlayer(socket.id);
    if (!player) return;

    const sanitized = String(message).trim().substring(0, 200);
    if (!sanitized) return;

    io.to(room.code).emit('chat-message', {
      playerName: player.name,
      message:    sanitized,
      timestamp:  Date.now()
    });
  });

  // ── SOLICITAR NUEVA PARTIDA (anfitrión) ─────────────────────
  socket.on('request-rematch', () => {
    try {
      const room = roomManager.getRoomByPlayer(socket.id);
      if (!room)                      throw new Error('No estás en ninguna sala.');
      if (room.hostId !== socket.id)  throw new Error('Solo el anfitrión puede reiniciar.');
      if (room.state !== 'finished')  throw new Error('La partida no ha terminado.');

      // Volver a estado de espera
      room.state = 'waiting';
      room.players.forEach(p => {
        p.lives = 3; p.phraseIndex = 0; p.completedPhrases = 0;
        p.eliminated = false; p.finished = false;
      });

      io.to(room.code).emit('rematch-ready', {
        players: room.getPlayersInfo(),
        hostId:  room.hostId
      });
    } catch (err) {
      socket.emit('error-msg', { message: err.message });
    }
  });

  // ── DESCONEXIÓN ─────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[-] Desconectado: ${socket.id}`);
    const result = roomManager.handleDisconnect(socket.id);
    if (!result || !result.room) return;

    const { room, wasHost, newHostId } = result;

    if (wasHost && newHostId) {
      io.to(room.code).emit('new-host', { hostId: newHostId });
    }

    io.to(room.code).emit('player-left', {
      playerId: socket.id,
      players:  room.getPlayersInfo()
    });

    // Si el juego estaba en curso, comprobar victoria
    if (room.state === 'playing') {
      _checkAndEndGame(room);
    }
  });

  // ── Función interna: comprobar fin de partida ─────────────────
  function _checkAndEndGame(room) {
    const winner = room.checkWinCondition();
    if (winner) {
      room.state = 'finished';
      io.to(room.code).emit('game-over', {
        winner,
        players: room.getPlayersInfo()
      });
      console.log(`[JUEGO] Fin de partida en ${room.code}. Ganador: ${winner.name}`);
    }
  }
});

// ── Arranque ──────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('  ███████╗██╗███╗   ██╗ █████╗ ██╗');
  console.log('  ██╔════╝██║████╗  ██║██╔══██╗██║');
  console.log('  █████╗  ██║██╔██╗ ██║███████║██║');
  console.log('  ██╔══╝  ██║██║╚██╗██║██╔══██║██║');
  console.log('  ██║     ██║██║ ╚████║██║  ██║███████╗');
  console.log('  ╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝');
  console.log('  SENTENCE');
  console.log('');
  console.log(`  🎮 Servidor corriendo en http://localhost:${PORT}`);
  console.log('');
});
