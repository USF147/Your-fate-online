const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

/* =========================================================
   CARTES
========================================================= */

const CARD_TYPES = [
  {
    name: "Diable",
    value: -2,
    count: 1,
    text: "S'il est toujours en lice à la fin de la manche, son détenteur gagne la manche. Le Prêtre l'élimine s'il le découvre."
  },
  {
    name: "Voleur",
    value: -1,
    count: 2,
    text: "À la fin de la manche, si vous êtes le seul Voleur encore en lice, volez 1 Faveur après les récompenses."
  },
  {
    name: "Chroniqueuse",
    value: 0,
    count: 2,
    text: "Si vous êtes le seul joueur encore en lice à avoir joué ou défaussé une Chroniqueuse, gagnez 1 Faveur."
  },
  {
    name: "Majordome",
    value: 1,
    count: 3,
    text: "Devinez le personnage d'un autre joueur, sauf Majordome. Une bonne réponse l'élimine."
  },
  {
    name: "Garde royal",
    value: 1,
    count: 3,
    text: "Devinez le personnage d'un autre joueur, sauf Garde royal. Après une bonne réponse, recommencez jusqu'à une erreur."
  },
  {
    name: "Prêtre",
    value: 2,
    count: 2,
    text: "Regardez secrètement la main d'un autre joueur. Si vous trouvez le Diable, il est éliminé."
  },
  {
    name: "Sorcière",
    value: 3,
    count: 2,
    text: "Maudissez un autre joueur. Il sautera son prochain tour."
  },
  {
    name: "Baron",
    value: 4,
    count: 2,
    text: "Comparez secrètement votre main avec celle d'un autre joueur. La plus faible est éliminée."
  },
  {
    name: "Domestique",
    value: 5,
    count: 2,
    text: "Vous êtes protégé des effets des autres joueurs jusqu'au début de votre prochain tour."
  },
  {
    name: "Prince",
    value: 6,
    count: 2,
    text: "Choisissez n'importe quel joueur, vous compris. Il défausse sa main et en pioche une nouvelle."
  },
  {
    name: "Chancelier",
    value: 7,
    count: 2,
    text: "Piochez 2 cartes, conservez-en 1 et placez les autres sous la pioche dans l'ordre de votre choix."
  },
  {
    name: "Roi",
    value: 8,
    count: 1,
    text: "Échangez votre main avec celle d'un autre joueur."
  },
  {
    name: "Comtesse",
    value: 9,
    count: 1,
    text: "Vous devez la jouer si votre autre carte est le Roi ou un Prince."
  },
  {
    name: "Reine",
    value: 10,
    count: 1,
    text: "Si un joueur quitte la manche avec le Roi, un Prince ou la Princesse, vous quittez aussi la manche."
  },
  {
    name: "Princesse",
    value: 11,
    count: 1,
    text: "Si vous jouez ou défaussez cette carte, vous êtes éliminé."
  }
];

const CARD_NAMES = CARD_TYPES.map((card) => card.name);

function createDeck() {
  const deck = [];
  let number = 0;

  for (const type of CARD_TYPES) {
    for (let i = 0; i < type.count; i++) {
      deck.push({
        id: `card-${++number}-${randomToken(4)}`,
        name: type.name,
        value: type.value,
        text: type.text
      });
    }
  }

  return shuffle(deck);
}

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/* =========================================================
   DONNÉES GÉNÉRALES
========================================================= */

const rooms = new Map();

function randomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

function createRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  while (true) {
    let code = "";

    for (let i = 0; i < 5; i++) {
      code += characters[Math.floor(Math.random() * characters.length)];
    }

    if (!rooms.has(code)) {
      return code;
    }
  }
}

function cleanName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 20);
}

function getRoom(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

function getSocketPlayer(socket, room) {
  return room?.players.find(
    (player) => player.id === socket.data.playerId
  );
}

function getPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function activePlayers(room) {
  return room.players.filter((player) => player.alive);
}

function addLog(room, message) {
  room.logs.push(message);

  if (room.logs.length > 100) {
    room.logs.shift();
  }
}

function publicCard(card) {
  if (!card) return null;

  return {
    id: card.id,
    name: card.name,
    value: card.value,
    text: card.text
  };
}

function publicState(room, viewerId) {
  const viewer = getPlayer(room, viewerId);
  const revealHands =
    room.status === "roundEnd" ||
    room.status === "gameOver" ||
    room.phase === "steal";

  const pendingForViewer =
    room.pending?.actorId === viewerId
      ? {
          kind: room.pending.kind,
          targetId: room.pending.targetId || null,
          cardName: room.pending.cardName || null
        }
      : null;

  return {
    code: room.code,
    status: room.status,
    phase: room.phase,
    round: room.round,
    hostId: room.hostId,
    currentPlayerId:
      room.currentIndex >= 0
        ? room.players[room.currentIndex]?.id || null
        : null,
    winnerIds: room.winnerIds || [],
    cardTypes: CARD_TYPES,
    deckCount: room.deck.length,
    removedVisible: room.removedVisible.map(publicCard),
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      alive: player.alive,
      protected: player.protected,
      cursed: player.skipTurns > 0,
      favors: player.favors,
      handCount: player.hand.length,
      hand:
        player.id === viewerId || revealHands
          ? player.hand.map(publicCard)
          : [],
      discards: player.discards.map(publicCard),
      isHost: player.id === room.hostId
    })),
    self: viewer
      ? {
          id: viewer.id,
          name: viewer.name,
          hand: viewer.hand.map(publicCard),
          alive: viewer.alive,
          favors: viewer.favors,
          protected: viewer.protected,
          cursed: viewer.skipTurns > 0
        }
      : null,
    pending: pendingForViewer,
    logs: room.logs.slice(-40)
  };
}

