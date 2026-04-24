const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static('public'));
const rooms = {};

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('createRoom', (playerData, callback) => {
        const roomId = generateRoomCode();

        rooms[roomId] = {
            id: roomId,
            players: [{ id: socket.id, name: playerData.name }],
            state: 'waiting' 
        };

        socket.join(roomId);
        console.log(`[${roomId}] Room created by ${playerData.name}`);

        callback({ success: true, room: rooms[roomId] });
    });

    socket.on('joinRoom', ({ roomId, playerData }, callback) => {
        const room = rooms[roomId];

        if (!room) return callback({ error: "Room not found!" });
        if (room.players.length >= 4) return callback({ error: "Room is full!" });
        if (room.state !== 'waiting') return callback({ error: "Game already started!" });

        room.players.push({ id: socket.id, name: playerData.name });

        socket.join(roomId);
        console.log(`[${roomId}] ${playerData.name} joined`);

        socket.to(roomId).emit('playerJoined', room.players);
        callback({ success: true, room: room });
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        room.state = 'playing';


        room.players = room.players.map((p, index) => {
            return {
                socketId: p.id,
                id: index + 1, 
                name: p.name,
                pos: 0,
                finished: false
            };
        });

        room.currentPlayer = 0;
        console.log(`[${roomId}] Game started with ${room.players.length} players!`);

        io.to(roomId).emit('gameStarted', room.players);
    });


    socket.on('requestRoll', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'playing') return; 
        const activePlayer = room.players[room.currentPlayer];
        if (socket.id !== activePlayer.socketId) return; 
        const roll = Math.floor(Math.random() * 6) + 1;
        let nextPlayerIndex = room.currentPlayer;
        if (roll !== 6) {
            let iterations = 0;
            do {
                nextPlayerIndex = (nextPlayerIndex + 1) % room.players.length;
                iterations++;
            } while (room.players[nextPlayerIndex].finished && iterations < room.players.length);
            room.currentPlayer = nextPlayerIndex;
        }

        io.to(roomId).emit('diceOutcome', {
            rollerSocketId: activePlayer.socketId,
            roll: roll,
            nextPlayerIndex: nextPlayerIndex
        });
    });

    socket.on('playerFinished', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.state !== 'playing') return;

        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
            room.players[playerIndex].finished = true;

            if (room.currentPlayer === playerIndex) {
                let iterations = 0;
                do {
                    room.currentPlayer = (room.currentPlayer + 1) % room.players.length;
                    iterations++;
                } while (room.players[room.currentPlayer].finished && iterations < room.players.length);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);

            if (playerIndex !== -1) {
                if (room.state === 'waiting') {

                    const leaverName = room.players[playerIndex].name;
                    room.players.splice(playerIndex, 1);

                    if (room.players.length === 0) {
                        delete rooms[roomId]; 
                    } else {
                        io.to(roomId).emit('playerJoined', room.players); 
                        socket.to(roomId).emit('lobbyPlayerLeft', leaverName);
                    }
                } else {
                    room.players[playerIndex].finished = true;
                    if (room.currentPlayer === playerIndex) {
                        let iterations = 0;
                        do {
                            room.currentPlayer = (room.currentPlayer + 1) % room.players.length;
                            iterations++;
                        } while (room.players[room.currentPlayer].finished && iterations < room.players.length);
                    }

                    io.to(roomId).emit('playerLeft', socket.id);

                    if (room.players.every(p => p.finished)) {
                        delete rooms[roomId];
                    }
                }
                break; 
            }
        }
    });
});

const PORT = 3000;

server.listen(PORT, () => {
    console.log('Server is running and listening on port ' + PORT);
});
