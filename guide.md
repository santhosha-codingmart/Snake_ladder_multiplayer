# Snakes and Ladders: Developer Guide

Welcome to the developer documentation for the Multiplayer Snakes and Ladders game. 
This guide focuses on explaining the core program flow, logic, and how the **backend** (`server.js`) interacts with the **client** (`game.js`) to power the multiplayer experience.

---

## 1. High-Level Architecture Overview

The game relies on a **Node.js** server utilizing **Express** for static file serving and **Socket.IO** for real-time, bidirectional communication between the client and server.

- **`server.js` (Backend):** Serves as the authoritative source. It handles Room Management, Lobby state synchronization, turn flow state, and gracefully disconnecting users.
- **`public/game.js` (Frontend):** Manages local rendering on the Canvas, UI logic, dice roll requests (sent to the server via Socket), and local game loop execution like pawns animation based on server-provided dice values.

---

## 2. Program Flow & Socket Architecture

### A. Initialization and Room Creation/Joining
When a player loads the application:
1. `game.js` establishes a connection to the server via `io()`.
2. `server.js` detects the connection and logs the user (`io.on('connection')`).
3. **Room Creation:**
   - A player chooses to host. 
   - `game.js` emits `createRoom` alongside their host name. 
   - `server.js` listens to `createRoom`, creates a random alphanumeric 4-character ID, initializes a room object (with an ID, a list of holding players, and a default `state` of `'waiting'`), assigns the socket to the room, and runs a callback returning the generated room details to the client.
4. **Room Joining:**
   - A player can join by submitting a Room Code.
   - `game.js` emits `joinRoom` with the `roomId` and their name.
   - `server.js` validates that the room exists, has available slots (max 4), and is still in the `'waiting'` state. If valid, the player is pushed into the `room.players` array. A `playerJoined` event is then emitted to all users in that specific room to update their lobby UI.

### B. Starting the Game
Once all players are ready in the lobby:
1. The **Host** clicks "Start Game" (`startMultiplayerGame()` in `game.js`).
2. `game.js` emits the `startGame` event with its `roomId`.
3. `server.js` catches `startGame`, sets the room `state` to `'playing'`, transforms the player list to append game fields (`id`, `pos: 0`, `finished: false`), sets `room.currentPlayer = 0`, and emits `gameStarted` back to the room.
4. `game.js` captures `gameStarted`, hides the overlay setups, populates the player state variable, displays the board canvas, and gives control to the first player.

### C. Game Loop and Turn Mechanics
1. **Requesting a Roll:**
   - The UI Roll button activates only for the user matching the active turn (`currentPlayer`).
   - When clicked, `game.js` emits `requestRoll(roomId)`.
2. **Server-Side Verification and Calculating Roll:**
   - `server.js` captures `requestRoll`, extracts the room, verifies the game is in the `'playing'` state, and critically, **validates that the socket requesting the roll matches the expected active player**.
   - The server safely generates the random dice roll: `Math.floor(Math.random() * 6) + 1`.
   - If the player rolls a 6, they keep the turn (`nextPlayerIndex = room.currentPlayer`).
   - Otherwise, the server iterates forward to the next available (unfinished or unexited) player.
   - Finally, the server broadcasts `diceOutcome` (containing the roller, the randomized roll, and the next player's index) to all clients in the room.
3. **Client-Side Animation & Play Execution:**
   - `game.js` receives `diceOutcome`, updates the die face UI visually, and sets up `movePlayer()`.
   - `movePlayer()` loops the position up sequentially as an animation and checks if the destination lands on a default Snake (`SNAKES`) or Ladder (`LADDERS`). If they do, the position adjusts accordingly.
   - After the animation finishes, and if the player lands accurately on square 100, `game.js` signals the backend (`socket.emit('playerFinished')`) so the server skips the particular player on subsequent turns.
   - Lastly, `game.js` calls `finalizeTurn()` which updates the "turn box" UI and re-evaluates whose button should be enabled.

### D. Finding a Winner & End Game
- Once a player reaches square 100, `checkWinAndFinalize()` is executed; handling rank assigning logic.
- When the game has reduced to only one un-finished player remaining, the frontend finalizes it entirely, locking interaction and displaying the final leaderboard modal (`showRankingOverlay()`).

### E. Handling Disconnections
Multiplayer environments require robust exit handling. In `server.js` (`socket.on('disconnect')`):
- The server loops through active `rooms` attempting to find if the disconnecting `socket.id` exists in any room instance.
- **If the room is `'waiting'` (Lobby):** The disconnected user is removed from `room.players`. If they were solitary, the room wipes from memory natively. Otherwise, the server informs the group via `lobbyPlayerLeft` (to show an alert) and triggers an update.
- **If the room is `'playing'` (In-Game):** The user's array entry toggles `finished: true`. In the condition that it was exactly their active turn, the server executes the turn skip loop (`do...while`). Lastly, an explicit `playerLeft` emit directs client `game.js` scripts to stamp them with `❌ Exited` and disregard them.

---

## 3. Core Data Structures (`server.js`)

**`rooms` Memory Map:**
A fast-dictionary managing states for concurrent multiplayers, structured by custom Room ID string keys:
```javascript
{
  "ABCD": {
     id: "ABCD",
     state: "playing",       // 'waiting' or 'playing'
     currentPlayer: 1,       // Integer pointer to the index in the `players` array
     players: [
       {
         socketId: "bYg71t...", 
         id: 1, 
         name: "Host Name",
         pos: 34,
         finished: false
       },
       // ... other array entries
     ]
  }
}
```

## Summary for Developers

1. **Security via Server Authorization:** Because the random dice variable is strictly generated via `server.js` inside `socket.on('requestRoll')`, clients physically cannot hack custom values (like repeatedly telling the game they rolled a 6). Furthermore, the backend cross-references the matching player ID; preventing impersonation roll requests.
2. **Minimal Data Payload Strategy:** The backend intentionally skips sending board coordinates via WebSockets every single time a piece walks. Instead, it streams only the `roll value`, relying upon `game.js` deterministic algorithms mapping identical paths visually. This drastically minimizes WebSocket pipeline congestion.