function broadcastRoom(room) {
  for (const player of room.players) {
    if (!player.socketId) continue;

    io.to(player.socketId).emit(
      "state",
      publicState(room, player.id)
    );
  }
}

function sendPrivate(player, message) {
  if (player?.socketId) {
    io.to(player.socketId).emit("privateMessage", message);
  }
}

function success(callback, extra = {}) {
  if (typeof callback === "function") {
    callback({ ok: true, ...extra });
  }
}

function failure(callback, message) {
  if (typeof callback === "function") {
    callback({ ok: false, message });
  }
}

/* =========================================================
   CRÉATION ET DÉBUT DES MANCHES
========================================================= */

function createPlayer(name, socket) {
  return {
    id: randomToken(8),
    token: randomToken(24),
    socketId: socket.id,
    connected: true,
    name,
    favors: 0,
    hand: [],
    discards: [],
    alive: false,
    protected: false,
    skipTurns: 0,
    playedChronicle: false
  };
}

function resetPlayerForRound(player) {
  player.hand = [];
  player.discards = [];
  player.alive = true;
  player.protected = false;
  player.skipTurns = 0;
  player.playedChronicle = false;
}

function resetRoomToLobby(room, message) {
  room.status = "lobby";
  room.phase = "lobby";
  room.round = 0;
  room.deck = [];
  room.burnCard = null;
  room.removedVisible = [];
  room.currentIndex = -1;
  room.pending = null;
  room.winnerIds = [];
  room.nextStarterId = null;

  for (const player of room.players) {
    player.favors = 0;
    player.hand = [];
    player.discards = [];
    player.alive = false;
    player.protected = false;
    player.skipTurns = 0;
    player.playedChronicle = false;
  }

  addLog(room, message);
}
function removePlayerFromRoom(room, player) {
  const removedIndex = room.players.findIndex(
    (candidate) => candidate.id === player.id
  );

  if (removedIndex < 0) return;

  const removedPlayerWasCurrent =
    room.currentIndex === removedIndex;

  const removedPlayerWasPendingActor =
    room.pending?.actorId === player.id;

  const removedPlayerWasPendingTarget =
    room.pending?.targetId === player.id;

  const pendingCardName = room.pending?.cardName;
  const removedPlayerName = player.name;

  /*
    On retire réellement le joueur de la liste du salon.
  */
  room.players.splice(removedIndex, 1);

  player.connected = false;
  player.socketId = null;

  addLog(
    room,
    `${removedPlayerName} a quitté la partie.`
  );

  /*
    Si le salon est vide, il est définitivement supprimé.
  */
  if (room.players.length === 0) {
    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
    }

    rooms.delete(room.code);
    return;
  }

  /*
    Si l'hôte est parti, le premier joueur restant
    devient le nouvel hôte.
  */
  if (room.hostId === player.id) {
    room.hostId = room.players[0].id;

    addLog(
      room,
      `${room.players[0].name} devient le nouvel hôte.`
    );
  }

  /*
    Corrige l'indice du tour après le retrait du joueur.
  */
  if (
    room.currentIndex >= 0 &&
    removedIndex < room.currentIndex
  ) {
    room.currentIndex -= 1;
  }

  /*
    Si c'était au joueur retiré de jouer, le joueur suivant
    se trouve maintenant au même emplacement dans la liste.
  */
  if (removedPlayerWasCurrent) {
    room.currentIndex =
      removedIndex % room.players.length;
  }

  /*
    S'il reste moins de deux joueurs pendant une partie,
    la partie est interrompue et le salon revient à l'accueil.
  */
  if (
    room.players.length < 2 &&
    room.status !== "lobby"
  ) {
    resetRoomToLobby(
      room,
      "La partie a été interrompue : il faut au moins deux joueurs."
    );

    broadcastRoom(room);
    return;
  }

  /*
    Dans le salon d'attente, il suffit d'actualiser
    l'affichage des joueurs.
  */
  if (room.status === "lobby") {
    broadcastRoom(room);
    return;
  }

  /*
    Si le Voleur qui devait choisir une victime quitte,
    la manche se termine sans effectuer le vol.
  */
  if (
    room.phase === "steal" &&
    removedPlayerWasPendingActor
  ) {
    finalizeRound(room);
    return;
  }

  /*
    Si le joueur qui devait agir quitte en pleine action,
    son tour est abandonné et le joueur suivant commence.
  */
  if (
    room.status === "playing" &&
    (
      removedPlayerWasCurrent ||
      removedPlayerWasPendingActor
    )
  ) {
    room.pending = null;

    if (activePlayers(room).length <= 1) {
      endRound(room);
      return;
    }

    startCurrentTurn(room);
    return;
  }

  /*
    Si la cible d'une devinette quitte, l'auteur de
    l'action doit choisir une autre cible.
  */
  if (
    room.status === "playing" &&
    removedPlayerWasPendingTarget
  ) {
    const actor = getPlayer(
      room,
      room.pending?.actorId
    );

    if (
      actor &&
      actor.alive &&
      hasValidTarget(room, actor, false)
    ) {
      room.phase = "target";

      room.pending = {
        kind: "target",
        actorId: actor.id,
        cardName: pendingCardName,
        targetId: null
      };

      addLog(
        room,
        `${actor.name} doit choisir une nouvelle cible.`
      );

      broadcastRoom(room);
      return;
    }

    finishTurn(room);
    return;
  }

  /*
    Si le départ laisse un seul joueur actif,
    la manche se termine.
  */
  if (
    room.status === "playing" &&
    activePlayers(room).length <= 1
  ) {
    endRound(room);
    return;
  }

  broadcastRoom(room);
}

