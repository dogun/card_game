<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/room_repo.php';
require_once __DIR__ . '/decks_repo.php';

class GameService {
  public function __construct(private PDO $pdo, private RoomRepository $rooms, private DeckRepository $decks) {}

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

    $p1Factory = $this->loadFactoryPile($r['host_deck_id']);

    $this->shuffle($p1Factory);

    $p2Factory = $this->loadFactoryPile($r['guest_deck_id']);
    $this->shuffle($p2Factory);

	$p1Headquarters = $this->loadHeadquarters($r['host_deck_id']);
	$p2Headquarters = $this->loadHeadquarters($r['guest_deck_id']);

    $cur = $this->rooms->getState($roomId);
    $state = $cur['state'];
    $state['status'] = 'active';
	$state['round'] = 1;
    $state['turn'] = 'p1';
    $state['phase'] = 'draw_choice';
    $state['piles'] = ['p1' => $p1Deck, 'p2' => $p2Deck];
	$state['factory'] = ['p1' => $p1Factory, 'p2' => $p2Factory];
    $state['hands'] = ['p1' => [], 'p2' => []];
    $state['support'] = ['p1' => [], 'p2' => []];
	$state['headquarters'] = ['p1' => $p1Headquarters, 'p2' => $p2Headquarters];
    $state['frontline'] = ['p1' => [], 'p2' => []];
    // 初始指挥/生产点（可按需调整）
    $state['players']['p1']['command'] = ['total'=>1,'remain'=>1];
    $state['players']['p1']['produce'] = ['total'=>2,'remain'=>2];
    $state['players']['p2']['command'] = ['total'=>0,'remain'=>0];
    $state['players']['p2']['produce'] = ['total'=>2,'remain'=>2];
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
    if (count($hand) >= 9) {
		$s['phase'] = 'main';
		$s['last_action'] = ['type' => 'draw', 'from' => $pile, 'by' => $seat, 'card' => ''];
		$this->rooms->upsertState($roomId, $cur['version'] + 1, $s);
		throw new InvalidArgumentException('Hand is full');
	}

    if ($pile === 'player') {
      $card = array_shift($s['piles'][$seat]);
    } else {
      $card = array_shift($s['factory'][$seat]);
    }
    if (!$card) throw new InvalidArgumentException('Pile is empty');
    $hand[] = $card;

    $s['phase'] = 'main';
    $s['last_action'] = ['type' => 'draw', 'from' => $pile, 'by' => $seat, 'card' => $card];
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
    $card = &$hand[$handIndex];
	$card['move_round'] = $s['round'];
	
	//计算点数
	//file_put_contents('test.log', var_export($cur, true));
	$cp = $s['players'][$seat]['command']['remain'];
	if ($cp < $card['deploy_cost']) {
		throw new InvalidArgumentException('command point error: '.$cp.' '.$card['deploy_cost']);
	}
	
    array_splice($hand, $handIndex, 1);
    $s['support'][$seat][] = $card;

