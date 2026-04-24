const socket = io();
let myRoomId = null;
let isHost = false;

const BOARD_SIZE = 10;
const CELL_COUNT = 100;
const CANVAS_SIZE = 520;
const CELL_SIZE = CANVAS_SIZE / BOARD_SIZE;

const SNAKES = {
  99: 7,
  94: 55,
  75: 32,
  62: 18,
  48: 11,
  40: 3
};

const LADDERS = {
  4: 25,
  13: 46,
  33: 49,
  42: 63,
  50: 74,
  80: 97
};

const PLAYER_PALETTE = [
  { color: '#e53e3e', avatarClass: 'p1-color', label: 'P1', name: 'Player 1' },
  { color: '#3182ce', avatarClass: 'p2-color', label: 'P2', name: 'Player 2' },
  { color: '#38a169', avatarClass: 'p3-color', label: 'P3', name: 'Player 3' },
  { color: '#d69e2e', avatarClass: 'p4-color', label: 'P4', name: 'Player 4' },
];

const PLAYER_OFFSETS = [
  { ox: -10, oy: -10 }, 
  { ox: 10, oy: -10 },
  { ox: -10, oy: 10 },
   { ox: 10, oy: 10 },
];

const MEDALS = ['🥇', '🥈', '🥉'];
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function getRankSuffix(rank) {
  const suffixes = ['st', 'nd', 'rd'];
  return rank <= 3 ? suffixes[rank - 1] : 'th';
}

function getMedal(rank) {
  return MEDALS[rank - 1] || `#${rank}`;
}

function getRankText(rank) {
  return `${getMedal(rank)} Finished! (${rank}${getRankSuffix(rank)})`;
}

const DOM = {
  canvas: document.getElementById('gameCanvas'),
  setupOverlay: document.getElementById('setup-overlay'),
  gameContainer: document.getElementById('game-container'),
  nameInputs: document.getElementById('name-inputs'),
  nameFields: document.getElementById('name-fields'),
  playerCountLabel: document.getElementById('player-count-label'),
  playersInfo: document.getElementById('players-info'),
  turnBox: document.getElementById('turn-box'),
  dice: document.getElementById('dice'),
  rollBtn: document.getElementById('rollBtn'),
  rankingRows: document.getElementById('ranking-rows'),
  rankingOverlay: document.getElementById('ranking-overlay'),
  setupControls: document.getElementById('setup-controls'),
  lobbySection: document.getElementById('lobby-section'),
  lobbyCodeDisplay: document.getElementById('lobby-code-display'),
  lobbyPlayers: document.getElementById('lobby-players'),
  roomCodeInput: document.getElementById('roomCodeInput'),
  startMultiplayerBtn: document.getElementById('start-multiplayer-btn'),
  waitingMsg: document.getElementById('waiting-msg'),
};

const ctx = DOM.canvas.getContext('2d');
let players = [];
let numPlayers = 2;
let currentPlayer = 0;
let gameOver = false;
let animating = false;
let finishOrder = [];
let lastRoll = 0;
let selectedCount = 0;

function showSetup() {
  DOM.setupOverlay.style.display = 'flex';
  DOM.gameContainer.style.display = 'none';
  DOM.setupControls.style.display = 'block';
  DOM.lobbySection.style.display = 'none';
}

function createOnlineRoom() {
  const hostNameIn = document.getElementById('hostName');
  const name = hostNameIn && hostNameIn.value.trim() ? hostNameIn.value.trim() : "Player " + Math.floor(Math.random() * 1000);
  isHost = true;

  socket.emit('createRoom', { name }, (response) => {
    myRoomId = response.room.id;
    showLobby(response.room);
  });
}

function joinOnlineRoom() {
  const joinNameIn = document.getElementById('joinName');
  const name = joinNameIn && joinNameIn.value.trim() ? joinNameIn.value.trim() : "Player " + Math.floor(Math.random() * 1000);
  const code = DOM.roomCodeInput.value.trim().toUpperCase();

  if (!code) return alert("Please enter a room code!");
  isHost = false;

  socket.emit('joinRoom', { roomId: code, playerData: { name } }, (response) => {
    if (response.error) {
      alert(response.error);
    } else {
      myRoomId = response.room.id;
      showLobby(response.room);
    }
  });
}

function showLobby(room) {
  DOM.setupControls.style.display = 'none';
  DOM.lobbySection.style.display = 'block';
  DOM.lobbyCodeDisplay.textContent = room.id;
  updateLobbyUI(room.players);

  if (isHost) {
    DOM.startMultiplayerBtn.style.display = 'inline-block';
    DOM.waitingMsg.style.display = 'none';
  } else {
    DOM.startMultiplayerBtn.style.display = 'none';
    DOM.waitingMsg.style.display = 'block';
  }
}

