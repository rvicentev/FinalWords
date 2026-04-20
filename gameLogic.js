// =============================================================
//  gameLogic.js — Final Sentence · Lógica central
// =============================================================

const crypto = require('crypto');
const GAME_SECRET = process.env.GAME_SECRET || crypto.randomBytes(32).toString('hex');

const BLOCKS_TO_WIN     = 3;
const PHRASES_PER_BLOCK = 6;
const BLOCK_REST_SECS   = 5;
const PENALTY_SECS      = 5;

// ── Configuración de dificultad ──────────────────────────────
const DIFFICULTY_CONFIG = {
  easy: {
    label: 'FÁCIL', emoji: '😌',
    desc:  'Sin tildes · Frases cortas · 3 vidas por bloque',
    livesPerBlock: 3,
    rouletteBase: 0.10, rouletteStep: 0.05, rouletteCap: 0.45,
    minTypingMs: 35,
  },
  normal: {
    label: 'NORMAL', emoji: '😐',
    desc:  'Con tildes · Frases medianas · 3 vidas por bloque',
    livesPerBlock: 3,
    rouletteBase: 0.15, rouletteStep: 0.07, rouletteCap: 0.65,
    minTypingMs: 40,
  },
  hard: {
    label: 'DIFÍCIL', emoji: '😰',
    desc:  'Tildes y diéresis · Frases largas · 2 vidas por bloque',
    livesPerBlock: 2,
    rouletteBase: 0.22, rouletteStep: 0.10, rouletteCap: 0.78,
    minTypingMs: 45,
  },
  hell: {
    label: 'INFIERNO', emoji: '💀',
    desc:  'Todo · Frases muy largas · Ruleta letal · 2 vidas',
    livesPerBlock: 2,
    rouletteBase: 0.32, rouletteStep: 0.13, rouletteCap: 0.90,
    minTypingMs: 45,
  },
};