	$s['players'][$seat]['command']['remain'] -= $card['deploy_cost'];
    $s['last_action'] = ['type' => 'play_support', 'by' => $seat, 'card' => $card];
    $this->rooms->upsertState($roomId, $cur['version'] + 1, $s);
	//print_r($s);
    return ['version' => $cur['version'] + 1, 'state' => $s];
  }

  // 从支援线推进到前线
  public function supportToFront(string $roomId, int $userId, int $supportIndex, int $clientVersion): array {
    $seat = $this->seatOf($roomId, $userId);
	$oppSeat = ($seat === 'p1') ? 'p2' : 'p1';
    $cur = $this->rooms->getState($roomId);
    if ($clientVersion !== $cur['version']) throw new InvalidArgumentException('Version conflict');
    $s = &$cur['state'];
    $this->ensureActiveTurn($s, $seat, 'main');

    $sup = &$s['support'][$seat];
    if (!isset($sup[$supportIndex])) throw new InvalidArgumentException('Invalid support index');
    $card = &$sup[$supportIndex];
	
	//判断前线所属
	if (@$s['frontline'][$oppSeat]) {
		throw new InvalidArgumentException('frontline not yours!');
	}
	
	//本局已经移动或更新过
	if ($card['move_round'] == $s['round']) {
		throw new InvalidArgumentException('本局行动过了');
	}

	//计算点数
	//file_put_contents('test.log', var_export($cur, true));
	$cp = $s['players'][$seat]['command']['remain'];
	if ($cp < $card['action_cost']) {
		throw new InvalidArgumentException('command point error: '.$cp.' '.$card['deploy_cost']);
	}
	
	$card['move_round'] = $s['round'];

    array_splice($sup, $supportIndex, 1);
    $s['frontline'][$seat][] = $card;

	$s['players'][$seat]['command']['remain'] -= $card['action_cost'];
	
    $s['last_action'] = ['type' => 'move_front', 'by' => $seat, 'card' => $card];
    $this->rooms->upsertState($roomId, $cur['version'] + 1, $s);
    return ['version' => $cur['version'] + 1, 'state' => $s];
  }

  // 发起攻击
  public function attack(string $roomId, int $userId, string $from, int $index, string $targetFrom, int $targetIndex, int $clientVersion): array {
    $seat = $this->seatOf($roomId, $userId);
	$oppSeat = ($seat === 'p1') ? 'p2' : 'p1';
    $cur = $this->rooms->getState($roomId);
    if ($clientVersion !== $cur['version']) throw new InvalidArgumentException('Version conflict');
    $s = &$cur['state'];
    $this->ensureActiveTurn($s, $seat, 'main');

    $zones = ['support','frontline'];
    if (!in_array($from, $zones, true) || !in_array($targetFrom, $zones, true)) {
      throw new InvalidArgumentException('Invalid zone');
    }

	$mine = &$s[$from][$seat] ?? [];
	$opp = &$s[$targetFrom][$oppSeat] ?? [];
   
    $target = null;
	$target_hq = false;
	if ($from == 'frontline') { //计算target
		$opp_len = count($opp);
		if ($opp_len == 0 || $targetIndex == intval(($opp_len + 1) / 2)) { //是总部
			$target = &$s['headquarters'][$oppSeat];
			$target_hq = true;
		} else {
			if ($targetIndex > intval(($opp_len + 1) / 2)) {
				$targetIndex -= 1;
			}
			$target = &$opp[$targetIndex];
		}
	} else {
		$target = &$opp[$targetIndex];
	}
   
    if (!isset($mine[$index])) throw new InvalidArgumentException('Invalid attacker');
    if (!isset($target)) throw new InvalidArgumentException('Invalid target');
	
	//计算点数
	$cp = $s['players'][$seat]['command']['remain'];
	if ($cp < $mine[$index]['action_cost']) {
		throw new InvalidArgumentException('command point error: '.$cp.' '.$mine[$index]['action_cost']);
	}
	
	//本局已经移动或更新过
	if ($mine[$index]['move_round'] == $s['round']) {
		throw new InvalidArgumentException('本局行动过了');
	}

	$attack_point = $mine[$index]['attack'];
	$e_attack_point = $target['attack'];
	
	$health_point = $mine[$index]['health'];
	$health_point_new = $health_point - $e_attack_point;
	$e_health_point = $target['health'];
	$e_health_point_new = $e_health_point - $attack_point;
	
	$s['players'][$seat]['command']['remain'] -= $mine[$index]['action_cost'];
	
	if ($e_health_point_new > 0) $target['health'] = $e_health_point - $attack_point;
	else {
		if ($target_hq) { //你赢了
			//TODO
		}else {
			array_splice($s[$targetFrom][$oppSeat], $targetIndex, 1);
		}
	}
	
	if ($health_point_new > 0) $mine[$index]['health'] = $health_point_new;
	else array_splice($mine, $index, 1);
	
	$mine[$index]['move_round'] += 1;
	
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
	
	$s['round'] += 1;

    $s['turn'] = ($seat === 'p1') ? 'p2' : 'p1';
	$s['players'][$s['turn']]['command']['total'] += 1;
	$s['players'][$s['turn']]['command']['remain'] = $s['players'][$s['turn']]['command']['total'];
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
    if ($phase !== null && ($state['phase'] ?? '') !== $phase) throw new InvalidArgumentException('Invalid phase:'.$phase.', '.$state['phase']);
  }

  private function expandDeckToPile(string $deckId): array {
    $q = $this->pdo->prepare('SELECT d.card_def_id, d.card_count, c.attack, c.health, c.card_types, c.country_code as country, c.card_effects, c.deploy_cost, c.action_cost FROM deck_cards d, card_defs c WHERE d.card_def_id = c.id and d.country = c.country_code and d.deck_id = ?');
    $q->execute([$deckId]);
    $pile = [];
    foreach ($q->fetchAll() as $row) {
      $count = max(0, (int)$row['card_count']);
      for ($i=0; $i<$count; $i++) $pile[] = $row;
    }
    return $pile;
  }

  private function loadFactoryPile(string $deckId): array {
	$deck = $this->decks->getDeck($deckId);
    $sql = "SELECT id as card_def_id, attack, health, card_types, card_effects, deploy_cost, action_cost, country_code as country FROM card_defs WHERE id='Factory' and country_code=?";
	$q = $this->pdo->prepare($sql);
	$q->execute([$deck['country']]);
    $rows = $q->fetchAll();
	$fp = [];
	$num = max(count($rows), 1);
	$count = 20 / $num;
	foreach ($rows as $row) {
      for ($i=0; $i<$count; $i++) $fp[] = $row;
    }
    return $fp;
  }

  private function loadHeadquarters(string $deckId): array {
    $deck = $this->decks->getDeck($deckId);
    $sql = "SELECT id as card_def_id, attack, health, card_types, card_effects, deploy_cost, action_cost, country_code as country FROM card_defs WHERE id=? and country_code=?";
	$q = $this->pdo->prepare($sql);
	$q->execute([$deck['headquarters'], $deck['country']]);
	$rows = $q->fetchAll();
    return $rows[0];
  }

  private function shuffle(array &$arr): void {
    for ($i = count($arr) - 1; $i > 0; $i--) {
      $j = random_int(0, $i);
      [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
    }
  }
}