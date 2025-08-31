const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const ACTIONS = require('./src/Actions');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    maxHttpBufferSize: 1e8,
});

// Basic health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'CodeSync Backend is running' });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'CodeSync Backend API',
        endpoints: {
            health: '/health',
            websocket: 'WebSocket connection available'
        }
    });
});

const userSocketMap = {};
const roomConnections = new Map(); // Track room connections

function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

function cleanupUser(socketId) {
    if (userSocketMap[socketId]) {
        const username = userSocketMap[socketId];
        console.log(`User ${username} (${socketId}) disconnected`);
        delete userSocketMap[socketId];
    }
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    // Send heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        socket.emit('ping');
    }, 30000);

    socket.on('pong', () => {
        // Client responded to heartbeat
        socket.lastPong = Date.now();
    });

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        try {
            userSocketMap[socket.id] = username;
            socket.join(roomId);
            
            // Track room connection
            if (!roomConnections.has(roomId)) {
                roomConnections.set(roomId, new Set());
            }
            roomConnections.get(roomId).add(socket.id);
            
            const clients = getAllConnectedClients(roomId);
            clients.forEach(({ socketId }) => {
                io.to(socketId).emit(ACTIONS.JOINED, {
                    clients,
                    username,
                    socketId: socket.id,
                });
            });
            
            console.log(`User ${username} joined room ${roomId}`);
        } catch (error) {
            console.error('Error in JOIN event:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        try {
            socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
        } catch (error) {
            console.error('Error in CODE_CHANGE event:', error);
        }
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        try {
            io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
        } catch (error) {
            console.error('Error in SYNC_CODE event:', error);
        }
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            if (roomId !== socket.id) { // socket.id is always in rooms
                socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                    socketId: socket.id,
                    username: userSocketMap[socket.id],
                });
                
                // Clean up room tracking
                if (roomConnections.has(roomId)) {
                    roomConnections.get(roomId).delete(socket.id);
                    if (roomConnections.get(roomId).size === 0) {
                        roomConnections.delete(roomId);
                    }
                }
            }
        });
        cleanupUser(socket.id);
        clearInterval(heartbeat);
    });

    socket.on('disconnect', (reason) => {
        console.log(`Socket ${socket.id} disconnected: ${reason}`);
        cleanupUser(socket.id);
        clearInterval(heartbeat);
    });

    socket.on('error', (error) => {
        console.error(`Socket ${socket.id} error:`, error);
    });
});

// Cleanup function to remove stale connections
setInterval(() => {
    const now = Date.now();
    io.sockets.sockets.forEach((socket) => {
        if (socket.lastPong && (now - socket.lastPong) > 90000) {
            console.log(`Force disconnecting stale socket ${socket.id}`);
            socket.disconnect(true);
        }
    });
}, 60000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