// ── Frases por dificultad ────────────────────────────────────
const PHRASE_SETS = {
  easy: [
    "El sol sale todos los dias.",
    "La casa tiene tres pisos.",
    "Mi perro se llama Bruno.",
    "Hoy hace mucho calor.",
    "El gato duerme en el sofa.",
    "Los ninos juegan en el parque.",
    "Mi color favorito es el azul.",
    "El tren llega a las tres.",
    "La pizza de queso es muy rica.",
    "El cielo esta lleno de estrellas.",
    "La luna brilla en la noche.",
    "Mi hermano tiene doce años.",
    "El coche es de color rojo.",
    "La fiesta fue muy divertida.",
    "El rio pasa por el pueblo.",
    "El ordenador es muy rapido hoy.",
    "El arbol da mucha sombra.",
    "La mesa es de madera oscura.",
    "El pastel de chocolate es delicioso.",
    "Mañana tengo clase de musica.",
    "El campo es verde en primavera.",
    "La pelota rueda por el suelo.",
    "El mercado abre a las nueve.",
    "La bicicleta tiene dos ruedas.",
    "Mi mama hace comida muy buena.",
    "El viento mueve las hojas del arbol.",
    "Los gatos tienen bigotes muy largos.",
    "El lago refleja las montañas nevadas.",
    "La noche estrellada es muy bonita.",
    "Los libros guardan grandes historias.",
  ],
  normal: [
    "¿Qué dice el perro? ¡Guau, guau!",
    "¿Qué dice el gato? ¡Miau, miau!",
    "El veloz murciélago comía cardillo.",
    "¡La vida es bella cuando escribes rápido!",
    "¿Cómo estás hoy? ¡Muy bien, gracias!",
    "Programar es el arte de la lógica.",
    "El sol brilla y el viento sopla fuerte.",
    "¡Atención! Los campeones no se rinden nunca.",
    "¿Verdad que es difícil escribir sin fallos?",
    "Con la lectura, la mente crece y mejora.",
    "El café del bar está muy caliente hoy.",
    "¡Qué bonito día hace en la ciudad!",
    "La música clásica relaja el espíritu.",
    "El árbol de la plaza tiene cien años.",
    "Seis sísmicos temblores sacudieron la región.",
    "¿Cuándo llega el próximo tren a la estación?",
    "¡El campeón levantó el trofeo con emoción!",
    "La tecnología avanza a un ritmo increíble.",
    "El océano guarda millones de secretos.",
    "¡Nunca dejes de aprender cosas nuevas!",
    "La historia de España es rica y compleja.",
    "¿Por qué el cielo es azul durante el día?",
    "El cocinero preparó un menú delicioso.",
    "¡Qué difícil es escribir sin cometer errores!",
    "La primavera trae flores de mil colores.",
    "¿Dónde está la biblioteca más cercana?",
    "Los videojuegos requieren concentración total.",
    "¡Felicidades! Acabas de completar esta frase.",
    "El teclado tiene muchas teclas especiales.",
    "La velocidad de escritura mejora con práctica.",
  ],
  hard: [
    "El pingüino Wenceslao caminó kilómetros bajo la lluvia torrencial.",
    "La cigüeña tocaba el saxofón detrás del viejo palenque de paja.",
    "Jovencillo emponzoñado de whisky, ¡qué figurota tan extraña exhibe!",
    "La ambigüedad del antiguo texto causó gran confusión entre los sabios.",
    "¡Qué vergüenza! El pingüino rompió el frágil jarrón de porcelana china.",
    "La bilingüe secretaria transcribió el discurso con asombrosa precisión.",
    "El lingüista estudió el dialecto con paciencia, curiosidad y rigor científico.",
    "¿Por qué la cigüeña migra cada año hacia el continente africano del sur?",
    "La exigüidad de los recursos obligó al equipo a improvisar soluciones.",
    "El bilingüismo temprano desarrolla capacidades cognitivas extraordinarias.",
    "¿Podría el señor explicar la contigüidad de esos dos conceptos filosóficos?",
    "La pingüinera del zoo alberga más de doscientos ejemplares distintos.",
    "¡Desambigüemos el asunto antes de que la confusión se propague aún más!",
    "La homofonía y la ambigüedad léxica complican la traducción automática.",
    "El güisqui escocés envejeció veinte años en barricas de roble francés.",
    "Los lingüistas arguyen que toda lengua viva está en constante transformación.",
    "¡Qué exigüo presupuesto para un proyecto de tal envergadura nacional!",
    "El antiguo pergamino contenía instrucciones ambigüas escritas en latín.",
    "¿Cómo se consigue la bilingüidad perfecta sin vivir en el extranjero?",
    "La contigüidad espacial de los edificios fascinó a los arqueólogos.",
    "El güero músico tocaba la guitarra eléctrica con destreza extraordinaria.",
    "¡Vergüenza debería darle a quien difunde noticias falsas sin comprobación!",
    "Los pingüinos son aves que, paradójicamente, no pueden volar pero sí nadar.",
    "La desambigüación semántica es uno de los retos del procesamiento lingüístico.",
    "El sinüoso camino llevaba directamente al antiguo monasterio de la cima.",
    "Los argüenderos difundieron rumores sin ningún tipo de vergüenza pública.",
    "El bilingüe redactor usó términos ambigüos a propósito en su comunicado.",
    "¡Qué agüero tan terrible predijo el anciano astrólogo del pueblo medieval!",
    "La cigüeña y el pingüino compartieron protagonismo en aquella obra teatral.",
    "La ambigüedad calculada del texto generó múltiples interpretaciones distintas.",
  ],
  hell: [
    "Tres tristes tigres tragaban trigo en un trigal; ¡qué trabalenguas más difícil de pronunciar correctamente!",
    "El hipopótamo Hipo hipaba hípicamente en el hipódromo mientras el público aplaudía con entusiasmo desbordante.",
    "La pingüedinosa y ambigüa declaración del político generó un revuelo mediático absolutamente sin precedentes históricos.",
    "¿Cómo explicar la contigüidad semántica entre términos aparentemente antónimos en el campo de la lingüística comparada?",
    "¡El exigüo presupuesto del ayuntamiento no alcanzaba ni para reparar las aceras del deteriorado centro histórico!",
    "El distinguido lingüista arguye que la ambigüedad léxica enriquece, más que empobrece, cualquier idioma vivo y dinámico.",
    "La cigüeña, el pingüino y el güero se reunieron en el congreso internacional de aves singulares del hemisferio sur.",
    "¿Podría usted, por favor, desambigüar esta confusa y extensa oración antes de que termine la reunión de mañana?",
    "La bilingüidad perfecta requiere no sólo dominar dos idiomas, sino también comprender dos culturas y formas distintas de pensar.",
    "El argüido principio filosófico de la contigüidad espacio-temporal fue refutado con ejemplos empíricos enormemente convincentes.",
    "¡Qué vergüenza ajena sentimos al escuchar aquellas declaraciones tan ambigüas emitidas en horario de máxima audiencia televisiva!",
    "El sinüoso sendero serpenteaba entre riscos y precipicios hasta alcanzar la cima nevada de la montaña más alta de la región.",
    "Los argüenderos del barrio difundieron rumores maliciosos sobre la distinguida bilingüe profesora de lingüística cognitiva comparada.",
    "La exigüidad de pruebas, junto con las declaraciones ambigüas de los testigos, complicó enormemente el veredicto del jurado popular.",
    "¿Cómo consiguió el famoso pingüino saltarín escapar del recinto sin que ninguno de los vigilantes nocturnos se percatara del suceso?",
    "El güisqui premium, envejecido durante veinticinco años en barricas de roble americano seleccionado, tenía un sabor absolutamente inigualable.",
    "La desambigüación automática del lenguaje natural sigue siendo uno de los problemas más complejos y fascinantes de toda la inteligencia artificial.",
    "¡Qué extraordinaria e inesperada combinación de virtud, ambigüedad y vergüenza exhibió el polémico protagonista en esa memorable escena final!",
    "Los contigüos edificios del casco antiguo fueron declarados Patrimonio de la Humanidad por la UNESCO hace apenas tres años y medio.",
    "La lingüística cognitiva y la pragmática convergen en el estudio de cómo los hablantes desambigüan enunciados complejos según el contexto.",
    "El bilingüe secretario general redactó el comunicado oficial con una ambigüedad deliberadamente calculada para satisfacer a todas las partes implicadas.",
    "¡Jamás había visto tal desvergüenza! El argüido derecho fue flagrantemente violado ante la mirada completamente atónita de todos los presentes.",
    "La homofonía, la polisemia y la ambigüedad estructural son fenómenos lingüísticos que complican enormemente cualquier proceso de traducción automática.",
    "El investigador examinó con lupa la contigüidad de las dos inscripciones rúnicas halladas en el yacimiento arqueológico noruego de reciente descubrimiento.",
    "¿Cómo se puede garantizar la bilingüidad funcional de toda una población sin invertir masivamente en la educación temprana de máxima calidad disponible?",
    "La exigüidad del tiempo disponible y la ambigüedad de las instrucciones recibidas condujeron al equipo a cometer errores graves e irremediables.",
    "¡Qué vergüenza tan monumental sintió el célebre lingüista cuando confundió públicamente dos lenguas que supuestamente dominaba con absoluta perfección!",
    "El pingüino Wenceslao, el güero Ambrosio y la cigüeña Felicísima protagonizaron juntos la obra más ambigüa e incomprendida de toda la temporada teatral.",
    "Los argüenderos, con su habitual e inagotable desvergüenza, difundieron noticias completamente falsas sobre la distinguida bilingüe académica galardonada.",
    "La desambigüación semántica asistida por contexto pragmático constituye actualmente uno de los horizontes más prometedores de la investigación lingüística computacional.",
  ],
};