function startRound(room) {
  room.round += 1;
  room.status = "playing";
  room.phase = "starting";
  room.pending = null;
  room.winnerIds = [];
  room.deck = createDeck();
  room.removedVisible = [];

  for (const player of room.players) {
    resetPlayerForRound(player);
  }

  // Une carte secrète retirée du paquet.
  room.burnCard = room.deck.pop();

  // À deux joueurs : trois cartes retirées face visible.
  if (room.players.length === 2) {
    for (let i = 0; i < 3; i++) {
      const card = room.deck.pop();
      if (card) room.removedVisible.push(card);
    }
  }

  // Distribution d'une carte à chaque joueur.
  for (const player of room.players) {
    const card = room.deck.pop();
    if (card) player.hand.push(card);
  }

  let starterIndex = 0;

  if (room.nextStarterId) {
    const found = room.players.findIndex(
      (player) => player.id === room.nextStarterId
    );

    if (found >= 0) starterIndex = found;
  } else {
    starterIndex = Math.floor(Math.random() * room.players.length);
  }

  room.currentIndex = starterIndex;

  addLog(room, `Début de la manche ${room.round}.`);
  startCurrentTurn(room);
}

function startCurrentTurn(room) {
  if (room.status !== "playing") return;

  if (activePlayers(room).length <= 1) {
    endRound(room);
    return;
  }

  const player = room.players[room.currentIndex];

  if (!player || !player.alive) {
    room.currentIndex = findNextAliveIndex(
      room,
      room.currentIndex
    );
    startCurrentTurn(room);
    return;
  }

  // La protection cesse au début du prochain tour du joueur.
  player.protected = false;

  if (player.skipTurns > 0) {
    player.skipTurns -= 1;
    addLog(
      room,
      `${player.name} est maudit et saute son tour.`
    );

    finishTurn(room);
    return;
  }

  const card = room.deck.pop();

  if (card) {
    player.hand.push(card);
  }

  room.phase = "play";
  room.pending = null;

  addLog(room, `C'est au tour de ${player.name}.`);
  broadcastRoom(room);
}

function findNextAliveIndex(room, startIndex) {
  for (let offset = 1; offset <= room.players.length; offset++) {
    const index = (startIndex + offset) % room.players.length;

    if (room.players[index].alive) {
      return index;
    }
  }

  return -1;
}

function finishTurn(room) {
  room.pending = null;

  if (room.status !== "playing") return;

  if (activePlayers(room).length <= 1 || room.deck.length === 0) {
    endRound(room);
    return;
  }

  const nextIndex = findNextAliveIndex(room, room.currentIndex);

  if (nextIndex < 0) {
    endRound(room);
    return;
  }

  room.currentIndex = nextIndex;
  startCurrentTurn(room);
}

/* =========================================================
   RÈGLES COMMUNES
========================================================= */

function isPlayersTurn(room, player) {
  return (
    room.status === "playing" &&
    room.players[room.currentIndex]?.id === player.id
  );
}

function forcedCountess(player) {
  const hasCountess = player.hand.some(
    (card) => card.name === "Comtesse"
  );

  const hasRoyalCard = player.hand.some(
    (card) => card.name === "Roi" || card.name === "Prince"
  );

  return hasCountess && hasRoyalCard;
}

function validTargets(room, actor, options = {}) {
  const {
    allowSelf = false
  } = options;

  return room.players.filter((target) => {
    if (!target.alive) return false;

    if (target.id === actor.id) {
      return allowSelf;
    }

    if (target.protected) return false;

    return true;
  });
}

function hasValidTarget(room, actor, allowSelf = false) {
  return validTargets(room, actor, { allowSelf }).length > 0;
}

function recordDiscard(player, card) {
  if (!card) return;

  player.discards.push(card);

  if (card.name === "Chroniqueuse") {
    player.playedChronicle = true;
  }
}

function discardSum(player) {
  return player.discards.reduce(
    (sum, card) => sum + card.value,
    0
  );
}

