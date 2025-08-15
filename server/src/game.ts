import { randomUUID as uuid } from "node:crypto";

// ===== Types =====
export type Card = {
  id: string;
  name: string;
  description?: string;
  type: "minion";
  summonCost: number; // 消耗召唤水晶 SC
  attackCost: number; // 每次攻击消耗攻击水晶 AC
  attack: number;
  health: number;
};

export type MinionInstance = {
  instanceId: string;
  cardId: string;
  name: string;
  attack: number;
  health: number;
  maxHealth: number;
  canAttack: boolean;
  mobilization: boolean;
};

export type PlayerPublic = {
  id: string;
  name: string;
  heroHealth: number;
  board: MinionInstance[];
  deckCount: number;
  handCount: number;
  sc: number;
  scCap: number;
  ac: number;
  acCap: number;
};

export type PlayerState = PlayerPublic & {
  hand: string[]; // cardIds
  deck: string[];
};

export type GameState = {
  roomId: string;
  started: boolean;
  currentPlayerId: string | null;
  players: Record<string, PlayerState>;
  playerOrder: string[];
  winnerId: string | null;
};

export type ClientMessage =
  | { type: "create_room"; name: string }
  | { type: "join_room"; roomId: string; name: string }
  | { type: "start_game" }
  | { type: "play_card"; handIndex: number }
  | { type: "attack"; attackerId: string; target: { type: "minion" | "hero"; id?: string } }
  | { type: "end_turn" };

export type ServerMessage =
  | { type: "room_joined"; roomId: string; you: string }
  | { type: "game_state"; state: GameState }
  | { type: "error"; message: string };

// ===== Card Library =====
export const CARDS: Card[] = [
  { id: "m1", name: "新兵", type: "minion", summonCost: 1, attackCost: 1, attack: 1, health: 2, description: "便宜的小随从" },
  { id: "m2", name: "士兵", type: "minion", summonCost: 2, attackCost: 1, attack: 2, health: 2 },
  { id: "m3", name: "护卫", type: "minion", summonCost: 3, attackCost: 1, attack: 3, health: 3 },
  { id: "m4", name: "狂战", type: "minion", summonCost: 3, attackCost: 2, attack: 4, health: 2 },
  { id: "m5", name: "巨人", type: "minion", summonCost: 6, attackCost: 2, attack: 6, health: 7 },
  { id: "m6", name: "弓手", type: "minion", summonCost: 2, attackCost: 1, attack: 1, health: 3 },
  { id: "m7", name: "骑士", type: "minion", summonCost: 4, attackCost: 2, attack: 4, health: 4 },
  { id: "m8", name: "守护者", type: "minion", summonCost: 5, attackCost: 2, attack: 5, health: 6 }
];

export function getCardById(id: string): Card {
  const c = CARDS.find(c => c.id === id);
  if (!c) throw new Error(`Card ${id} not found`);
  return c;
}