function updateLobbyUI(playersList) {
  DOM.lobbyPlayers.innerHTML = '';
  playersList.forEach((p, idx) => {
    const pal = PLAYER_PALETTE[idx];
    DOM.lobbyPlayers.innerHTML += `
      <div style="display:flex; align-items:center; gap: 10px; margin-bottom: 5px; color: white;">
        <div style="background: ${pal.color}; width: 20px; height: 20px; border-radius: 50%;"></div>
        <span style="font-size: 1.1rem; font-weight: bold;">${p.name}</span>
      </div>
    `;
  });
}

socket.on('playerJoined', (updatedPlayers) => {
  updateLobbyUI(updatedPlayers);
});


socket.on('lobbyPlayerLeft', (leaverName) => {
  alert(`🏃‍♂️ ${leaverName} has left the lobby!`);
});


socket.on('playerLeft', (socketId) => {
  const leaver = players.find(p => p.socketId === socketId);
  if (leaver) {
    leaver.finished = true;
    leaver.exited = true; 
    alert(`🏃‍♂️ ${leaver.name} has disconnected from the game!`);

    render();

    if (players[currentPlayer] && players[currentPlayer].socketId === socketId) {
      switchTurn();
    } else {
      updateUI(); 
    }

    if (players.filter(p => !p.exited).every(p => p.finished)) {
      endGame();
    }
  }
});

function startMultiplayerGame() {
  socket.emit('startGame', myRoomId);
}

socket.on('gameStarted', (serverPlayers) => {
  hideRankingOverlay();
  DOM.setupOverlay.style.display = 'none';
  DOM.gameContainer.style.display = 'block';


  players = serverPlayers.map((p, index) => {
    return {
      socketId: p.socketId,
      id: p.id,
      name: p.name,
      pos: p.pos,
      finished: p.finished,
      exited: false,
      color: PLAYER_PALETTE[index].color,
      label: PLAYER_PALETTE[index].label
    };
  });

  numPlayers = players.length;
  DOM.playerCountLabel.textContent = `Online Multiplayer · ${numPlayers} Players`;
  buildPlayerCards();
  resetGameState();
  render();
  updateUI();
});


function buildPlayers(n, namesList) {
  players = [];
  for (let i = 0; i < n; i++) {
    const pal = PLAYER_PALETTE[i];
    players.push({
      id: i + 1,
      pos: 0,
      color: pal.color,
      label: pal.label,
      name: namesList[i] || pal.name,
      finished: false,
      exited: false,
    });
  }
}

function buildPlayerCards() {
  DOM.playersInfo.innerHTML = '';
  players.forEach(p => {
    const pal = PLAYER_PALETTE[p.id - 1];
    DOM.playersInfo.innerHTML += `
      <div class="player-card" id="card-p${p.id}">
        <div class="player-avatar ${pal.avatarClass}">${p.label}</div>
        <div>
          <div class="player-name">${p.name}</div>
          <div class="player-pos" id="pos-p${p.id}">Square: Not Entered</div>
        </div>
      </div>`;
  });
}

function resetGameState() {
  currentPlayer = 0;
  gameOver = false;
  animating = false;
  lastRoll = 0;
  finishOrder = [];
  DOM.dice.textContent = '?';
  DOM.rollBtn.disabled = false;
  setTurnBox('default', `🎲 ${players[0].name}'s Turn`);
}

function setTurnBox(style, text) {
  DOM.turnBox.textContent = text;
  DOM.turnBox.classList.remove('turn-default', 'turn-bonus', 'turn-finished');
  DOM.turnBox.classList.add('turn-' + style);
}

function startGame(n, customNames) {
  numPlayers = n;
  DOM.setupOverlay.style.display = 'none';
  DOM.gameContainer.style.display = 'block';
  DOM.playerCountLabel.textContent = `Classic Board Game · ${n} Players`;

  buildPlayers(n, customNames || []);
  buildPlayerCards();
  resetGameState();

  render();
  updateUI();
}

function squareToXY(square) {
  const idx = square - 1;
  const row = Math.floor(idx / BOARD_SIZE);
  const col = idx % BOARD_SIZE;
  const displayCol = (row % 2 === 0) ? col : (BOARD_SIZE - 1 - col);
  const displayRow = BOARD_SIZE - 1 - row;
  return {
    x: displayCol * CELL_SIZE + CELL_SIZE / 2,
    y: displayRow * CELL_SIZE + CELL_SIZE / 2,
  };
}