/*
  Élimine un joueur et révèle sa main.

  linkedNames sert notamment lorsqu'une Princesse vient d'être
  défaussée avant l'appel de cette fonction.
*/
function eliminatePlayer(
  room,
  player,
  reason,
  linkedNames = []
) {
  if (!player || !player.alive) return;

  const leavingCards = [
    ...linkedNames,
    ...player.hand.map((card) => card.name)
  ];

  player.alive = false;
  player.protected = false;
  player.skipTurns = 0;

  while (player.hand.length > 0) {
    const card = player.hand.shift();
    recordDiscard(player, card);
  }

  addLog(room, `${player.name} quitte la manche : ${reason}.`);

  const triggersQueen = leavingCards.some((name) =>
    ["Roi", "Prince", "Princesse"].includes(name)
  );

  if (triggersQueen) {
    const queenHolders = room.players.filter(
      (candidate) =>
        candidate.alive &&
        candidate.hand.some((card) => card.name === "Reine")
    );

    for (const queenHolder of queenHolders) {
      eliminatePlayer(
        room,
        queenHolder,
        "la Reine quitte la manche avec la famille royale"
      );
    }
  }
}

function resolveNoTarget(room, actor, cardName) {
  addLog(
    room,
    `${actor.name} n'a aucune cible valide pour ${cardName}.`
  );
  finishTurn(room);
}

/* =========================================================
   JOUER UNE CARTE
========================================================= */

function playCard(room, player, cardId) {
  if (!isPlayersTurn(room, player)) {
    throw new Error("Ce n'est pas votre tour.");
  }

  if (room.phase !== "play") {
    throw new Error("Vous ne pouvez pas jouer une carte maintenant.");
  }

  const cardIndex = player.hand.findIndex(
    (card) => card.id === cardId
  );

  if (cardIndex < 0) {
    throw new Error("Cette carte n'est pas dans votre main.");
  }

  const chosenCard = player.hand[cardIndex];

  if (
    forcedCountess(player) &&
    chosenCard.name !== "Comtesse"
  ) {
    throw new Error(
      "Vous devez jouer la Comtesse avec le Roi ou un Prince."
    );
  }

  player.hand.splice(cardIndex, 1);
  recordDiscard(player, chosenCard);

  addLog(
    room,
    `${player.name} joue ${chosenCard.name} (${chosenCard.value}).`
  );

  switch (chosenCard.name) {
    case "Princesse":
      eliminatePlayer(
        room,
        player,
        "la Princesse a été jouée ou défaussée",
        ["Princesse"]
      );
      finishTurn(room);
      break;

    case "Diable":
    case "Voleur":
    case "Chroniqueuse":
    case "Comtesse":
    case "Reine":
      finishTurn(room);
      break;

    case "Domestique":
      player.protected = true;
      addLog(
        room,
        `${player.name} est protégé jusqu'au début de son prochain tour.`
      );
      finishTurn(room);
      break;

    case "Majordome":
    case "Garde royal":
    case "Prêtre":
    case "Sorcière":
    case "Baron":
    case "Roi":
      if (!hasValidTarget(room, player, false)) {
        resolveNoTarget(room, player, chosenCard.name);
        return;
      }

      room.phase = "target";
      room.pending = {
        kind: "target",
        actorId: player.id,
        cardName: chosenCard.name,
        targetId: null
      };
      broadcastRoom(room);
      break;

    case "Prince":
      if (!hasValidTarget(room, player, true)) {
        resolveNoTarget(room, player, chosenCard.name);
        return;
      }

      room.phase = "target";
      room.pending = {
        kind: "target",
        actorId: player.id,
        cardName: "Prince",
        targetId: null
      };
      broadcastRoom(room);
      break;

    case "Chancelier":
      resolveChancellorDraw(room, player);
      break;

    default:
      finishTurn(room);
  }
}

/* =========================================================
   CHANCELIER
========================================================= */

function resolveChancellorDraw(room, player) {
  for (let i = 0; i < 2; i++) {
    const card = room.deck.pop();
    if (card) player.hand.push(card);
  }

  if (player.hand.length <= 1) {
    addLog(
      room,
      `${player.name} ne peut pas piocher davantage avec le Chancelier.`
    );
    finishTurn(room);
    return;
  }

  room.phase = "chancellor";
  room.pending = {
    kind: "chancellor",
    actorId: player.id,
    cardName: "Chancelier"
  };

  broadcastRoom(room);
}

function resolveChancellorChoice(
  room,
  player,
  keepId,
  bottomIds
) {
  if (
    room.phase !== "chancellor" ||
    room.pending?.actorId !== player.id
  ) {
    throw new Error("Aucun choix du Chancelier n'est attendu.");
  }

  const allIds = player.hand.map((card) => card.id);
  const submitted = [keepId, ...(bottomIds || [])];

  if (
    submitted.length !== allIds.length ||
    new Set(submitted).size !== allIds.length ||
    !submitted.every((id) => allIds.includes(id))
  ) {
    throw new Error(
      "Vous devez conserver une carte et ordonner toutes les autres."
    );
  }

  const keepCard = player.hand.find(
    (card) => card.id === keepId
  );

  const bottomCards = bottomIds.map((id) =>
    player.hand.find((card) => card.id === id)
  );

  player.hand = [keepCard];

  /*
    Le premier élément est placé tout au-dessous du paquet.
    La pioche utilise pop(), donc le début du tableau est le fond.
  */
  room.deck = [...bottomCards, ...room.deck];

  addLog(
    room,
    `${player.name} conserve une carte et place ${bottomCards.length} carte(s) sous la pioche.`
  );

  finishTurn(room);
}

