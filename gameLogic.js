// =============================================================
//  gameLogic.js — Lógica central del juego Final Sentence
// =============================================================

const PHRASES = [
  "¿Qué dice el perro? ¡Guau, guau!",
  "¿Qué dice el gato? ¡Miau, miau!",
  "El veloz murciélago hindú comía feliz cardillo y kiwi.",
  "La cigüeña tocaba el saxofón detrás del palenque de paja.",
  "¡La vida es bella cuando escribes rápido y sin errores!",
  "Jovencillo emponzoñado de whisky, ¡qué figurota tan rara!",
  "¿Cómo estás hoy? ¡Muy bien, gracias por preguntar!",
  "El pingüino Wenceslao hizo kilómetros bajo exhaustiva lluvia.",
  "Programar es el arte de resolver problemas con elegancia.",
  "El sol brilla, el viento sopla y las flores florecen.",
  "¡Atención! Los campeones nunca se rinden ante la adversidad.",
  "Ñoño y güero tomaron café con leche en Ávila.",
  "Seis sísmicos temblores hicieron añicos el viejo alféizar.",
  "¿Verdad que es difícil escribir rápido sin cometer errores?",
  "Con la tecnología avanzamos; con la lectura, crecemos."
];

const MAX_LIVES = 3;
const PHRASES_PER_GAME = 5;

// -----------------------------------------------------------
//  Clase Player
// -----------------------------------------------------------
class Player {
  constructor(id, name, isHost) {
    this.id       = id;
    this.name     = name.trim().substring(0, 20);
    this.isHost   = isHost;
    this.lives    = MAX_LIVES;
    this.phraseIndex      = 0;
    this.completedPhrases = 0;
    this.eliminated       = false;
    this.finished         = false;
    this.finishedAt       = null;
  }

  /** Serialización segura para enviar al cliente */
  toInfo() {
    return {
      id:               this.id,
      name:             this.name,
      isHost:           this.isHost,
      lives:            this.lives,
      maxLives:         MAX_LIVES,
      phraseIndex:      this.phraseIndex,
      completedPhrases: this.completedPhrases,
      eliminated:       this.eliminated,
      finished:         this.finished
    };
  }
}

// -----------------------------------------------------------
//  Clase GameRoom
// -----------------------------------------------------------
class GameRoom {
  constructor(code, hostId) {
    this.code    = code;
    this.hostId  = hostId;
    this.players = [];         // Array<Player>
    this.state   = 'waiting';  // 'waiting' | 'playing' | 'finished'
    this.phrases = [];         // Frases seleccionadas para esta partida
  }

  // ── Gestión de jugadores ───────────────────────────────────

  addPlayer(id, name, isHost = false) {
    const player = new Player(id, name, isHost);
    this.players.push(player);
    return player;
  }

  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
  }

  getPlayer(id) {
    return this.players.find(p => p.id === id) || null;
  }

  /** Lista de jugadores ordenada por progreso (ranking) */
  getPlayersInfo() {
    return [...this.players]
      .sort((a, b) => {
        if (b.completedPhrases !== a.completedPhrases)
          return b.completedPhrases - a.completedPhrases;
        if (a.eliminated !== b.eliminated)
          return a.eliminated ? 1 : -1;
        return 0;
      })
      .map(p => p.toInfo());
  }

  // ── Inicio de partida ─────────────────────────────────────

  startGame() {
    // Elegir frases al azar
    const shuffled = [...PHRASES].sort(() => Math.random() - 0.5);
    this.phrases = shuffled.slice(0, PHRASES_PER_GAME);
    this.state   = 'playing';

    // Reiniciar estado de cada jugador
    this.players.forEach(p => {
      p.lives            = MAX_LIVES;
      p.phraseIndex      = 0;
      p.completedPhrases = 0;
      p.eliminated       = false;
      p.finished         = false;
      p.finishedAt       = null;
    });
  }

  /** Estado inicial que se envía a todos al empezar */
  getGameState() {
    return {
      phrase:       this.phrases[0],
      phraseIndex:  0,
      totalPhrases: this.phrases.length,
      players:      this.getPlayersInfo()
    };
  }

  // ── Lógica de jugabilidad ─────────────────────────────────

  /**
   * El jugador cometió un error.
   * Devuelve: { eliminated, playerName, lives, maxLives }
   */
  handleError(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || player.eliminated || player.finished) return null;

    player.lives--;

    if (player.lives <= 0) {
      player.lives      = 0;
      player.eliminated = true;
      return { eliminated: true, playerName: player.name, lives: 0, maxLives: MAX_LIVES };
    }

    return { eliminated: false, playerName: player.name, lives: player.lives, maxLives: MAX_LIVES };
  }

  /**
   * El jugador completó la frase actual.
   * Valida en servidor (anti-trampa).
   * Devuelve objeto con resultado de la acción.
   */
  handlePhraseComplete(playerId, typedText) {
    const player = this.getPlayer(playerId);
    if (!player || player.eliminated || player.finished) return { valid: false };

    const expected = this.phrases[player.phraseIndex];
    if (typedText !== expected) return { valid: false };

    player.completedPhrases++;
    player.phraseIndex++;

    // ¿Terminó todas las frases?
    if (player.phraseIndex >= this.phrases.length) {
      player.finished    = true;
      player.finishedAt  = Date.now();
      return {
        valid:             true,
        allPhrasesComplete: true,
        gameWon:           true,
        winner:            player.toInfo(),
        phraseIndex:       player.phraseIndex,
        totalPhrases:      this.phrases.length
      };
    }

    return {
      valid:             true,
      allPhrasesComplete: false,
      gameWon:           false,
      phraseIndex:       player.phraseIndex,
      totalPhrases:      this.phrases.length
    };
  }

  /**
   * Devuelve la siguiente frase para un jugador (tras la pausa de 5 s).
   */
  getNextPhrase(playerId) {
    const player = this.getPlayer(playerId);
    if (!player || player.eliminated || player.finished) return null;
    if (player.phraseIndex >= this.phrases.length) return null;

    return {
      text:  this.phrases[player.phraseIndex],
      index: player.phraseIndex,
      total: this.phrases.length
    };
  }

  /**
   * Comprueba si hay un ganador o si el juego debe terminar.
   * Devuelve el objeto toInfo() del ganador, o null si aún no.
   */
  checkWinCondition() {
    if (this.state !== 'playing') return null;

    // Jugador que ya acabó todas las frases
    const finished = this.players.filter(p => p.finished);
    if (finished.length > 0) {
      return finished.sort((a, b) => a.finishedAt - b.finishedAt)[0].toInfo();
    }

    // Todos los jugadores están eliminados o han terminado
    const active = this.players.filter(p => !p.eliminated && !p.finished);
    if (active.length === 0) {
      // Gana el que más frases completó
      const best = [...this.players].sort(
        (a, b) => b.completedPhrases - a.completedPhrases
      )[0];
      return best ? best.toInfo() : null;
    }

    // Si sólo queda 1 jugador activo y hay más de 1 en total
    if (active.length === 1 && this.players.length > 1) {
      return active[0].toInfo();
    }

    return null;
  }
}

module.exports = { GameRoom, PHRASES, MAX_LIVES, PHRASES_PER_GAME };
