<?php
require_once __DIR__ . '/db.php';

class RoomRepository {
  public function __construct(private PDO $pdo) {}

  private function uuid(): string {
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
  }

  public function createRoom(int $hostUserId, ?string $roomId = null): string {
    $roomId = $roomId ?: $this->uuid();
    $stmt = $this->pdo->prepare('INSERT INTO rooms (id, host_user_id) VALUES (?, ?)');
    $stmt->execute([$roomId, $hostUserId]);
    // 初始化空状态
    $state = [
      'status' => 'waiting',
      'players' => [
        'p1' => ['user_id' => $hostUserId, 'deck_id' => null, 'command' => ['total'=>0,'remain'=>0], 'produce'=>['total'=>0,'remain'=>0]],
        'p2' => ['user_id' => null,        'deck_id' => null, 'command' => ['total'=>0,'remain'=>0], 'produce'=>['total'=>0,'remain'=>0]],
      ],
      'turn' => null,
      'phase' => null,
      'piles' => ['p1'=>[], 'p2'=>[]],
	  'factory'=>['p1'=>[], 'p2'=>[]],
      'hands' => ['p1'=>[], 'p2'=>[]],
      'support' => ['p1'=>[], 'p2'=>[]],
      'frontline' => [],
      'last_action' => null,
    ];
    $this->upsertState($roomId, 0, $state);
    return $roomId;
  }

  public function joinRoom(string $roomId, int $userId): void {
    // 读当前房间
    $r = $this->getRoom($roomId);
    if (!$r) throw new InvalidArgumentException('Room not found');
    if ($r['status'] !== 'waiting') throw new InvalidArgumentException('Room already started');
    if ((int)$r['host_user_id'] === $userId) return; // 已是房主
    if ($r['guest_user_id']) {
      if ((int)$r['guest_user_id'] === $userId) return; // 已是客人
      throw new InvalidArgumentException('Room full');
    }
    $stmt = $this->pdo->prepare('UPDATE rooms SET guest_user_id = ? WHERE id = ?');
    $stmt->execute([$userId, $roomId]);

    // 更新状态中的 p2.user_id
    $cur = $this->getState($roomId);
    $state = $cur['state'];
    $state['players']['p2']['user_id'] = $userId;
    $this->upsertState($roomId, $cur['version'] + 1, $state);
  }

  public function setPlayerDeck(string $roomId, int $userId, string $deckId): void {
    $r = $this->getRoom($roomId);
    if (!$r) throw new InvalidArgumentException('Room not found');
    if ($r['status'] !== 'waiting') throw new InvalidArgumentException('Room already started');

    // 检查 deck 属于该用户
    $q = $this->pdo->prepare('SELECT 1 FROM decks WHERE id=? AND user_id=?');
    $q->execute([$deckId, $userId]);
    if (!$q->fetchColumn()) throw new InvalidArgumentException('Deck not found');

    $isHost = ((int)$r['host_user_id'] === $userId);
    $col = $isHost ? 'host_deck_id' : 'guest_deck_id';
    $stmt = $this->pdo->prepare("UPDATE rooms SET {$col} = ? WHERE id = ?");
    $stmt->execute([$deckId, $roomId]);

    $cur = $this->getState($roomId);
    $state = $cur['state'];
    $seat = $isHost ? 'p1' : 'p2';
    $state['players'][$seat]['deck_id'] = $deckId;
    $this->upsertState($roomId, $cur['version'] + 1, $state);
  }

  public function getRoom(string $roomId): ?array {
    $stmt = $this->pdo->prepare('SELECT * FROM rooms WHERE id = ?');
    $stmt->execute([$roomId]);
    $row = $stmt->fetch();
    return $row ?: null;
  }

  public function getState(string $roomId): array {
    $stmt = $this->pdo->prepare('SELECT version, state_json FROM room_state WHERE room_id = ?');
    $stmt->execute([$roomId]);
    $row = $stmt->fetch();
    if (!$row) throw new InvalidArgumentException('Room state not found');
    return [
      'version' => (int)$row['version'],
      'state' => json_decode($row['state_json'], true, 1024, JSON_THROW_ON_ERROR),
    ];
  }

  public function upsertState(string $roomId, int $version, array $state): void {
    $sql = 'INSERT INTO room_state(room_id, version, state_json, updated_at)
            VALUES (:room_id, :version, :state_json, datetime("now"))
            ON CONFLICT(room_id) DO UPDATE SET
              version=excluded.version,
              state_json=excluded.state_json,
              updated_at=excluded.updated_at';
    $stmt = $this->pdo->prepare($sql);
    $stmt->execute([
      ':room_id' => $roomId,
      ':version' => $version,
      ':state_json' => json_encode($state, JSON_UNESCAPED_UNICODE),
    ]);
  }

  public function setRoomStatus(string $roomId, string $status): void {
    $stmt = $this->pdo->prepare('UPDATE rooms SET status=?, started_at=CASE WHEN ?="active" THEN datetime("now") ELSE started_at END WHERE id=?');
    $stmt->execute([$status, $status, $roomId]);
  }
}