function drawBoard() {
  ctx.fillStyle = '#f7fafc';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  for (let sq = 1; sq <= CELL_COUNT; sq++) {
    const { x, y } = squareToXY(sq);
    ctx.fillStyle = (sq % 2 === 0) ? '#e2e8f0' : '#fff';
    ctx.fillRect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
  }

  ctx.strokeStyle = '#cbd5e0';
  ctx.lineWidth = 3;
  for (let i = 0; i <= BOARD_SIZE; i++) {
    ctx.beginPath(); ctx.moveTo(i * CELL_SIZE, 0); ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * CELL_SIZE); ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE); ctx.stroke();
  }

  ctx.font = 'bold 11px Nunito, sans-serif';
  ctx.textAlign = 'center';
  for (let sq = 1; sq <= CELL_COUNT; sq++) {
    const { x, y } = squareToXY(sq);
    if (sq === 100) {
      ctx.fillStyle = '#f5d020';
      ctx.fillRect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
      ctx.fillStyle = '#744210';
    } else {
      ctx.fillStyle = '#718096';
    }
    ctx.fillText(sq, x, y - CELL_SIZE / 2 + 13);
  }

  for (const [bottom, top] of Object.entries(LADDERS)) {
    drawLadder(parseInt(bottom), parseInt(top));
  }
  for (const [head, tail] of Object.entries(SNAKES)) {
    drawSnake(parseInt(head), parseInt(tail));
  }

  const win = squareToXY(100);
  ctx.font = '22px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⭐', win.x, win.y + 6);
  ctx.textBaseline = 'alphabetic';
}

function drawLadder(bottom, top) {
  const b = squareToXY(bottom);
  const t = squareToXY(top);
  const dx = t.x - b.x, dy = t.y - b.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = -dy / len, uy = dx / len;
  const off = 6;
  const bL = { x: b.x + ux * off, y: b.y + uy * off };
  const bR = { x: b.x - ux * off, y: b.y - uy * off };
  const tL = { x: t.x + ux * off, y: t.y + uy * off };
  const tR = { x: t.x - ux * off, y: t.y - uy * off };
  ctx.strokeStyle = '#276749'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(bL.x, bL.y); ctx.lineTo(tL.x, tL.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bR.x, bR.y); ctx.lineTo(tR.x, tR.y); ctx.stroke();

  const rungs = 4;
  ctx.strokeStyle = '#48bb78'; ctx.lineWidth = 3;
  for (let i = 1; i <= rungs; i++) {
    const t_ = i / (rungs + 1);
    const rx = b.x + dx * t_, ry = b.y + dy * t_;
    ctx.beginPath();
    ctx.moveTo(rx + ux * off, ry + uy * off);
    ctx.lineTo(rx - ux * off, ry - uy * off);
    ctx.stroke();
  }
}

function drawSnake(head, tail) {
  const h = squareToXY(head);
  const t = squareToXY(tail);
  const mx = (h.x + t.x) / 2 + (t.y - h.y) * 0.35;
  const my = (h.y + t.y) / 2 - (t.x - h.x) * 0.35;

  ctx.strokeStyle = '#e53e3e'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.quadraticCurveTo(mx, my, t.x, t.y); ctx.stroke();

  ctx.fillStyle = '#c53030';
  ctx.beginPath(); ctx.arc(h.x, h.y, 7, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#fc8181'; ctx.lineWidth = 2;
  const angle = Math.atan2(t.y - h.y, t.x - h.x);
  const tx1 = h.x + Math.cos(angle) * 14, ty1 = h.y + Math.sin(angle) * 14;
  ctx.beginPath();
  ctx.moveTo(h.x + Math.cos(angle) * 10, h.y + Math.sin(angle) * 10);
  ctx.lineTo(tx1 + Math.cos(angle - 0.4) * 5, ty1 + Math.sin(angle - 0.4) * 5); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(h.x + Math.cos(angle) * 10, h.y + Math.sin(angle) * 10);
  ctx.lineTo(tx1 + Math.cos(angle + 0.4) * 5, ty1 + Math.sin(angle + 0.4) * 5); ctx.stroke();
}

function drawPlayers() {
  players.forEach((p, idx) => {
    if (p.pos === 0 || p.exited) return;
    const { x, y } = squareToXY(p.pos);
    const { ox, oy } = PLAYER_OFFSETS[idx];
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x + ox, y + oy + 6, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.label, x + ox, y + oy + 6);
    ctx.textBaseline = 'alphabetic';
  });
}

function render() {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  drawBoard();
  drawPlayers();
}



function rollDice() {
  if (gameOver || animating || DOM.rollBtn.disabled) return;
  DOM.rollBtn.disabled = true; 
  socket.emit('requestRoll', myRoomId);
}

socket.on('diceOutcome', (data) => {
  animating = true;
  lastRoll = data.roll;


  const rollingIndex = players.findIndex(p => p.socketId === data.rollerSocketId);
  if (rollingIndex !== -1) {
    currentPlayer = rollingIndex;
  }


  DOM.dice.textContent = DICE_FACES[data.roll - 1];
  DOM.dice.classList.remove('rolling');
  void DOM.dice.offsetWidth;
  DOM.dice.classList.add('rolling');

  // Trigger our existing animation loop to slide the player
  setTimeout(() => movePlayer(data.roll), 550);
});

