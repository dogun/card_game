import React, { useEffect, useMemo, useRef, useState } from "react";
import Card from "./components/Card/Card";
import CardArc from "./components/CardArc/CardArc";

type Card = {
  id: string;
  name: string;
  type: "minion";
  summonCost: number;
  attackCost: number;
  attack: number;
  health: number;
  description?: string;
};

type MinionInstance = {
  instanceId: string;
  cardId: string;
  name: string;
  attack: number;
  health: number;
  maxHealth: number;
  canAttack: boolean;
  mobilization: boolean;
};

type PlayerPublic = {
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
  hand: string[]; // server 传输会清空成 []
};

type GameState = {
  roomId: string;
  started: boolean;
  currentPlayerId: string | null;
  players: Record<string, PlayerPublic>;
  playerOrder: string[];
  winnerId: string | null;
};

type ServerMessage =
  | { type: "room_joined"; roomId: string; you: string }
  | { type: "game_state"; state: GameState }
  | { type: "error"; message: string };

type ClientMessage =
  | { type: "create_room"; name: string }
  | { type: "join_room"; roomId: string; name: string }
  | { type: "start_game" }
  | { type: "play_card"; handIndex: number }
  | { type: "attack"; attackerId: string; target: { type: "minion" | "hero"; id?: string } }
  | { type: "end_turn" };

const h_cards = [
  { imageUrl: "pic/sa.png", atk: 2, def: 3 },
  { imageUrl: "pic/sa.png", atk: 3, def: 3 },
  { imageUrl: "pic/sa.png", atk: 3, def: 4 },
  { imageUrl: "pic/sa.png", atk: 4, def: 2 },
  { imageUrl: "pic/sa.png", atk: 5, def: 4 },
  { imageUrl: "pic/sa.png", atk: 4, def: 5 },
  { imageUrl: "pic/sa.png", atk: 6, def: 3 },
  { imageUrl: "pic/sa.png", atk: 1, def: 6 },
  { imageUrl: "pic/sa.png", atk: 2, def: 2 },
];

const t_h_cards = [
  { imageUrl: "pic/back.png", atk: 2, def: 3, back: true },
  { imageUrl: "pic/back.png", atk: 3, def: 3, back: true },
  { imageUrl: "pic/back.png", atk: 3, def: 4, back: true },
  { imageUrl: "pic/back.png", atk: 4, def: 2, back: true },
  { imageUrl: "pic/back.png", atk: 5, def: 4, back: true },
  { imageUrl: "pic/back.png", atk: 4, def: 5, back: true },
  { imageUrl: "pic/back.png", atk: 6, def: 3, back: true },
  { imageUrl: "pic/back.png", atk: 1, def: 6, back: true },
  { imageUrl: "pic/back.png", atk: 2, def: 2, back: true },
];


const CARD_LIBRARY: Record<string, Card> = {
  m1: { id: "m1", name: "新兵", type: "minion", summonCost: 1, attackCost: 1, attack: 1, health: 2 },
  m2: { id: "m2", name: "士兵", type: "minion", summonCost: 2, attackCost: 1, attack: 2, health: 2 },
  m3: { id: "m3", name: "护卫", type: "minion", summonCost: 3, attackCost: 1, attack: 3, health: 3 },
  m4: { id: "m4", name: "狂战", type: "minion", summonCost: 3, attackCost: 2, attack: 4, health: 2 },
  m5: { id: "m5", name: "巨人", type: "minion", summonCost: 6, attackCost: 2, attack: 6, health: 7 },
  m6: { id: "m6", name: "弓手", type: "minion", summonCost: 2, attackCost: 1, attack: 1, health: 3 },
  m7: { id: "m7", name: "骑士", type: "minion", summonCost: 4, attackCost: 2, attack: 4, health: 4 },
  m8: { id: "m8", name: "守护者", type: "minion", summonCost: 5, attackCost: 2, attack: 5, health: 6 }
};

