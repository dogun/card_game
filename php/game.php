<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/room_repo.php';

class GameService {
  public function __construct(private PDO $pdo, private RoomRepository $rooms) {}

  // 启动对局：两人就位且都选了卡组，构建三个牌堆并设置先手为房主
  public function startGame(string $roomId, int $byUserId): array {
    $r = $this->rooms->getRoom($roomId);
    if (!$r) throw new InvalidArgumentException('Room not found');
    if ($r['status'] !== 'waiting') throw new InvalidArgumentException('Room already started');
    if ((int)$r['host_user_id'] !== $byUserId) throw new InvalidArgumentException('Only host can start');
    if (empty($r['guest_user_id'])) throw new InvalidArgumentException('Waiting for opponent');
    if (empty($r['host_deck_id']) || empty($r['guest_deck_id'])) throw new InvalidArgumentException('Both players must set deck');

    // 构建玩家牌堆
    $p1Deck = $this->expandDeckToPile($r['host_deck_id']);
    $p2Deck = $this->expandDeckToPile($r['guest_deck_id']);
    $this->shuffle($p1Deck);
    $this->shuffle($p2Deck);

    $factory = $this->loadFactoryPile();
    $this->shuffle($factory);

    $cur = $this->rooms->getState($roomId);
    $state = $cur['state'];
    $state['status'] = 'active';
    $state['turn'] = 'p1';
    $state['phase'] = 'draw_choice';
    $state['piles'] = ['p1' => $p1Deck, 'p2' => $p2Deck, 'factory' => $factory];
    $state['hands'] = ['p1' => [], 'p2' => []];
    $state['support'] = ['p1' => [], 'p2' => []];
    $state['frontline'] = ['p1' => [], 'p2' => []];
    // 初始指挥/生产点（可按需调整）
    $state['players']['p1']['command'] = ['total'=>0,'remain'=>0];
    $state['players']['p1']['produce'] = ['total'=>0,'remain'=>0];
    $state['players']['p2']['command'] = ['total'=>0,'remain'=>0];
    $state['players']['p2']['produce'] = ['total'=>0,'remain'=>0];
    $state['last_action'] = ['type' => 'start', 'by' => 'p1'];

    $this->rooms->upsertState($roomId, $cur['version'] + 1, $state);
    $this->rooms->setRoomStatus($roomId, 'active');
    return ['version' => $cur['version'] + 1, 'state' => $state];
  }

  // 回合开始：当前玩家选择牌堆抽1张（player/self 或 factory）
  public function chooseDrawPile(string $roomId, int $userId, string $pile, int $clientVersion): array {
    $seat = $this->seatOf($roomId, $userId);
    $cur = $this->rooms->getState($roomId);
    if ($clientVersion !== $cur['version']) throw new InvalidArgumentException('Version conflict, refresh state');
    $s = &$cur['state'];
    $this->ensureActiveTurn($s, $seat, 'draw_choice');
    if (!in_array($pile, ['player','factory'], true)) throw new InvalidArgumentException('Invalid pile');

    $hand = &$s['hands'][$seat];
    if (count($hand) >= 9) throw new InvalidArgumentException('Hand is full');

    if ($pile === 'player') {
      $cardId = array_shift($s['piles'][$seat]);
    } else {
      $cardId = array_shift($s['piles']['factory']);
    }
    if (!$cardId) throw new InvalidArgumentException('Pile is empty');
    $hand[] = $cardId;

    $s['phase'] = 'main';
    $s['last_action'] = ['type' => 'draw', 'from' => $pile, 'by' => $seat, 'card' => $cardId];
    $this->rooms->upsertState($roomId, $cur['version'] + 1, $s);
    return ['version' => $cur['version'] + 1, 'state' => $s];
  }

  // 从手牌出到支援线
  public function playToSupport(string $roomId, int $userId, int $handIndex, int $clientVersion): array {
    $seat = $this->seatOf($roomId, $userId);
    $cur = $this->rooms->getState($roomId);
    if ($clientVersion !== $cur['version']) throw new InvalidArgumentException('Version conflict');
    $s = &$cur['state'];
    $this->ensureActiveTurn($s, $seat, 'main');

    $hand = &$s['hands'][$seat];
    if (!isset($hand[$handIndex])) throw new InvalidArgumentException('Invalid hand index');
    $cardId = $hand[$handIndex];
    array_splice($hand, $handIndex, 1);
    $s['support'][$seat][] = $cardId;

    $s['last_action'] = ['type' => 'play_support', 'by' => $seat, 'card' => $cardId];
    $this->rooms->upsertState($roomId, $cur['version'] + 1, $s);
    return ['version' => $cur['version'] + 1, 'state' => $s];
  }

