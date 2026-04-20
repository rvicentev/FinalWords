// =============================================================
//  roomManager.js — Gestión de salas
// =============================================================

const { GameRoom, DIFFICULTY_CONFIG } = require('./gameLogic');

class RoomManager {
  constructor(io) {
    this.io            = io;
    this.rooms         = new Map();
    this.playerRoomMap = new Map();
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from({ length: 5 },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(socketId, playerName, difficulty = 'normal') {
    if (!playerName || !playerName.trim()) throw new Error('Nombre vacío.');
    if (this.playerRoomMap.has(socketId))  throw new Error('Ya estás en una sala.');
    if (!DIFFICULTY_CONFIG[difficulty])    throw new Error('Dificultad inválida.');

    const code   = this._generateCode();
    const room   = new GameRoom(code, socketId, difficulty);
    const player = room.addPlayer(socketId, playerName, true);

    this.rooms.set(code, room);
    this.playerRoomMap.set(socketId, code);
    return { room, player };
  }

  joinRoom(socketId, roomCode, playerName) {
    if (!playerName || !playerName.trim()) throw new Error('Nombre vacío.');
    if (this.playerRoomMap.has(socketId))  throw new Error('Ya estás en una sala.');

    const room = this.rooms.get((roomCode || '').toUpperCase());
    if (!room)                     throw new Error(`Sala "${roomCode}" no existe.`);
    if (room.state !== 'waiting')  throw new Error('La partida ya comenzó.');
    if (room.players.length >= 8)  throw new Error('Sala llena (máx. 8).');

    const nameTaken = room.players.some(
      p => p.name.toLowerCase() === playerName.trim().toLowerCase()
    );
    if (nameTaken) throw new Error('Ese nombre ya está ocupado en esta sala.');

    const player = room.addPlayer(socketId, playerName, false);
    this.playerRoomMap.set(socketId, room.code);
    return { room, player };
  }

  getRoomByPlayer(socketId) {
    const code = this.playerRoomMap.get(socketId);
    return code ? this.rooms.get(code) : null;
  }

  handleDisconnect(socketId) {
    const room = this.getRoomByPlayer(socketId);
    if (!room) return null;

    const wasHost = room.hostId === socketId;
    room.removePlayer(socketId);
    this.playerRoomMap.delete(socketId);

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return { room: null, wasHost, newHostId: null };
    }

    let newHostId = null;
    if (wasHost) {
      const next = room.players.find(p => !p.eliminated) || room.players[0];
      newHostId     = next.id;
      next.isHost   = true;
      room.hostId   = newHostId;
    }
    return { room, wasHost, newHostId };
  }
}

module.exports = { RoomManager };