export default function App() {
  const [url, setUrl] = useState<string>("ws://localhost:8888");
  const [name, setName] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [you, setYou] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAttacker, setSelectedAttacker] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    const handler = (e: MouseEvent) => e.preventDefault();
    document.addEventListener("contextmenu", handler);

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as ServerMessage;
      if (msg.type === "room_joined") {
        setYou(msg.you);
        setRoomId(msg.roomId);
      } else if (msg.type === "game_state") {
        setState(msg.state);
        setError(null);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };
    ws.onclose = () => {
      console.log("WS closed");
    };
    return () => {
      ws.close();
      document.removeEventListener("contextmenu", handler);
    };
  }, [url]);

  const send = (m: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(m));
  };

  const me = useMemo(() => (you && state ? state.players[you] : null), [you, state]);
  const opp = useMemo(() => {
    if (!you || !state) return null;
    const oppId = state.playerOrder.find((id) => id !== you);
    return oppId ? state.players[oppId] : null;
  }, [you, state]);

  const isMyTurn = state && state.currentPlayerId === you;

  return (
    <div className="container">
		{!roomId && (
		<div className="header">
		  <h1>战略雄心</h1>
		  <section className="conn">
			<label>
			  服务器WS:
			  <input value={url} onChange={(e) => setUrl(e.target.value)} style={{ width: 280 }} />
			</label>
		  </section>
		  </div>
		)}
		  {!roomId && (
			<section className="lobby">
			  <div>
				<label>
				  昵称:
				  <input value={name} onChange={(e) => setName(e.target.value)} />
				</label>
			  </div>
			  <div className="lobby-actions">
				<button disabled={!name} onClick={() => send({ type: "create_room", name })}>
				  创建房间
				</button>
				  <input placeholder="房间号" value={roomIdInput} onChange={(e) => setRoomIdInput(e.target.value)} />&nbsp;
				  <button disabled={!name || !roomIdInput} onClick={() => send({ type: "join_room", roomId: roomIdInput, name })}>
					加入房间
				  </button>
			  </div>
			  {error && <div className="error">错误: {error}</div>}
			</section>
		  )}
		  {roomId && (
			<section className="room">
			  <div>
				房间号: <b>{roomId}</b> {you && <div>你的ID: {you.slice(0, 6)}</div>}
			  </div>
			  {!state?.started && (
				<div style={{ marginTop: 8 }}>
				  <button onClick={() => send({ type: "start_game" })} disabled={!state || state.playerOrder.length !== 2}>
					开始对局
				  </button>
				</div>
			  )}
			</section>
		  )}
      {state && (
        <section className="game">
          <Board
            me={me}
            opp={opp}
            you={you}
            isMyTurn={!!isMyTurn}
            onPlayCard={(handIndex) => send({ type: "play_card", handIndex })}
            onSelectAttacker={(id) => setSelectedAttacker((prev) => (prev === id ? null : id))}
            selectedAttacker={selectedAttacker}
            onAttackHero={() => {
              if (selectedAttacker) {
                send({ type: "attack", attackerId: selectedAttacker, target: { type: "hero" } });
                setSelectedAttacker(null);
              }
            }}
            onAttackMinion={(targetId) => {
              if (selectedAttacker) {
                send({ type: "attack", attackerId: selectedAttacker, target: { type: "minion", id: targetId } });
                setSelectedAttacker(null);
              }
            }}
            onEndTurn={() => send({ type: "end_turn" })}
            currentPlayerId={state.currentPlayerId}
            winnerId={state.winnerId}
          />
          {error && <div className="error">错误: {error}</div>}
        </section>
      )}
    </div>
  );
}

