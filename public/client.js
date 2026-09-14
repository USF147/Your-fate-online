const socket = io();

let state = null;
let currentRoomCode = null;

const homeScreen = document.querySelector("#home-screen");
const gameScreen = document.querySelector("#game-screen");
const playerNameInput = document.querySelector("#player-name");
const joinCodeInput = document.querySelector("#join-code");
const createButton = document.querySelector("#create-button");
const joinButton = document.querySelector("#join-button");
const homeError = document.querySelector("#home-error");
const roomCodeElement = document.querySelector("#room-code");
const playersElement = document.querySelector("#players");
const handElement = document.querySelector("#hand");
const actionsElement = document.querySelector("#actions");
const statusPanel = document.querySelector("#status-panel");
const logsElement = document.querySelector("#logs");
const deckCountElement = document.querySelector("#deck-count");
const removedPanel = document.querySelector("#removed-panel");
const removedCardsElement = document.querySelector("#removed-cards");
const cardReferenceElement = document.querySelector("#card-reference");
const privateToast = document.querySelector("#private-toast");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tokenKey(code) {
  return `love-letter-token-${code}`;
}

function saveSession(code, token, name) {
  localStorage.setItem(tokenKey(code), token);
  localStorage.setItem("love-letter-last-room", code);
  localStorage.setItem("love-letter-player-name", name);
}

function getSavedToken(code) {
  return localStorage.getItem(tokenKey(code)) || "";
}

function showError(message) {
  homeError.textContent = message || "";
}

function callbackHandler(result) {
  if (!result?.ok) {
    showActionError(result?.message || "Une erreur est survenue.");
  }
}

function showActionError(message) {
  const oldError = document.querySelector("#action-error");

  if (oldError) oldError.remove();

  const element = document.createElement("p");
  element.id = "action-error";
  element.className = "error";
  element.textContent = message;

  actionsElement.appendChild(element);
}

function enterGame(code) {
  currentRoomCode = code;
  homeScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  roomCodeElement.classList.remove("hidden");
  roomCodeElement.textContent = `SALON ${code}`;
}

createButton.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  showError("");

  socket.emit("createRoom", { name }, (result) => {
    if (!result?.ok) {
      showError(result?.message);
      return;
    }

    saveSession(result.code, result.token, name);
    enterGame(result.code);
  });
});

joinButton.addEventListener("click", () => {
  const name = playerNameInput.value.trim();
  const code = joinCodeInput.value.trim().toUpperCase();
  const token = getSavedToken(code);

  showError("");

  socket.emit(
    "joinRoom",
    { name, code, token },
    (result) => {
      if (!result?.ok) {
        showError(result?.message);
        return;
      }

      saveSession(result.code, result.token, name);
      enterGame(result.code);
    }
  );
});

joinCodeInput.addEventListener("input", () => {
  joinCodeInput.value = joinCodeInput.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
});

socket.on("connect", () => {
  const lastRoom = localStorage.getItem(
    "love-letter-last-room"
  );

  const name = localStorage.getItem(
    "love-letter-player-name"
  );

  if (name && !playerNameInput.value) {
    playerNameInput.value = name;
  }

  if (!lastRoom) return;

  const token = getSavedToken(lastRoom);

  if (!token) return;

  socket.emit(
    "joinRoom",
    {
      code: lastRoom,
      name: name || "",
      token
    },
    (result) => {
      if (result?.ok) {
        enterGame(result.code);
      }
    }
  );
});

socket.on("state", (newState) => {
  state = newState;
  enterGame(state.code);
  render();
});

socket.on("privateMessage", (message) => {
  privateToast.textContent = message;
  privateToast.classList.remove("hidden");

  clearTimeout(privateToast.hideTimer);

  privateToast.hideTimer = setTimeout(() => {
    privateToast.classList.add("hidden");
  }, 9000);
});

/* =========================================================
   AFFICHAGE
========================================================= */

function render() {
  if (!state?.self) return;

  renderStatus();
  renderPlayers();
  renderHand();
  renderActions();
  renderLogs();
  renderRemovedCards();
  renderReference();

  deckCountElement.textContent =
    state.status === "lobby"
      ? ""
      : `Pioche : ${state.deckCount} carte(s)`;
}