/* =========================================================
   CHOIX D'UNE CIBLE
========================================================= */

function chooseTarget(room, actor, targetId) {
  if (
    room.phase !== "target" ||
    room.pending?.actorId !== actor.id
  ) {
    throw new Error("Aucune cible n'est attendue.");
  }

  if (!isPlayersTurn(room, actor)) {
    throw new Error("Ce n'est pas votre tour.");
  }

  const target = getPlayer(room, targetId);

  if (!target || !target.alive) {
    throw new Error("Cette cible n'est pas valide.");
  }

  const cardName = room.pending.cardName;
  const allowSelf = cardName === "Prince";

  if (target.id === actor.id && !allowSelf) {
    throw new Error("Vous devez choisir un autre joueur.");
  }

  if (
    target.id !== actor.id &&
    target.protected
  ) {
    throw new Error("Ce joueur est protégé.");
  }

  switch (cardName) {
    case "Majordome":
    case "Garde royal":
      room.phase = "guess";
      room.pending = {
        kind: "guess",
        actorId: actor.id,
        targetId: target.id,
        cardName
      };
      broadcastRoom(room);
      break;

    case "Prêtre":
      resolvePriest(room, actor, target);
      break;

    case "Sorcière":
      target.skipTurns += 1;

      addLog(
        room,
        `${target.name} a été maudit par ${actor.name}.`
      );

      finishTurn(room);
      break;

    case "Baron":
      resolveBaron(room, actor, target);
      break;

    case "Prince":
      resolvePrince(room, actor, target);
      break;

    case "Roi":
      resolveKing(room, actor, target);
      break;

    default:
      throw new Error("Effet de cible inconnu.");
  }
}

/* =========================================================
   MAJORDOME ET GARDE ROYAL
========================================================= */

function resolveGuess(room, actor, guessedName) {
  if (
    room.phase !== "guess" ||
    room.pending?.actorId !== actor.id
  ) {
    throw new Error("Aucune réponse n'est attendue.");
  }

  const cardName = room.pending.cardName;
  const target = getPlayer(room, room.pending.targetId);

  if (!target || !target.alive) {
    throw new Error("La cible n'est plus valide.");
  }

  if (!CARD_NAMES.includes(guessedName)) {
    throw new Error("Personnage inconnu.");
  }

  if (
    cardName === "Majordome" &&
    guessedName === "Majordome"
  ) {
    throw new Error("Le Majordome ne peut pas annoncer Majordome.");
  }

  if (
    cardName === "Garde royal" &&
    guessedName === "Garde royal"
  ) {
    throw new Error(
      "Le Garde royal ne peut pas annoncer Garde royal."
    );
  }

  const correct = target.hand.some(
    (card) => card.name === guessedName
  );

  addLog(
    room,
    `${actor.name} pense que ${target.name} possède ${guessedName}.`
  );

  if (!correct) {
    addLog(room, "La réponse est incorrecte.");
    finishTurn(room);
    return;
  }

  addLog(room, "La réponse est correcte.");

  eliminatePlayer(
    room,
    target,
    `${actor.name} a correctement deviné ${guessedName}`
  );

  if (
    activePlayers(room).length <= 1 ||
    !actor.alive
  ) {
    finishTurn(room);
    return;
  }

  if (cardName === "Garde royal") {
    if (!hasValidTarget(room, actor, false)) {
      finishTurn(room);
      return;
    }

    room.phase = "target";
    room.pending = {
      kind: "target",
      actorId: actor.id,
      cardName: "Garde royal",
      targetId: null
    };

    addLog(
      room,
      `${actor.name} peut tenter une nouvelle devinette.`
    );

    broadcastRoom(room);
    return;
  }

  finishTurn(room);
}

/* =========================================================
   PRÊTRE
========================================================= */

function resolvePriest(room, actor, target) {
  const card = target.hand[0];

  if (!card) {
    finishTurn(room);
    return;
  }

  sendPrivate(
    actor,
    `${target.name} possède ${card.name} (${card.value}).`
  );

  addLog(
    room,
    `${actor.name} regarde secrètement la main de ${target.name}.`
  );

  if (card.name === "Diable") {
    addLog(
      room,
      `Le Prêtre a découvert le Diable chez ${target.name}.`
    );

    eliminatePlayer(
      room,
      target,
      "le Prêtre a découvert le Diable"
    );
  }

  finishTurn(room);
}

/* =========================================================
   BARON
========================================================= */

function resolveBaron(room, actor, target) {
  const actorCard = actor.hand[0];
  const targetCard = target.hand[0];

  if (!actorCard || !targetCard) {
    finishTurn(room);
    return;
  }

  sendPrivate(
    actor,
    `Comparaison : vous avez ${actorCard.name} (${actorCard.value}) et ${target.name} a ${targetCard.name} (${targetCard.value}).`
  );

  sendPrivate(
    target,
    `Comparaison : vous avez ${targetCard.name} (${targetCard.value}) et ${actor.name} a ${actorCard.name} (${actorCard.value}).`
  );

  addLog(
    room,
    `${actor.name} compare sa main avec celle de ${target.name}.`
  );

  if (actorCard.value < targetCard.value) {
    eliminatePlayer(
      room,
      actor,
      `défaite contre ${target.name} lors de la comparaison du Baron`
    );
  } else if (targetCard.value < actorCard.value) {
    eliminatePlayer(
      room,
      target,
      `défaite contre ${actor.name} lors de la comparaison du Baron`
    );
  } else {
    addLog(room, "Les deux cartes ont la même valeur.");
  }

  finishTurn(room);
}

