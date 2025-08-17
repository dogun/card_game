<?php
require_once __DIR__ . '/db.php';

class DeckRepository {
  public function __construct(private PDO $pdo) {}

  // 生成 UUID v4（简版）
  private function uuid(): string {
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40); // version 4
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80); // variant
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
  }

  // 创建卡组（可传自定义 id；不传则自动生成 UUID）
  public function createDeck(int $userId, string $name, ?string $deckId = null): string {
    $deckId = $deckId ?: $this->uuid();
    // 确认用户存在
    $check = $this->pdo->prepare('SELECT 1 FROM users WHERE id = ?');
    $check->execute([$userId]);
    if (!$check->fetchColumn()) {
      throw new InvalidArgumentException('User not found');
    }

    $stmt = $this->pdo->prepare('INSERT INTO decks(id, name, user_id) VALUES(?, ?, ?)');
    $stmt->execute([$deckId, $name, $userId]);
    return $deckId;
  }

  // 设置卡组清单（整体替换：先清空再插入）
  // $items = [ ['card_def_id'=>'sa','card_count'=>2], ... ]
  public function setDeckCards(string $deckId, array $items): void {
    $this->pdo->beginTransaction();
    try {
      // 检查卡组存在
      $chk = $this->pdo->prepare('SELECT 1 FROM decks WHERE id = ?');
      $chk->execute([$deckId]);
      if (!$chk->fetchColumn()) {
        throw new InvalidArgumentException('Deck not found');
      }

      // 可选：校验卡牌是否存在
      if (!empty($items)) {
        $cardIds = array_values(array_unique(array_map(fn($it) => (string)$it['card_def_id'], $items)));
        $in = implode(',', array_fill(0, count($cardIds), '?'));
        $q = $this->pdo->prepare("SELECT id FROM card_defs WHERE id IN ($in)");
        $q->execute($cardIds);
        $ok = array_column($q->fetchAll(), 'id');
        $diff = array_diff($cardIds, $ok);
        if ($diff) {
          throw new InvalidArgumentException('Invalid card ids: ' . implode(',', $diff));
        }
      }

      // 清空原清单
      $del = $this->pdo->prepare('DELETE FROM deck_cards WHERE deck_id = ?');
      $del->execute([$deckId]);

      // 逐条插入
      if (!empty($items)) {
        $ins = $this->pdo->prepare('INSERT INTO deck_cards(deck_id, card_def_id, card_count) VALUES (?,?,?)');
        foreach ($items as $it) {
          $count = (int)($it['card_count'] ?? 0);
          if ($count < 0) continue; // 跳过非法或 0
          $ins->execute([$deckId, (string)$it['card_def_id'], $count]);
        }
      }

      $this->pdo->commit();
    } catch (Throwable $e) {
      $this->pdo->rollBack();
      throw $e;
    }
  }

  // 获取卡组（含基本信息与卡牌清单；附带卡牌名称）
  public function getDeck(string $deckId): ?array {
    $stmt = $this->pdo->prepare(
      'SELECT d.id, d.name, d.user_id, u.username, u.nickname, d.created_at
         FROM decks d
         JOIN users u ON u.id = d.user_id
        WHERE d.id = ?'
    );
    $stmt->execute([$deckId]);
    $deck = $stmt->fetch();
    if (!$deck) return null;

    $q = $this->pdo->prepare(
      'SELECT dc.card_def_id, dc.card_count, c.name AS card_name
         FROM deck_cards dc
         LEFT JOIN card_defs c ON c.id = dc.card_def_id
        WHERE dc.deck_id = ?
        ORDER BY dc.card_def_id'
    );
    $q->execute([$deckId]);
    $cards = $q->fetchAll();

    $deck['card_defs'] = $cards;
    return $deck;
  }

  // 列出某用户的卡组（不带清单）
  public function listDecksByUser(int $userId): array {
    $stmt = $this->pdo->prepare(
      'SELECT d.id, d.user_id, d.name, d.created_at,
              COUNT(dc.card_def_id) AS lines,
              COALESCE(SUM(dc.card_count), 0) AS total_cards
       FROM decks d
       LEFT JOIN deck_cards dc ON dc.deck_id = d.id
       WHERE d.user_id = ?
       GROUP BY d.id
       ORDER BY d.created_at DESC'
    );
    $stmt->execute([$userId]);
    return $stmt->fetchAll();
  }

  // 删除卡组（会级联删除 deck_cards）
  public function deleteDeck(string $deckId): void {
    $stmt = $this->pdo->prepare('DELETE FROM decks WHERE id = ?');
    $stmt->execute([$deckId]);
  }
  
  public function deckOwner(string $deckId): ?int {
    $stmt = $this->pdo->prepare('SELECT user_id FROM decks WHERE id = ?');
    $stmt->execute([$deckId]);
    $val = $stmt->fetchColumn();
    return $val !== false ? (int)$val : null;
  }
}