function renderStatus() {
  const self = state.self;
  const currentPlayer = state.players.find(
    (player) => player.id === state.currentPlayerId
  );

  let message = "";

  if (state.status === "lobby") {
    message =
      `Salon <strong>${escapeHtml(state.code)}</strong> — ` +
      `${state.players.length}/6 joueur(s). Partagez le code avec vos amis.`;
  } else if (state.status === "gameOver") {
    const winners = state.players
      .filter((player) => state.winnerIds.includes(player.id))
      .map((player) => player.name)
      .join(", ");

    message =
      `<strong>${escapeHtml(winners)}</strong> remporte la partie !`;
  } else if (state.status === "roundEnd") {
    const winners = state.players
      .filter((player) => state.winnerIds.includes(player.id))
      .map((player) => player.name)
      .join(", ");

    message =
      `Manche ${state.round} terminée.` +
      (winners
        ? ` Gagnant(s) principal(aux) : <strong>${escapeHtml(winners)}</strong>.`
        : "");
  } else if (!self.alive) {
    message =
      `Vous avez quitté la manche. Tour actuel : ` +
      `<strong>${escapeHtml(currentPlayer?.name || "—")}</strong>.`;
  } else if (state.currentPlayerId === self.id) {
    message = `<strong>C'est votre tour.</strong>`;
  } else {
    message =
      `C'est au tour de ` +
      `<strong>${escapeHtml(currentPlayer?.name || "—")}</strong>.`;
  }

  statusPanel.innerHTML = `
    <p class="status-message">${message}</p>
  `;
}

function renderPlayers() {
  playersElement.innerHTML = "";

  for (const player of state.players) {
    const container = document.createElement("article");

    container.className = [
      "player",
      player.id === state.currentPlayerId ? "current" : "",
      !player.alive && state.status !== "lobby" ? "dead" : ""
    ].join(" ");

    const discards = player.discards.length
      ? player.discards
          .map(
            (card) =>
              `<span class="discard">${escapeHtml(card.name)} ${card.value}</span>`
          )
          .join("")
      : `<span class="discard">Aucune défausse</span>`;

    const visibleHand =
      player.hand?.length &&
      player.id !== state.self.id
        ? `
          <div class="discards">
            ${player.hand
              .map(
                (card) =>
                  `<span class="discard">Main : ${escapeHtml(card.name)} ${card.value}</span>`
              )
              .join("")}
          </div>
        `
        : "";

    container.innerHTML = `
      <div class="player-name">
        <span>
          ${escapeHtml(player.name)}
          ${player.id === state.self.id ? " (vous)" : ""}
        </span>
        <span>${player.favors} ★</span>
      </div>

      <div class="badges">
        ${player.isHost ? `<span class="badge gold">Hôte</span>` : ""}
        ${player.connected
          ? `<span class="badge green">Connecté</span>`
          : `<span class="badge red">Déconnecté</span>`
        }
        ${player.protected
          ? `<span class="badge">Protégé</span>`
          : ""
        }
        ${player.cursed
          ? `<span class="badge">Maudit</span>`
          : ""
        }
        ${!player.alive && state.status !== "lobby"
          ? `<span class="badge red">Éliminé</span>`
          : ""
        }
        ${player.alive && state.status !== "lobby"
          ? `<span class="badge">${player.handCount} carte(s)</span>`
          : ""
        }
      </div>

      <div class="discards">${discards}</div>
      ${visibleHand}
    `;

    playersElement.appendChild(container);
  }
}

function renderCard(card, playable = false) {
  const element = document.createElement("article");
  element.className = "card";

  element.innerHTML = `
    <div class="value">${card.value}</div>
    <h3>${escapeHtml(card.name)}</h3>
    <p>${escapeHtml(card.text)}</p>
  `;

  if (playable) {
    const button = document.createElement("button");
    button.textContent = "Jouer cette carte";

    button.addEventListener("click", () => {
      socket.emit(
        "playCard",
        { cardId: card.id },
        callbackHandler
      );
    });

    element.appendChild(button);
  }

  return element;
}

function renderHand() {
  handElement.innerHTML = "";

  if (!state.self.hand.length) {
    handElement.innerHTML =
      `<p class="notice">Vous n'avez actuellement aucune carte en main.</p>`;
    return;
  }

  const canPlay =
    state.status === "playing" &&
    state.phase === "play" &&
    state.currentPlayerId === state.self.id &&
    state.self.alive;

  for (const card of state.self.hand) {
    handElement.appendChild(renderCard(card, canPlay));
  }
}