  // 从支援线推进到前线
  public function supportToFront(string $roomId, int $userId, int $supportIndex, int $clientVersion): array {
    $seat = $this->seatOf($roomId, $userId);
    $cur = $this->rooms->getState($roomId);
    if ($clientVersion !== $cur['version']) throw new InvalidArgumentException('Version conflict');
    $s = &$cur['state'];
    $this->ensureActiveTurn($s, $seat, 'main');

    $sup = &$s['support'][$seat];
    if (!isset($sup[$supportIndex])) throw new InvalidArgumentException('Invalid support index');
    $cardId = $sup[$supportIndex];
    array_splice($sup, $supportIndex, 1);
    $s['frontline'][$seat][] = $cardId;

    $s['last_action'] = ['type' => 'move_front', 'by' => $seat, 'card' => $cardId];
    $this->rooms->upsertState($roomId, $cur['version'] + 1, $s);
    return ['version' => $cur['version'] + 1, 'state' => $s];
  }

  // 发起攻击（占位：只记录动作，不做数值结算）
  public function attack(string $roomId, int $userId, string $from, int $index, string $targetFrom, int $targetIndex, int $clientVersion): array {
    $seat = $this->seatOf($roomId, $userId);
    $cur = $this->rooms->getState($roomId);
    if ($clientVersion !== $cur['version']) throw new InvalidArgumentException('Version conflict');
    $s = &$cur['state'];
    $this->ensureActiveTurn($s, $seat, 'main');

    $zones = ['support','frontline'];
    if (!in_array($from, $zones, true) || !in_array($targetFrom, $zones, true)) {
      throw new InvalidArgumentException('Invalid zone');
    }
    $mine = $s[$from][$seat] ?? [];
    $oppSeat = ($seat === 'p1') ? 'p2' : 'p1';
    $opp = $s[$targetFrom][$oppSeat] ?? [];
    if (!isset($mine[$index])) throw new InvalidArgumentException('Invalid attacker');
    if (!isset($opp[$targetIndex])) throw new InvalidArgumentException('Invalid target');

    $s['last_action'] = [
      'type' => 'attack',
      'by' => $seat,
      'from' => $from, 'index' => $index,
      'to_from' => $targetFrom, 'to_index' => $targetIndex
    ];
    $this->rooms->upsertState($roomId, $cur['version'] + 1, $s);
    return ['version' => $cur['version'] + 1, 'state' => $s];
  }

  // 结束回合：切换玩家并进入抽牌选择阶段
  public function endTurn(string $roomId, int $userId, int $clientVersion): array {
    $seat = $this->seatOf($roomId, $userId);
    $cur = $this->rooms->getState($roomId);
    if ($clientVersion !== $cur['version']) throw new InvalidArgumentException('Version conflict');
    $s = &$cur['state'];
    $this->ensureActiveTurn($s, $seat, null); // 任意子阶段可结束

    $s['turn'] = ($seat === 'p1') ? 'p2' : 'p1';
    $s['phase'] = 'draw_choice';
    $s['last_action'] = ['type' => 'end_turn', 'by' => $seat];

    $this->rooms->upsertState($roomId, $cur['version'] + 1, $s);
    return ['version' => $cur['version'] + 1, 'state' => $s];
  }

  private function seatOf(string $roomId, int $userId): string {
    $r = $this->rooms->getRoom($roomId);
    if (!$r) throw new InvalidArgumentException('Room not found');
    if ((int)$r['host_user_id'] === $userId) return 'p1';
    if ((int)$r['guest_user_id'] === $userId) return 'p2';
    throw new InvalidArgumentException('User not in room');
  }

  private function ensureActiveTurn(array $state, string $seat, ?string $phase): void {
    if (($state['status'] ?? '') !== 'active') throw new InvalidArgumentException('Game not active');
    if (($state['turn'] ?? '') !== $seat) throw new InvalidArgumentException('Not your turn');
    if ($phase !== null && ($state['phase'] ?? '') !== $phase) throw new InvalidArgumentException('Invalid phase');
  }

  private function expandDeckToPile(string $deckId): array {
    $q = $this->pdo->prepare('SELECT card_def_id, card_count FROM deck_cards WHERE deck_id = ?');
    $q->execute([$deckId]);
    $pile = [];
    foreach ($q->fetchAll() as $row) {
      $count = max(0, (int)$row['card_count']);
      for ($i=0; $i<$count; $i++) $pile[] = (string)$row['card_def_id'];
    }
    return $pile;
  }

  private function loadFactoryPile(): array {
    $sql = "SELECT id FROM card_defs WHERE id='Factory'";
    $rows = $this->pdo->query($sql)->fetchAll();
	$fp = [];
	foreach ($rows as $row) {
      $count = 20;
      for ($i=0; $i<$count; $i++) $fp[] = (string)$row['id'];
    }
    return $fp;
  }

  private function shuffle(array &$arr): void {
    for ($i = count($arr) - 1; $i > 0; $i--) {
      $j = random_int(0, $i);
      [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
    }
  }
}