/* =========================================================
   PRINCE
========================================================= */

function resolvePrince(room, actor, target) {
  const discardedCard = target.hand.shift();

  if (!discardedCard) {
    finishTurn(room);
    return;
  }

  recordDiscard(target, discardedCard);

  addLog(
    room,
    `${target.name} défausse ${discardedCard.name} à cause du Prince.`
  );

  if (discardedCard.name === "Princesse") {
    eliminatePlayer(
      room,
      target,
      "la Princesse a été défaussée",
      ["Princesse"]
    );

    finishTurn(room);
    return;
  }

  let newCard = room.deck.pop();

  /*
    Comme dans Your fate, la carte secrètement retirée
    peut servir si le Prince agit alors que la pioche est vide.
  */
  if (!newCard && room.burnCard) {
    newCard = room.burnCard;
    room.burnCard = null;
  }

  if (newCard && target.alive) {
    target.hand.push(newCard);
  }

  finishTurn(room);
}

/* =========================================================
   ROI
========================================================= */

function resolveKing(room, actor, target) {
  const actorHand = actor.hand;
  actor.hand = target.hand;
  target.hand = actorHand;

  addLog(
    room,
    `${actor.name} échange sa main avec ${target.name}.`
  );

  sendPrivate(
    actor,
    `Après l'échange, vous possédez ${actor.hand[0]?.name || "aucune carte"}.`
  );

  sendPrivate(
    target,
    `Après l'échange, vous possédez ${target.hand[0]?.name || "aucune carte"}.`
  );

  finishTurn(room);
}

/* =========================================================
   FIN DE MANCHE
========================================================= */

function determineMainWinners(room) {
  const survivors = activePlayers(room);

  if (survivors.length === 0) {
    return [];
  }

  const devilHolders = survivors.filter((player) =>
    player.hand.some((card) => card.name === "Diable")
  );

  if (devilHolders.length > 0) {
    addLog(
      room,
      `${devilHolders.map((p) => p.name).join(", ")} gagne grâce au Diable.`
    );

    return devilHolders;
  }

  if (survivors.length === 1) {
    return survivors;
  }

  const highestValue = Math.max(
    ...survivors.map(
      (player) => player.hand[0]?.value ?? -Infinity
    )
  );

  let candidates = survivors.filter(
    (player) =>
      (player.hand[0]?.value ?? -Infinity) === highestValue
  );

  if (candidates.length === 1) {
    return candidates;
  }

  const highestDiscardSum = Math.max(
    ...candidates.map(discardSum)
  );

  candidates = candidates.filter(
    (player) => discardSum(player) === highestDiscardSum
  );

  return candidates;
}

function endRound(room) {
  if (
    room.status !== "playing" &&
    room.phase !== "steal"
  ) {
    return;
  }

  room.status = "roundEnd";
  room.phase = "resolving";
  room.pending = null;

  const winners = determineMainWinners(room);
  room.winnerIds = winners.map((player) => player.id);

  for (const winner of winners) {
    winner.favors += 1;
    addLog(
      room,
      `${winner.name} gagne 1 pion Faveur pour la manche.`
    );
  }

  if (winners[0]) {
    room.nextStarterId = winners[0].id;
  }

  // Bonus de la Chroniqueuse.
  const chroniclers = activePlayers(room).filter(
    (player) => player.playedChronicle
  );

  if (chroniclers.length === 1) {
    chroniclers[0].favors += 1;

    addLog(
      room,
      `${chroniclers[0].name} gagne 1 Faveur grâce à la Chroniqueuse.`
    );
  }

  // Le Voleur agit après toutes les récompenses.
  const thieves = activePlayers(room).filter((player) =>
    player.hand.some((card) => card.name === "Voleur")
  );

  if (thieves.length === 1) {
    const thief = thieves[0];
    const possibleVictims = room.players.filter(
      (player) =>
        player.id !== thief.id &&
        player.favors > 0
    );

    if (possibleVictims.length > 0) {
      room.phase = "steal";
      room.pending = {
        kind: "steal",
        actorId: thief.id,
        cardName: "Voleur"
      };

      room.currentIndex = room.players.findIndex(
        (player) => player.id === thief.id
      );

      addLog(
        room,
        `${thief.name} doit choisir une Faveur à voler.`
      );

      broadcastRoom(room);
      return;
    }
  }

  finalizeRound(room);
}

