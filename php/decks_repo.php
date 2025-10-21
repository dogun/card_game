<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/card_defs_repo.php';

class DeckRepository {
  public function __construct(private PDO $pdo, private CardDefsRepository $card_defs) {}

  // 生成 UUID v4（简版）
  private function uuid(): string {
    $this->pdo->exec('CREATE TABLE IF NOT EXISTS seq (id INTEGER PRIMARY KEY AUTOINCREMENT)');
    $this->pdo->exec('INSERT INTO seq DEFAULT VALUES');
    $id = $this->pdo->lastInsertId();
    return "$id";
  }

  // 创建卡组（可传自定义 id；不传则自动生成 UUID）
  public function createDeck(int $userId, array $deck, ?string $deckId = null): string {
    $deckId = $deckId ?: $this->uuid();
    // 确认用户存在
    $check = $this->pdo->prepare('SELECT 1 FROM users WHERE id = ?');
    $check->execute([$userId]);
    if (!$check->fetchColumn()) {
      throw new InvalidArgumentException('User not found');
    }

    $stmt = $this->pdo->prepare('INSERT INTO decks(id, name, user_id, country, country1, headquarters) VALUES(?, ?, ?, ?, ?, ?)');
    $stmt->execute([$deckId, $deck['name'], $userId, $deck['country'], $deck['country1'], $deck['headquarters']]);
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
		foreach ($items as $item) {
			$card_def = $this->card_defs->getCardDef($item['card_def_id'], $item['country']);
			if (!$card_def) {
				throw new InvalidArgumentException('Invalid card id:'.$item['card_def_id'].' ,'.$item['country']);
			}
		}
      }

      // 清空原清单
      $del = $this->pdo->prepare('DELETE FROM deck_cards WHERE deck_id = ?');
      $del->execute([$deckId]);

      // 逐条插入
      if (!empty($items)) {
        $ins = $this->pdo->prepare('INSERT INTO deck_cards(deck_id, card_def_id, country, card_count) VALUES (?,?,?,?)');
        foreach ($items as $it) {
          $count = (int)($it['card_count'] ?? 0);
          if ($count < 0) continue; // 跳过非法或 0
          $ins->execute([$deckId, (string)$it['card_def_id'], (string)$it['country'], $count]);
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
      'SELECT d.id, d.name, d.user_id, u.username, u.nickname, d.created_at, d.country, d.country1, d.headquarters
         FROM decks d
         JOIN users u ON u.id = d.user_id
        WHERE d.id = ?'
    );
    $stmt->execute([$deckId]);
    $deck = $stmt->fetch();
    if (!$deck) return null;

    $q = $this->pdo->prepare(
      'SELECT dc.card_def_id, dc.country, dc.card_count, c.name AS card_name, c.attack, c.health, c.deploy_cost, c.action_cost, c.card_types
         FROM deck_cards dc
         LEFT JOIN card_defs c ON c.id = dc.card_def_id and c.country_code = dc.country
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
      'SELECT d.id, d.user_id, d.name, d.created_at, d.country, d.country1, d.headquarters,
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