function Board(props: {
  me: PlayerPublic | null;
  opp: PlayerPublic | null;
  you: string | null;
  isMyTurn: boolean;
  onPlayCard: (handIndex: number) => void;
  onSelectAttacker: (id: string) => void;
  selectedAttacker: string | null;
  onAttackHero: () => void;
  onAttackMinion: (id: string) => void;
  onEndTurn: () => void;
  currentPlayerId: string | null;
  winnerId: string | null;
}) {
  const { me, opp, isMyTurn, onPlayCard, onSelectAttacker, selectedAttacker, onAttackHero, onAttackMinion, onEndTurn, currentPlayerId, winnerId } = props;

  if (!me || !opp) {
    return <div style={{ marginTop: 16 }}>等待另一名玩家加入...</div>;
  }

  const banner = winnerId
    ? winnerId === "draw"
      ? "平局！"
      : winnerId === me.id
      ? "你赢了！"
      : "你输了！"
    : currentPlayerId === me.id
    ? "你的回合"
    : "对手回合";

  return (
    <div className="board">
      <div className="banner">{banner}</div>

      {/* Opponent */}
      <PlayerPanel player={opp} top />
      <div className="hand">
        <CardArc amplitude={60} maxRotate={10} height={200} offsetY={-175} mirror={true}>
          {t_h_cards.map((c, i) => (
            <Card key={i} width={160} {...c} />
          ))}
        </CardArc>
      </div>
      <div className="opponent-board">
        {opp.board.map((m) => (
          <Minion key={m.instanceId} m={m} selectable={!!selectedAttacker} onClick={() => onAttackMinion(m.instanceId)} />
        ))}
      </div>

      {/* Middle controls */}
      <div className="center">
        <div className="hero-row">
          <div className="hero" onClick={() => selectedAttacker && onAttackHero()}>
            <img src="pic/headquarters.png" style={{ width: "100px" }} /> {opp.heroHealth}
          </div>
          <div className="vs">VS</div>
          <div className="hero my-hero"><img src="pic/headquarters.png" style={{ width: "100px" }} /> {me.heroHealth}</div>
        </div>
        <div className="actions">
          <button onClick={onEndTurn} disabled={!isMyTurn || !!winnerId}>
            结束回合
          </button>
        </div>
      </div>

      {/* My board */}
      <div className="my-board">
        {me.board.map((m) => (
          <Minion
            key={m.instanceId}
            m={m}
            selectable={isMyTurn && m.canAttack && !m.mobilization && !winnerId}
            selected={selectedAttacker === m.instanceId}
            onClick={() => onSelectAttacker(m.instanceId)}
          />
        ))}
      </div>

      {/* My hand */}
      <div className="hand">
        <CardArc amplitude={60} maxRotate={10} height={250} offsetY={100}>
          {h_cards.map((c, i) => (
            <Card key={i} width={160} {...c} />
          ))}
        </CardArc>
      </div>
      {/* My panel */}
      <PlayerPanel player={me} />
    </div>
  );
}

function PlayerPanel({ player, top }: { player: PlayerPublic; top?: boolean }) {
  return (
    <div className={`panel ${top ? "top" : ""}`}>
      <div className="row">
        <div className="name">{player.name}</div>
        <div>牌库: {player.deckCount}</div>
        <div>手牌: {player.handCount}</div>
      </div>
      <div className="row">
        <div className="res sc">SC {player.sc}/{player.scCap}</div>
        <div className="res ac">AC {player.ac}/{player.acCap}</div>
      </div>
    </div>
  );
}

function Minion({ m, selectable, selected, onClick }: { m: MinionInstance; selectable?: boolean; selected?: boolean; onClick?: () => void }) {
  const base = CARD_LIBRARY[m.cardId];
  return (
    <div className={`minion ${selectable ? "selectable" : ""} ${selected ? "selected" : ""}`} onClick={selectable ? onClick : undefined} title={base ? `${base.name} | 召唤:${base.summonCost} 攻击耗:${base.attackCost}` : ""}>
      <div className="minion-name">{m.name}</div>
      <div className="minion-stats">
        <span>⚔️ {m.attack}</span>
        <span>❤️ {m.health}/{m.maxHealth}</span>
      </div>
      {m.mobilization && <div className="badge">动员中</div>}
    </div>
  );
}