function resolveSteal(room, thief, victimId) {
  if (
    room.phase !== "steal" ||
    room.pending?.actorId !== thief.id
  ) {
    throw new Error("Vous ne pouvez pas voler maintenant.");
  }

  const victim = getPlayer(room, victimId);

  if (
    !victim ||
    victim.id === thief.id ||
    victim.favors <= 0
  ) {
    throw new Error(
      "Choisissez un autre joueur possédant au moins une Faveur."
    );
  }

  victim.favors -= 1;
  thief.favors += 1;

  addLog(
    room,
    `${thief.name} vole 1 Faveur à ${victim.name}.`
  );

  finalizeRound(room);
}

function finalizeRound(room) {
  room.pending = null;

  const gameWinners = room.players.filter(
    (player) => player.favors >= 3
  );

  if (gameWinners.length > 0) {
    room.status = "gameOver";
    room.phase = "gameOver";
    room.winnerIds = gameWinners.map((player) => player.id);

    addLog(
      room,
      `${gameWinners.map((p) => p.name).join(", ")} remporte la partie !`
    );
  } else {
    room.status = "roundEnd";
    room.phase = "roundEnd";
  }

  broadcastRoom(room);
}
/* =========================================================
   RELANCER UNE PARTIE
========================================================= */

function restartGame(room) {
  // Remise à zéro des informations générales.
  room.round = 0;
  room.deck = [];
  room.burnCard = null;
  room.removedVisible = [];
  room.currentIndex = -1;
  room.pending = null;
  room.winnerIds = [];
  room.nextStarterId = null;

  // Remise à zéro de tous les joueurs.
  for (const player of room.players) {
    player.favors = 0;
    player.hand = [];
    player.discards = [];
    player.alive = false;
    player.protected = false;
    player.skipTurns = 0;
    player.playedChronicle = false;
  }

  // On recommence également l'historique.
  room.logs = [
    "Une nouvelle partie de Your Fate commence !"
  ];

  // Cette fonction lance la première manche.
  startRound(room);
}

/* =========================================================
   SOCKET.IO
========================================================= */

