// =============================================================
//  roomManager.js — Gestión de salas y jugadores
// =============================================================

const { GameRoom } = require('./gameLogic');

class RoomManager {
  constructor(io) {
    this.io            = io;
    this.rooms         = new Map(); // roomCode → GameRoom
    this.playerRoomMap = new Map(); // socketId → roomCode
  }

  // ── Utilidades ────────────────────────────────────────────

  /** Genera un código único de 5 caracteres alfanuméricos */
  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = Array.from(
        { length: 5 },
        () => chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }

  // ── API pública ───────────────────────────────────────────

  /**
   * Crea una sala nueva y añade al jugador como anfitrión.
   * @returns { room, player }
   */
  createRoom(socketId, playerName) {
    if (!playerName || playerName.trim().length === 0)
      throw new Error('El nombre de jugador no puede estar vacío.');

    // Un jugador sólo puede estar en una sala
    if (this.playerRoomMap.has(socketId))
      throw new Error('Ya estás en una sala.');

    const code   = this._generateCode();
    const room   = new GameRoom(code, socketId);
    const player = room.addPlayer(socketId, playerName, true);

    this.rooms.set(code, room);
    this.playerRoomMap.set(socketId, code);

    return { room, player };
  }

  /**
   * Une a un jugador a una sala existente.
   * @returns { room, player }
   */
  joinRoom(socketId, roomCode, playerName) {
    if (!playerName || playerName.trim().length === 0)
      throw new Error('El nombre de jugador no puede estar vacío.');

    if (this.playerRoomMap.has(socketId))
      throw new Error('Ya estás en una sala.');

    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room)
      throw new Error(`Sala "${roomCode}" no encontrada. Comprueba el código.`);
    if (room.state !== 'waiting')
      throw new Error('La partida ya ha comenzado. Espera a la próxima.');
    if (room.players.length >= 8)
      throw new Error('La sala está llena (máximo 8 jugadores).');

    // Nombre duplicado en la sala
    const nameTaken = room.players.some(
      p => p.name.toLowerCase() === playerName.trim().toLowerCase()
    );
    if (nameTaken)
      throw new Error('Ese nombre ya está en uso en esta sala. Elige otro.');

    const player = room.addPlayer(socketId, playerName, false);
    this.playerRoomMap.set(socketId, roomCode.toUpperCase());

    return { room, player };
  }

  /** Obtiene la sala del jugador */
  getRoomByPlayer(socketId) {
    const code = this.playerRoomMap.get(socketId);
    return code ? this.rooms.get(code) : null;
  }

  /**
   * Gestiona la desconexión de un jugador.
   * @returns { room, wasHost, newHostId } o null
   */
  handleDisconnect(socketId) {
    const room = this.getRoomByPlayer(socketId);
    if (!room) return null;

    const wasHost = room.hostId === socketId;
    room.removePlayer(socketId);
    this.playerRoomMap.delete(socketId);

    // Si la sala queda vacía, eliminarla
    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return { room: null, wasHost, newHostId: null };
    }

    // Si era el anfitrión, transferir el rol
    let newHostId = null;
    if (wasHost) {
      // Elige al primer jugador no eliminado, o el primero de la lista
      const nextHost =
        room.players.find(p => !p.eliminated) || room.players[0];
      newHostId      = nextHost.id;
      nextHost.isHost = true;
      room.hostId    = newHostId;
    }

    return { room, wasHost, newHostId };
  }
}

module.exports = { RoomManager };