export function makeDeck(size = 20): string[] {
  // 简单随机生成卡组
  const ids = CARDS.map(c => c.id);
  const deck: string[] = [];
  for (let i = 0; i < size; i++) {
    deck.push(ids[Math.floor(Math.random() * ids.length)]);
  }
  return shuffle(deck);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== Game Engine =====
export class Room {
  roomId: string;
  sockets: Map<string, any>; // playerId -> ws
  state: GameState;

  constructor(roomId: string) {
    this.roomId = roomId;
    this.sockets = new Map();
    this.state = {
      roomId,
      started: false,
      currentPlayerId: null,
      players: {},
      playerOrder: [],
      winnerId: null
    };
  }

  addPlayer(playerId: string, name: string, ws: any) {
    if (Object.keys(this.state.players).length >= 2) {
      throw new Error("房间已满");
    }
    const deck = makeDeck();
    const player: PlayerState = {
      id: playerId,
      name,
      heroHealth: 30,
      board: [],
      deck,
      hand: [],
      deckCount: deck.length,
      handCount: 0,
      sc: 0,
      scCap: 0,
      ac: 0,
      acCap: 0
    };
    this.state.players[playerId] = player;
    this.state.playerOrder.push(playerId);
    this.sockets.set(playerId, ws);
  }

  startGame() {
    if (this.state.started) return;
    if (this.state.playerOrder.length !== 2) throw new Error("需要2名玩家");
    this.state.started = true;
    this.state.winnerId = null;

    // 先手随机
    this.state.playerOrder = shuffle(this.state.playerOrder);
    this.state.currentPlayerId = this.state.playerOrder[0];

    // 起手 3 张
    for (const pid of this.state.playerOrder) {
      for (let i = 0; i < 3; i++) {
        this.drawCard(pid);
      }
    }
    // 让先手开始
    this.startTurn(this.state.currentPlayerId!);
  }

  private drawCard(playerId: string) {
    const p = this.state.players[playerId];
    const cardId = p.deck.shift();
    if (cardId) {
      p.hand.push(cardId);
    } else {
      // 无牌：暂不做疲劳伤害
    }
    p.deckCount = p.deck.length;
    p.handCount = p.hand.length;
  }

  private startTurn(playerId: string) {
    const p = this.state.players[playerId];
    // 资源上限+1并回满
    p.scCap = Math.min(12, p.scCap + 1);
    p.acCap = Math.min(12, p.acCap + 1);
    p.sc = p.scCap;
    p.ac = p.acCap;
    // 抽1
    this.drawCard(playerId);
    // 随从刷新
    for (const m of p.board) {
      if (m.mobilization) {
        m.mobilization = false;
        m.canAttack = true;
      } else {
        m.canAttack = true;
      }
    }
  }

  endTurn(playerId: string) {
    if (this.state.currentPlayerId !== playerId) throw new Error("不在你的回合");
    const order = this.state.playerOrder;
    const idx = order.indexOf(playerId);
    const next = order[(idx + 1) % order.length];
    this.state.currentPlayerId = next;
    this.startTurn(next);
    this.checkWinner();
  }

  playCard(playerId: string, handIndex: number) {
    if (this.state.currentPlayerId !== playerId) throw new Error("不在你的回合");
    const p = this.state.players[playerId];
    if (handIndex < 0 || handIndex >= p.hand.length) throw new Error("无效的手牌索引");
    const cardId = p.hand[handIndex];
    const card = getCardById(cardId);
    if (card.type !== "minion") throw new Error("仅支持随从");
    if (p.sc < card.summonCost) throw new Error("召唤水晶不足");
    p.sc -= card.summonCost;
    // 召唤
    const minion: MinionInstance = {
      instanceId: uuid(),
      cardId: card.id,
      name: card.name,
      attack: card.attack,
      health: card.health,
      maxHealth: card.health,
      canAttack: false,
      mobilization: true
    };
    p.board.push(minion);
    // 移除手牌
    p.hand.splice(handIndex, 1);
    p.handCount = p.hand.length;
  }

  attack(playerId: string, attackerId: string, target: { type: "minion" | "hero"; id?: string }) {
    if (this.state.currentPlayerId !== playerId) throw new Error("不在你的回合");
    const me = this.state.players[playerId];
    const oppId = this.getOpponentId(playerId);
    const opp = this.state.players[oppId];

    const attacker = me.board.find(m => m.instanceId === attackerId);
    if (!attacker) throw new Error("找不到攻击随从");
    if (attacker.mobilization) throw new Error("该随从尚在召唤病");
    if (!attacker.canAttack) throw new Error("该随从本回合已攻击");
    const baseCard = getCardById(attacker.cardId);
    if (me.ac < baseCard.attackCost) throw new Error("攻击水晶不足");
    me.ac -= baseCard.attackCost;

    if (target.type === "minion") {
      if (!target.id) throw new Error("缺少目标ID");
      const defender = opp.board.find(m => m.instanceId === target.id);
      if (!defender) throw new Error("目标随从不存在");
      // 同步伤害交换
      defender.health -= attacker.attack;
      attacker.health -= defender.attack;
      // 清理死亡
      opp.board = opp.board.filter(m => m.health > 0);
      me.board = me.board.filter(m => m.health > 0);
    } else {
      // 攻击英雄
      opp.heroHealth -= attacker.attack;
    }

    // 攻击后不可再次攻击
    const stillThere = me.board.find(m => m.instanceId === attackerId);
    if (stillThere) stillThere.canAttack = false;

    this.checkWinner();
  }

  private getOpponentId(playerId: string): string {
    return this.state.playerOrder.find(id => id !== playerId)!;
  }

  private checkWinner() {
    const [p1, p2] = this.state.playerOrder.map(id => this.state.players[id]);
    if (p1.heroHealth <= 0 && p2.heroHealth <= 0) {
      this.state.winnerId = "draw";
    } else if (p1.heroHealth <= 0) {
      this.state.winnerId = p2.id;
    } else if (p2.heroHealth <= 0) {
      this.state.winnerId = p1.id;
    } else {
      this.state.winnerId = null;
    }
  }

  // 只返回给客户端需要的公开状态（含自己手牌张数，不含对手具体手牌）
  getPublicState(): GameState {
    // 深拷贝并隐藏对手手牌内容
    const clone: GameState = JSON.parse(JSON.stringify(this.state));
    for (const pid of Object.keys(clone.players)) {
      const p = clone.players[pid];
      // 真正传输时，不包含手牌内容，仅保留 handCount
      p.hand = [];
    }
    return clone;
  }
}