io.on("connection", (socket) => {
  socket.on("createRoom", (data, callback) => {
    try {
      const name = cleanName(data?.name);

      if (!name) {
        return failure(callback, "Choisissez un pseudonyme.");
      }

      const code = createRoomCode();
      const player = createPlayer(name, socket);

      const room = {
        code,
        hostId: player.id,
        players: [player],
        status: "lobby",
        phase: "lobby",
        round: 0,
        deck: [],
        burnCard: null,
        removedVisible: [],
        currentIndex: -1,
        pending: null,
        logs: [`${name} a créé le salon.`],
        winnerIds: [],
        nextStarterId: null,
        emptyTimer: null
      };

      
      rooms.set(code, room);

      socket.join(code);
      socket.data.roomCode = code;
      socket.data.playerId = player.id;

      success(callback, {
        code,
        playerId: player.id,
        token: player.token
      });

      broadcastRoom(room);
    } catch (error) {
      failure(callback, error.message);
    }
  });

  socket.on("joinRoom", (data, callback) => {
    try {
      const code = String(data?.code || "")
        .trim()
        .toUpperCase();

      const room = rooms.get(code);

      if (!room) {
        return failure(callback, "Salon introuvable.");
      }
      if (room.emptyTimer) {
       clearTimeout(room.emptyTimer);
       room.emptyTimer = null;
      }

      const providedToken = String(data?.token || "");
      let player = room.players.find(
        (candidate) =>
          candidate.token === providedToken &&
          providedToken.length > 0
      );

      if (player) {
        player.socketId = socket.id;
        player.connected = true;

        socket.join(code);
        socket.data.roomCode = code;
        socket.data.playerId = player.id;

        addLog(room, `${player.name} s'est reconnecté.`);

        success(callback, {
          code,
          playerId: player.id,
          token: player.token
        });

        broadcastRoom(room);
        return;
      }

      if (room.status !== "lobby") {
        return failure(
          callback,
          "La partie a déjà commencé."
        );
      }

      if (room.players.length >= 6) {
        return failure(callback, "Le salon est complet.");
      }

      const name = cleanName(data?.name);

      if (!name) {
        return failure(callback, "Choisissez un pseudonyme.");
      }

      if (
        room.players.some(
          (candidate) =>
            candidate.name.toLowerCase() === name.toLowerCase()
        )
      ) {
        return failure(
          callback,
          "Ce pseudonyme est déjà utilisé."
        );
      }

      player = createPlayer(name, socket);
      room.players.push(player);

      socket.join(code);
      socket.data.roomCode = code;
      socket.data.playerId = player.id;

      addLog(room, `${name} a rejoint le salon.`);

      success(callback, {
        code,
        playerId: player.id,
        token: player.token
      });

      broadcastRoom(room);
    } catch (error) {
      failure(callback, error.message);
    }
  });

  socket.on("startGame", (_, callback) => {
    try {
      const room = getRoom(socket);
      const player = getSocketPlayer(socket, room);

      if (!room || !player) {
        return failure(callback, "Salon introuvable.");
      }

      if (room.hostId !== player.id) {
        return failure(
          callback,
          "Seul l'hôte peut commencer."
        );
      }

      if (room.status !== "lobby") {
        return failure(
          callback,
          "La partie est déjà commencée."
        );
      }

      if (
        room.players.length < 2 ||
        room.players.length > 6
      ) {
        return failure(
          callback,
          "Il faut entre 2 et 6 joueurs."
        );
      }

      startRound(room);
      success(callback);
    } catch (error) {
      failure(callback, error.message);
    }
  });

  socket.on("playCard", (data, callback) => {
    try {
      const room = getRoom(socket);
      const player = getSocketPlayer(socket, room);

      if (!room || !player) {
        throw new Error("Salon introuvable.");
      }

      playCard(room, player, data?.cardId);
      success(callback);
    } catch (error) {
      failure(callback, error.message);
    }
  });

  socket.on("chooseTarget", (data, callback) => {
    try {
      const room = getRoom(socket);
      const player = getSocketPlayer(socket, room);

      if (!room || !player) {
        throw new Error("Salon introuvable.");
      }

      chooseTarget(room, player, data?.targetId);
      success(callback);
    } catch (error) {
      failure(callback, error.message);
    }
  });

  socket.on("guessCharacter", (data, callback) => {
    try {
      const room = getRoom(socket);
      const player = getSocketPlayer(socket, room);

      if (!room || !player) {
        throw new Error("Salon introuvable.");
      }

      resolveGuess(room, player, data?.name);
      success(callback);
    } catch (error) {
      failure(callback, error.message);
    }
  });

  socket.on("chancellorChoice", (data, callback) => {
    try {
      const room = getRoom(socket);
      const player = getSocketPlayer(socket, room);

      if (!room || !player) {
        throw new Error("Salon introuvable.");
      }

      resolveChancellorChoice(
        room,
        player,
        data?.keepId,
        data?.bottomIds || []
      );

      success(callback);
    } catch (error) {
      failure(callback, error.message);
    }
  });

  socket.on("stealFavor", (data, callback) => {
    try {
      const room = getRoom(socket);
      const player = getSocketPlayer(socket, room);

      if (!room || !player) {
        throw new Error("Salon introuvable.");
      }

      resolveSteal(room, player, data?.victimId);
      success(callback);
    } catch (error) {
      failure(callback, error.message);
    }
  });

    socket.on("nextRound", (_, callback) => {
    try {
      const room = getRoom(socket);
      const player = getSocketPlayer(socket, room);

      if (!room || !player) {
        throw new Error("Salon introuvable.");
      }

      if (room.hostId !== player.id) {
        throw new Error(
          "Seul l'hôte peut lancer la manche suivante."
        );
      }

      if (room.status !== "roundEnd") {
        throw new Error(
          "La manche suivante ne peut pas encore commencer."
        );
      }

      startRound(room);
      success(callback);
    } catch (error) {
      failure(callback, error.message);
    }
  });

  socket.on("restartGame", (_, callback) => {
    try {
      const room = getRoom(socket);
      const player = getSocketPlayer(socket, room);

      if (!room || !player) {
        throw new Error("Salon introuvable.");
      }

      if (room.hostId !== player.id) {
        throw new Error(
          "Seul l'hôte peut relancer la partie."
        );
      }

      if (room.status !== "gameOver") {
        throw new Error(
          "La partie ne peut être relancée qu'après sa fin."
        );
      }

      if (
        room.players.length < 2 ||
        room.players.length > 6
      ) {
        throw new Error(
          "Il faut entre 2 et 6 joueurs pour rejouer."
        );
      }

      restartGame(room);
      success(callback);
    } catch (error) {
      failure(callback, error.message);
    }
  });
socket.on("leaveRoom", (_, callback) => {
  try {
    const room = getRoom(socket);
    const player = getSocketPlayer(socket, room);

    if (!room || !player) {
      return failure(
        callback,
        "Vous n'êtes dans aucun salon."
      );
    }

    const roomCode = room.code;

    /*
      Retire réellement le joueur du salon.
    */
    removePlayerFromRoom(room, player);

    /*
      Retire également la connexion Socket.IO du salon.
    */
    socket.leave(roomCode);

    /*
      La connexion ne doit plus être associée
      à l'ancien salon et à l'ancien joueur.
    */
    socket.data.roomCode = null;
    socket.data.playerId = null;

    success(callback);
  } catch (error) {
    failure(callback, error.message);
  }
});

  socket.on("disconnect", () => {
    const room = getRoom(socket);
    const player = getSocketPlayer(socket, room);

    if (!room || !player) return;

    /*
      Si le joueur s'est déjà reconnecté avec une autre
      connexion, on ne déconnecte pas la nouvelle connexion.
    */
    if (player.socketId !== socket.id) return;

    player.connected = false;
    player.socketId = null;

    addLog(room, `${player.name} s'est déconnecté.`);
    broadcastRoom(room);

    const nobodyIsConnected = room.players.every(
      (candidate) => !candidate.connected
    );

    if (!nobodyIsConnected) return;

    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
    }

    room.emptyTimer = setTimeout(() => {
      const existingRoom = rooms.get(room.code);

      if (!existingRoom) return;

      const stillNobodyConnected =
        existingRoom.players.every(
          (candidate) => !candidate.connected
        );

      if (stillNobodyConnected) {
        rooms.delete(room.code);

        console.log(
          `Salon ${room.code} supprimé : aucun joueur connecté.`
        );
      } else {
        existingRoom.emptyTimer = null;
      }
    }, 30000);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