// ── Clase Player ─────────────────────────────────────────────
class Player {
  constructor(id, name, isHost) {
    this.id     = id;
    this.name   = name.trim().substring(0, 20);
    this.isHost = isHost;
    this.blockIndex          = 0;
    this.phraseIndexInBlock  = 0;
    this.completedBlocks     = 0;
    this.lives               = 3;
    this.maxLives            = 3;
    this.eliminated          = false;
    this.finished            = false;
    this.finishedAt          = null;
    this.blockErrors         = 0;
    this.phraseStartTime     = null;
  }

  totalCompleted() {
    return this.completedBlocks * PHRASES_PER_BLOCK + this.phraseIndexInBlock;
  }

  toInfo() {
    return {
      id:                  this.id,
      name:                this.name,
      isHost:              this.isHost,
      lives:               this.lives,
      maxLives:            this.maxLives,
      blockIndex:          this.blockIndex,
      phraseIndexInBlock:  this.phraseIndexInBlock,
      completedBlocks:     this.completedBlocks,
      totalCompleted:      this.totalCompleted(),
      eliminated:          this.eliminated,
      finished:            this.finished,
    };
  }
}

// ── Clase GameRoom ────────────────────────────────────────────
class GameRoom {
  constructor(code, hostId, difficulty = 'normal') {
    this.code       = code;
    this.hostId     = hostId;
    this.difficulty = difficulty;
    this.players    = [];
    this.state      = 'waiting';
    this.phrases    = [];
  }