function movePlayer(roll) {
  const p = players[currentPlayer];

  if (p.finished) {
    finalizeTurn();
    return;
  }

  if (p.pos === 0) {
    if (roll !== 1) { render(); finalizeTurn(); return; }
    p.pos = 1;
    render(); updateUI(); finalizeTurn(); return;
  }

  let targetPos = p.pos + roll;
  if (targetPos > 100) { render(); finalizeTurn(); return; }

  let slideInterval = setInterval(() => {
    p.pos++;
    render();
    updateUI();

    if (p.pos === targetPos) {
      clearInterval(slideInterval);

      let finalPos = p.pos;
      if (SNAKES[p.pos] !== undefined) {
        finalPos = SNAKES[p.pos];
      } else if (LADDERS[p.pos] !== undefined) {
        finalPos = LADDERS[p.pos];
      }

      if (finalPos !== p.pos) {
        setTimeout(() => {
          p.pos = finalPos;
          render();
          updateUI();
          checkWinAndFinalize(p);
        }, 400);
      } else {
        checkWinAndFinalize(p);
      }
    }
  }, 250);
}

function checkWinAndFinalize(p) {
  if (p.pos === 100) {
    p.finished = true;
    finishOrder.push(p);

    if (myRoomId) {
      socket.emit('playerFinished', myRoomId);
    }

    const rank = finishOrder.length;
    const style = rank === 1 ? 'default' : 'finished';
    setTurnBox(style, `${getMedal(rank)} ${p.name} finished! (${rank}${getRankSuffix(rank)} place)`);
    if (finishOrder.length === numPlayers) {
      endGame();
      return;
    }
    const remaining = players.filter(pl => !pl.finished);
    if (remaining.length === 1) {
      remaining[0].finished = true;
      finishOrder.push(remaining[0]);
      updateUI();
      endGame();
      return;
    }
    finalizeTurn();
    return;
  }

  finalizeTurn();
}

function endGame() {
  gameOver = true;
  DOM.rollBtn.disabled = true;
  showRankingOverlay();
}

function finalizeTurn() {
  animating = false;
  if (!gameOver) {
    DOM.rollBtn.disabled = false;
  }

  const curP = players[currentPlayer];

  if (lastRoll === 6 && !gameOver && curP && !curP.finished) {
    setTurnBox('bonus', `🔥 ${curP.name} rolled a 6 — Bonus Turn!`);
    updateUI();
    return;
  }

  switchTurn();
}

function switchTurn() {
  currentPlayer = (currentPlayer + 1) % numPlayers;
  let loops = 0;
  while (players[currentPlayer].finished && loops < numPlayers) {
    currentPlayer = (currentPlayer + 1) % numPlayers;
    loops++;
  }
  updateUI();
}

function updateUI() {
  players.forEach((p, idx) => {
    const posEl = document.getElementById(`pos-p${p.id}`);
    if (posEl) {
      if (p.exited) {
        posEl.textContent = '❌ Exited';
      } else if (p.finished) {
        const rank = finishOrder.indexOf(p) + 1;
        posEl.textContent = getRankText(rank);
      } else {
        posEl.textContent = p.pos === 0 ? 'Square: Not Entered' : `Square: ${p.pos}`;
      }
    }
    const card = document.getElementById(`card-p${p.id}`);
    if (card) {
      card.classList.toggle('active-player', idx === currentPlayer && !gameOver && !p.finished);
      card.classList.toggle('finished-player', !!p.finished);
    }
  });

  if (!gameOver) {
    const cur = players[currentPlayer];
    if (cur && !cur.finished) {
      setTurnBox('default', `🎲 ${cur.name}'s Turn`);
      if (cur.socketId === socket.id) {
        DOM.rollBtn.disabled = false;
        DOM.rollBtn.style.opacity = '1';
      } else {
        DOM.rollBtn.disabled = true;
        DOM.rollBtn.style.opacity = '0.5';
      }
    }
  }
}

function showRankingOverlay() {
  let rowsHtml = finishOrder.map((p, i) => {
    const rank = i + 1;
    return `
      <div class="rank-row rank-pos-${rank}">
        <span class="rank-medal">${getMedal(rank)}</span>
        <div class="rank-avatar" style="background:${p.color};">${p.label}</div>
        <span class="rank-name">${p.name}</span>
        <span class="rank-place">${rank}${getRankSuffix(rank)} place</span>
      </div>`;
  }).join('');

  DOM.rankingRows.innerHTML = rowsHtml;
  DOM.rankingOverlay.style.display = 'flex';
}

function hideRankingOverlay() {
  DOM.rankingOverlay.style.display = 'none';
}
showSetup();