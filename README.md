# 双水晶卡牌游戏（类炉石）- Web 联机雏形

特性：
- Web 客户端（React + Vite）
- Node.js WebSocket 服务（ws + express）
- 两种资源：召唤水晶（SC）与攻击水晶（AC）
- 基本对战规则、房间匹配（房主创建房间，另一位加入）
- 最小可玩 UI（出牌、攻击、回合结束）

## 目录结构
- server: WebSocket 后端
- client: React 前端

## 快速开始

1. 安装依赖
```bash
cd server && npm i
cd ../client && npm i
```

2. 启动服务端
```bash
cd server
npm run dev
# 默认 ws://localhost:8080
```

3. 启动前端
```bash
cd ../client
npm run dev
# 打开终端输出的本地地址（一般 http://localhost:5173）
```

4. 测试联机
- 在两个浏览器窗口或两个设备上打开前端
- A 端输入昵称，点击“创建房间”，复制房间号
- B 端输入昵称和房间号，点击“加入房间”
- 房主点击“开始对局”

## 规则概要
- 回合开始：抽1，SC/AC 上限各+1（最多10）并回满
- 出随从：消耗 SC = 卡牌 summonCost，随从带召唤病（当回合不能攻击）
- 攻击：选择己方随从再点目标，消耗 AC = 卡牌 attackCost，该随从本回合不可再次攻击
- 目标可以是对方随从或英雄
- 英雄初始 30 生命
- 手牌上限与疲劳等高级规则暂未实现

## 技术栈
- Server: Node.js, TypeScript, ws, express
- Client: React, TypeScript, Vite, WebSocket

## 开发脚本

- Server
```bash
npm run dev    # ts-node-dev 热启动
npm run build  # tsc 编译
npm start      # 运行编译产物
```

- Client
```bash
npm run dev
npm run build
npm run preview
```

## 协议（简化）
- Client -> Server
  - create_room {name}
  - join_room {roomId, name}
  - start_game {}
  - play_card {handIndex}
  - attack {attackerId, target: {type: "minion"|"hero", id?: string}}
  - end_turn {}

- Server -> Client
  - room_joined {roomId, you}
  - game_state {state}
  - error {message}

## TODO
- 断线重连、观战
- 更丰富的卡牌机制（嘲讽/战吼/亡语/法术等）
- 对战匹配/排行榜
- 服务端持久化与授权