  get config() { return DIFFICULTY_CONFIG[this.difficulty]; }

  addPlayer(id, name, isHost = false) {
    const p = new Player(id, name, isHost);
    this.players.push(p);
    return p;
  }
  removePlayer(id) { this.players = this.players.filter(p => p.id !== id); }
  getPlayer(id)    { return this.players.find(p => p.id === id) || null; }

  getPlayersInfo() {
    return [...this.players]
      .sort((a, b) => b.totalCompleted() - a.totalCompleted())
      .map(p => p.toInfo());
  }

  startGame() {
    const pool   = [...PHRASE_SETS[this.difficulty]].sort(() => Math.random() - 0.5);
    const needed = BLOCKS_TO_WIN * PHRASES_PER_BLOCK;
    while (pool.length < needed) pool.push(...PHRASE_SETS[this.difficulty]);
    this.phrases = pool.slice(0, needed);
    this.state   = 'playing';

    this.players.forEach(p => {
      p.blockIndex         = 0;
      p.phraseIndexInBlock = 0;
      p.completedBlocks    = 0;
      p.lives              = this.config.livesPerBlock;
      p.maxLives           = this.config.livesPerBlock;
      p.eliminated         = false;
      p.finished           = false;
      p.finishedAt         = null;
      p.blockErrors        = 0;
      p.phraseStartTime    = Date.now();
    });
  }

  _phraseAt(blockIdx, phraseIdx) {
    return this.phrases[blockIdx * PHRASES_PER_BLOCK + phraseIdx] || null;
  }
  _currentPhrase(p) { return this._phraseAt(p.blockIndex, p.phraseIndexInBlock); }
  _nextPhrase(p) {
    if (p.phraseIndexInBlock + 1 >= PHRASES_PER_BLOCK) return null;
    return this._phraseAt(p.blockIndex, p.phraseIndexInBlock + 1);
  }

  getInitialState(playerId) {
    const p = this.getPlayer(playerId);
    if (!p) return null;
    p.phraseStartTime = Date.now();
    return {
      phrase:             this._currentPhrase(p),
      nextPhrase:         this._nextPhrase(p),
      phraseIndexInBlock: p.phraseIndexInBlock,
      blockIndex:         p.blockIndex,
      totalBlocks:        BLOCKS_TO_WIN,
      phrasesPerBlock:    PHRASES_PER_BLOCK,
      lives:              p.lives,
      maxLives:           p.maxLives,
      players:            this.getPlayersInfo(),
      difficulty:         this.difficulty,
      difficultyLabel:    this.config.label,
      difficultyEmoji:    this.config.emoji,
    };
  }