function renderActions() {
  actionsElement.innerHTML = "";

  const self = state.self;
  const isHost = state.hostId === self.id;

  if (state.status === "lobby") {
    if (isHost) {
      const button = document.createElement("button");
      button.textContent = "Lancer la partie";
      button.disabled = state.players.length < 2;

      button.addEventListener("click", () => {
        socket.emit("startGame", {}, callbackHandler);
      });

      actionsElement.appendChild(button);
    } else {
      actionsElement.innerHTML =
        `<p class="notice">En attente du lancement par l'hôte.</p>`;
    }

    return;
  }

  if (state.status === "gameOver") {
    if (isHost) {
      const message = document.createElement("p");
      message.className = "notice";
      message.textContent =
        "La partie est terminée. Vous pouvez relancer une nouvelle partie avec les mêmes joueurs.";

      const button = document.createElement("button");
      button.textContent = "Rejouer une partie";

      button.addEventListener("click", () => {
        button.disabled = true;
        button.textContent = "Redémarrage…";

        socket.emit("restartGame", {}, (result) => {
          if (!result?.ok) {
            button.disabled = false;
            button.textContent = "Rejouer une partie";

            showActionError(
              result?.message ||
              "Impossible de relancer la partie."
            );
          }
        });
      });

      actionsElement.appendChild(message);
      actionsElement.appendChild(button);
    } else {
      actionsElement.innerHTML = `
        <p class="notice">
          La partie est terminée. En attente de l'hôte
          pour relancer une nouvelle partie.
        </p>
      `;
    }

    return;
  }


  if (state.status === "roundEnd") {
    if (isHost) {
      const button = document.createElement("button");
      button.textContent = "Lancer la manche suivante";

      button.addEventListener("click", () => {
        socket.emit("nextRound", {}, callbackHandler);
      });

      actionsElement.appendChild(button);
    } else {
      actionsElement.innerHTML =
        `<p class="notice">En attente de la prochaine manche.</p>`;
    }

    return;
  }

  if (
    state.phase === "steal" &&
    state.pending?.kind === "steal"
  ) {
    renderStealAction();
    return;
  }

  if (!self.alive) {
    actionsElement.innerHTML =
      `<p class="notice">Vous êtes éliminé pour cette manche.</p>`;
    return;
  }

  if (state.currentPlayerId !== self.id) {
    actionsElement.innerHTML =
      `<p class="notice">Attendez votre tour.</p>`;
    return;
  }

  if (state.phase === "play") {
    actionsElement.innerHTML =
      `<p class="notice">Choisissez une carte dans votre main.</p>`;
    return;
  }

  if (
    state.phase === "target" &&
    state.pending?.kind === "target"
  ) {
    renderTargetAction();
    return;
  }

  if (
    state.phase === "guess" &&
    state.pending?.kind === "guess"
  ) {
    renderGuessAction();
    return;
  }

  if (
    state.phase === "chancellor" &&
    state.pending?.kind === "chancellor"
  ) {
    renderChancellorAction();
    return;
  }

  actionsElement.innerHTML =
    `<p class="notice">Résolution de l'action en cours…</p>`;
}

/* =========================================================
   ACTIONS
========================================================= */

function renderTargetAction() {
  const cardName = state.pending.cardName;
  const allowSelf = cardName === "Prince";

  const targets = state.players.filter((player) => {
    if (!player.alive) return false;

    if (player.id === state.self.id) {
      return allowSelf;
    }

    return !player.protected;
  });

  const title = document.createElement("p");
  title.textContent = `Choisissez la cible de ${cardName}.`;
  actionsElement.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "action-grid";

  for (const target of targets) {
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent =
      target.id === state.self.id
        ? `${target.name} (vous)`
        : target.name;

    button.addEventListener("click", () => {
      socket.emit(
        "chooseTarget",
        { targetId: target.id },
        callbackHandler
      );
    });

    grid.appendChild(button);
  }

  actionsElement.appendChild(grid);
}

function renderGuessAction() {
  const target = state.players.find(
    (player) => player.id === state.pending.targetId
  );

  const forbidden =
    state.pending.cardName === "Majordome"
      ? "Majordome"
      : "Garde royal";

  const form = document.createElement("div");
  form.className = "action-form";

  form.innerHTML = `
    <p>
      Devinez la carte de
      <strong>${escapeHtml(target?.name || "la cible")}</strong>.
    </p>

    <select id="guess-select">
      ${state.cardTypes
        .filter((card) => card.name !== forbidden)
        .map(
          (card) =>
            `<option value="${escapeHtml(card.name)}">${escapeHtml(card.name)} (${card.value})</option>`
        )
        .join("")}
    </select>

    <button id="guess-button">Valider la devinette</button>
  `;

  actionsElement.appendChild(form);

  document
    .querySelector("#guess-button")
    .addEventListener("click", () => {
      const name =
        document.querySelector("#guess-select").value;

      socket.emit(
        "guessCharacter",
        { name },
        callbackHandler
      );
    });
}

