import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID as uuid } from "node:crypto";
import { Room, type ClientMessage, type ServerMessage } from "./game.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8888;

const app = express();
app.get("/", (_req, res) => res.send("CardGame WS Server running"));
const server = app.listen(PORT, () => {
  console.log(`HTTP listening on http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

type ConnCtx = {
  ws: WebSocket;
  playerId: string;
  roomId?: string;
  name?: string;
};

const rooms = new Map<string, Room>();
const conns = new Map<WebSocket, ConnCtx>();

function send(ws: WebSocket, msg: ServerMessage) {
  ws.send(JSON.stringify(msg));
}

function broadcastRoom(room: Room) {
  const state = room.getPublicState();
  for (const [pid, ws] of room.sockets.entries()) {
    send(ws, { type: "game_state", state });
  }
}

wss.on("connection", (ws) => {
  const ctx: ConnCtx = { ws, playerId: uuid() };
  conns.set(ws, ctx);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;
      handleMessage(ctx, msg);
    } catch (err: any) {
      send(ws, { type: "error", message: err.message ?? "Invalid message" });
    }
  });

  ws.on("close", () => {
    const { roomId, playerId } = ctx;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId)!;
      room.sockets.delete(playerId);
      // 简化处理：不做房间回收/判负，仍保留房间
    }
    conns.delete(ws);
  });
});

function handleMessage(ctx: ConnCtx, msg: ClientMessage) {
  switch (msg.type) {
    case "create_room": {
      const roomId = shortId();
      const room = new Room(roomId);
      rooms.set(roomId, room);
      room.addPlayer(ctx.playerId, msg.name, ctx.ws);
      ctx.roomId = roomId;
      ctx.name = msg.name;
      send(ctx.ws, { type: "room_joined", roomId, you: ctx.playerId });
      broadcastRoom(room);
      break;
    }
    case "join_room": {
      const room = rooms.get(msg.roomId);
      if (!room) throw new Error("房间不存在");
      room.addPlayer(ctx.playerId, msg.name, ctx.ws);
      ctx.roomId = msg.roomId;
      ctx.name = msg.name;
      send(ctx.ws, { type: "room_joined", roomId: msg.roomId, you: ctx.playerId });
      broadcastRoom(room);
      break;
    }
    case "start_game": {
      const room = getRoomOrThrow(ctx);
      room.startGame();
      broadcastRoom(room);
      break;
    }
    case "play_card": {
      const room = getRoomOrThrow(ctx);
      room.playCard(ctx.playerId, msg.handIndex);
      broadcastRoom(room);
      break;
    }
    case "attack": {
      const room = getRoomOrThrow(ctx);
      room.attack(ctx.playerId, msg.attackerId, msg.target);
      broadcastRoom(room);
      break;
    }
    case "end_turn": {
      const room = getRoomOrThrow(ctx);
      room.endTurn(ctx.playerId);
      broadcastRoom(room);
      break;
    }
    default:
      throw new Error("未知消息类型");
  }
}

function getRoomOrThrow(ctx: ConnCtx): Room {
  if (!ctx.roomId) throw new Error("尚未加入房间");
  const room = rooms.get(ctx.roomId);
  if (!room) throw new Error("房间不存在");
  return room;
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}