  // ── Ruleta ────────────────────────────────────────────────
  handleRoulette(playerId) {
    const p = this.getPlayer(playerId);
    if (!p || p.eliminated || p.finished) return null;

    const cfg    = this.config;
    const chance = Math.min(cfg.rouletteBase + p.blockErrors * cfg.rouletteStep, cfg.rouletteCap);
    const dies   = Math.random() < chance;
    p.blockErrors++;

    if (dies) {
      p.eliminated = true;
      p.lives      = 0;
      return { dies: true, deathChance: chance, lives: 0, eliminated: true };
    }

    p.lives = Math.max(0, p.lives - 1);
    if (p.lives <= 0) {
      p.eliminated = true;
      return { dies: false, deathChance: chance, lives: 0, eliminated: true, lifeElim: true };
    }
    return { dies: false, deathChance: chance, lives: p.lives, eliminated: false };
  }

  // ── Completar frase (validación anti-trampa) ──────────────
  handlePhraseComplete(playerId, typedText) {
    const p = this.getPlayer(playerId);
    if (!p || p.eliminated || p.finished) return { valid: false, reason: 'state' };

    const expected = this._currentPhrase(p);
    if (!expected)              return { valid: false, reason: 'no-phrase' };
    if (typedText !== expected) return { valid: false, reason: 'mismatch' };

    const elapsed = Date.now() - (p.phraseStartTime || 0);
    const minMs   = expected.length * this.config.minTypingMs;
    if (elapsed < minMs)        return { valid: false, reason: 'too-fast' };

    p.phraseIndexInBlock++;

    // Bloque completo
    if (p.phraseIndexInBlock >= PHRASES_PER_BLOCK) {
      p.completedBlocks++;
      p.phraseIndexInBlock = 0;
      p.blockIndex++;
      p.blockErrors = 0;
      p.lives       = this.config.livesPerBlock;
      p.maxLives    = this.config.livesPerBlock;

      if (p.completedBlocks >= BLOCKS_TO_WIN) {
        p.finished   = true;
        p.finishedAt = Date.now();
        return { valid: true, blockComplete: true, gameWon: true, winner: p.toInfo() };
      }
      return {
        valid: true, blockComplete: true, gameWon: false,
        newBlockIndex: p.blockIndex, newLives: p.lives, maxLives: p.maxLives,
      };
    }

    // Siguiente frase inmediata
    p.phraseStartTime = Date.now();
    return {
      valid: true, blockComplete: false, gameWon: false,
      phrase:             this._currentPhrase(p),
      nextPhrase:         this._nextPhrase(p),
      phraseIndexInBlock: p.phraseIndexInBlock,
      blockIndex:         p.blockIndex,
    };
  }

  getBlockStartData(playerId) {
    const p = this.getPlayer(playerId);
    if (!p || p.eliminated || p.finished) return null;
    p.phraseStartTime = Date.now();
    return {
      phrase:             this._currentPhrase(p),
      nextPhrase:         this._nextPhrase(p),
      phraseIndexInBlock: p.phraseIndexInBlock,
      blockIndex:         p.blockIndex,
      lives:              p.lives,
      maxLives:           p.maxLives,
    };
  }

  resetPhraseTimer(playerId) {
    const p = this.getPlayer(playerId);
    if (p) p.phraseStartTime = Date.now();
  }

  checkWinCondition() {
    if (this.state !== 'playing') return null;
    const finished = this.players.filter(p => p.finished);
    if (finished.length > 0)
      return finished.sort((a, b) => a.finishedAt - b.finishedAt)[0].toInfo();
    const active = this.players.filter(p => !p.eliminated && !p.finished);
    if (active.length === 0) {
      const best = [...this.players].sort((a, b) => b.totalCompleted() - a.totalCompleted())[0];
      return best ? best.toInfo() : null;
    }
    if (active.length === 1 && this.players.length > 1) return active[0].toInfo();
    return null;
  }
}

module.exports = {
  GameRoom, DIFFICULTY_CONFIG, PHRASE_SETS,
  BLOCKS_TO_WIN, PHRASES_PER_BLOCK, BLOCK_REST_SECS, PENALTY_SECS, GAME_SECRET,
};