function renderChancellorAction() {
  const hand = state.self.hand;
  let selectedKeepId = hand[0]?.id || null;
  let bottomOrder = hand
    .filter((card) => card.id !== selectedKeepId)
    .map((card) => card.id);

  const wrapper = document.createElement("div");

  wrapper.innerHTML = `
    <p>
      Choisissez la carte à conserver. Les autres seront
      replacées sous la pioche.
    </p>

    <label for="chancellor-keep">Carte conservée</label>

    <select id="chancellor-keep">
      ${hand
        .map(
          (card) =>
            `<option value="${card.id}">${escapeHtml(card.name)} (${card.value})</option>`
        )
        .join("")}
    </select>

    <p>
      Ordre sous la pioche :
      la première carte sera placée tout au fond.
    </p>

    <div id="bottom-order" class="chancellor-list"></div>

    <button id="chancellor-confirm">
      Confirmer
    </button>
  `;

  actionsElement.appendChild(wrapper);

  const keepSelect =
    document.querySelector("#chancellor-keep");
  const orderContainer =
    document.querySelector("#bottom-order");

  function refreshOrder() {
    selectedKeepId = keepSelect.value;

    const allowedIds = hand
      .filter((card) => card.id !== selectedKeepId)
      .map((card) => card.id);

    bottomOrder = bottomOrder.filter((id) =>
      allowedIds.includes(id)
    );

    for (const id of allowedIds) {
      if (!bottomOrder.includes(id)) {
        bottomOrder.push(id);
      }
    }

    orderContainer.innerHTML = "";

    bottomOrder.forEach((id, index) => {
      const card = hand.find((item) => item.id === id);
      const row = document.createElement("div");
      row.className = "chancellor-row";

      row.innerHTML = `
        <strong>${index + 1}.</strong>
        <span>${escapeHtml(card.name)} (${card.value})</span>
      `;

      const up = document.createElement("button");
      up.className = "secondary";
      up.textContent = "↑";
      up.disabled = index === 0;

      up.addEventListener("click", () => {
        [bottomOrder[index - 1], bottomOrder[index]] = [
          bottomOrder[index],
          bottomOrder[index - 1]
        ];
        refreshOrder();
      });

      const down = document.createElement("button");
      down.className = "secondary";
      down.textContent = "↓";
      down.disabled = index === bottomOrder.length - 1;

      down.addEventListener("click", () => {
        [bottomOrder[index], bottomOrder[index + 1]] = [
          bottomOrder[index + 1],
          bottomOrder[index]
        ];
        refreshOrder();
      });

      row.appendChild(up);
      row.appendChild(down);
      orderContainer.appendChild(row);
    });
  }

  keepSelect.addEventListener("change", refreshOrder);
  refreshOrder();

  document
    .querySelector("#chancellor-confirm")
    .addEventListener("click", () => {
      socket.emit(
        "chancellorChoice",
        {
          keepId: selectedKeepId,
          bottomIds: bottomOrder
        },
        callbackHandler
      );
    });
}

function renderStealAction() {
  const victims = state.players.filter(
    (player) =>
      player.id !== state.self.id &&
      player.favors > 0
  );

  const title = document.createElement("p");
  title.textContent =
    "Vous êtes le seul Voleur encore en lice. Choisissez un joueur à qui voler 1 Faveur.";

  actionsElement.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "action-grid";

  for (const victim of victims) {
    const button = document.createElement("button");
    button.className = "danger";
    button.textContent =
      `Voler ${victim.name} (${victim.favors} ★)`;

    button.addEventListener("click", () => {
      socket.emit(
        "stealFavor",
        { victimId: victim.id },
        callbackHandler
      );
    });

    grid.appendChild(button);
  }

  actionsElement.appendChild(grid);
}

/* =========================================================
   AUTRES AFFICHAGES
========================================================= */

function renderLogs() {
  logsElement.innerHTML = state.logs
    .slice()
    .reverse()
    .map(
      (line) =>
        `<div class="log-line">${escapeHtml(line)}</div>`
    )
    .join("");
}

function renderRemovedCards() {
  removedCardsElement.innerHTML = "";

  if (!state.removedVisible.length) {
    removedPanel.classList.add("hidden");
    return;
  }

  removedPanel.classList.remove("hidden");

  for (const card of state.removedVisible) {
    removedCardsElement.appendChild(renderCard(card, false));
  }
}

function renderReference() {
  cardReferenceElement.innerHTML = state.cardTypes
    .map(
      (card) => `
        <div class="reference-card">
          <strong>
            ${escapeHtml(card.name)} — ${card.value}
            × ${card.count}
          </strong>
          <p>${escapeHtml(card.text)}</p>
        </div>
      `
    )
    .join("");
}
