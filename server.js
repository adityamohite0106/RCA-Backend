import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';

const app = express();
app.use(cors());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// In-memory storage
const waitingUsers = [];
const activeRooms = new Map();
const userConnections = new Map();

function findMatch() {
  if (waitingUsers.length >= 2) {
    const user1 = waitingUsers.shift();
    const user2 = waitingUsers.shift();
    
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    activeRooms.set(user1, { roomId, partner: user2 });
    activeRooms.set(user2, { roomId, partner: user1 });
    
    const ws1 = userConnections.get(user1);
    const ws2 = userConnections.get(user2);
    
    if (ws1) ws1.send(JSON.stringify({ type: 'matched', roomId }));
    if (ws2) ws2.send(JSON.stringify({ type: 'matched', roomId }));
    
    console.log(`Matched ${user1} with ${user2} in ${roomId}`);
  }
}

function removeFromWaiting(userId) {
  const index = waitingUsers.indexOf(userId);
  if (index > -1) {
    waitingUsers.splice(index, 1);
  }
}

function disconnectUser(userId) {
  const room = activeRooms.get(userId);
  
  if (room) {
    const partnerWs = userConnections.get(room.partner);
    if (partnerWs) {
      partnerWs.send(JSON.stringify({ type: 'partner_disconnected' }));
    }
    
    activeRooms.delete(userId);
    activeRooms.delete(room.partner);
  }
  
  removeFromWaiting(userId);
  userConnections.delete(userId);
  
  console.log(`User ${userId} disconnected`);
}

wss.on('connection', (ws) => {
  let currentUserId = null;
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'join':
          currentUserId = message.userId;
          userConnections.set(currentUserId, ws);
          
          if (!waitingUsers.includes(currentUserId)) {
            waitingUsers.push(currentUserId);
            ws.send(JSON.stringify({ type: 'waiting' }));
            console.log(`User ${currentUserId} joined, waiting for match`);
          }
          
          findMatch();
          break;
          
        case 'message':
          const room = activeRooms.get(currentUserId);
          if (room) {
            const partnerWs = userConnections.get(room.partner);
            if (partnerWs) {
              partnerWs.send(JSON.stringify({
                type: 'message',
                message: message.message
              }));
            }
          }
          break;
          
        case 'typing':
          const typingRoom = activeRooms.get(currentUserId);
          if (typingRoom) {
            const partnerWs = userConnections.get(typingRoom.partner);
            if (partnerWs) {
              partnerWs.send(JSON.stringify({ type: 'typing' }));
            }
          }
          break;
          
        case 'next':
          disconnectUser(currentUserId);
          
          if (!waitingUsers.includes(currentUserId)) {
            waitingUsers.push(currentUserId);
            ws.send(JSON.stringify({ type: 'waiting' }));
          }
          
          findMatch();
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  ws.on('close', () => {
    if (currentUserId) {
      disconnectUser(currentUserId);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server ready on ws://localhost:${PORT}`);
});