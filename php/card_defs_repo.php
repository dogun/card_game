<?php
require_once __DIR__ . '/db.php';

class CardDefsRepository {
  public function __construct(private PDO $pdo) {}

  // 编码/解码：类型 "army navy"
  private function encodeTypes(array $types): string {
    $types = array_values(array_unique(array_filter(array_map('strval', $types))));
    return implode(' ', $types);
  }
  private function decodeTypes(string $s): array {
    $parts = preg_split('/\s+/', trim((string)$s)) ?: [];
    return array_values(array_filter($parts, fn($x) => $x !== ''));
  }

  // 编码/解码：效果 "produce:2 armor:1 aready:0"
  private function encodeEffects(array $effects): string {
    // $effects: [ ['effect'=>'produce','num'=>2], ... ]
    $parts = [];
    foreach ($effects as $e) {
      if (!isset($e['effect'])) continue;
      $code = (string)$e['effect'];
      $num  = isset($e['num']) ? (int)$e['num'] : 0;
      // 简单防注入：不允许空格与冒号出现在 code
      if (preg_match('/[\s:]/', $code)) {
        throw new InvalidArgumentException("effect code contains invalid characters: $code");
      }
      $parts[] = $code . ':' . $num;
    }
    return implode(' ', $parts);
  }
  private function decodeEffects(string $s): array {
    $s = trim((string)$s);
    if ($s === '') return [];
    $tokens = preg_split('/\s+/', $s) ?: [];
    $out = [];
    foreach ($tokens as $tok) {
      [$code, $num] = array_pad(explode(':', $tok, 2), 2, '0');
      $out[] = ['effect' => $code, 'num' => (int)$num];
    }
    return $out;
  }

  // 可选校验：检查代码是否存在字典（若不需要可传 false）
  private function validateCodes(array $card): void {
    // country
    $stmt = $this->pdo->prepare('SELECT COUNT(1) FROM countries WHERE code = ?');
    $stmt->execute([$card['country_code']]);
    if (!$stmt->fetchColumn()) throw new InvalidArgumentException('Invalid country_code');

    // level
    $stmt = $this->pdo->prepare('SELECT COUNT(1) FROM card_levels WHERE code = ?');
    $stmt->execute([$card['card_level_code']]);
    if (!$stmt->fetchColumn()) throw new InvalidArgumentException('Invalid card_level_code');

    // types
    if (!empty($card['card_types'])) {
      $in = implode(',', array_fill(0, count($card['card_types']), '?'));
      $stmt = $this->pdo->prepare("SELECT code FROM card_types WHERE code IN ($in)");
      $stmt->execute(array_values($card['card_types']));
      $ok = array_column($stmt->fetchAll(), 'code');
      $diff = array_diff($card['card_types'], $ok);
      if ($diff) throw new InvalidArgumentException('Invalid card_types: ' . implode(',', $diff));
    }

    // effects
    if (!empty($card['effects'])) {
      $effectCodes = array_values(array_unique(array_map(fn($e) => (string)$e['effect'], $card['effects'])));
      $in = implode(',', array_fill(0, count($effectCodes), '?'));
      $stmt = $this->pdo->prepare("SELECT code FROM card_effect_defs WHERE code IN ($in)");
      $stmt->execute($effectCodes);
      $ok = array_column($stmt->fetchAll(), 'code');
      $diff = array_diff($effectCodes, $ok);
      if ($diff) throw new InvalidArgumentException('Invalid effects: ' . implode(',', $diff));
    }
  }

  // Upsert 卡（把类型与效果编码入字符串列）
  public function upsertCardDef(array $card, bool $validate = true): void {
    // 期望结构：
    // [
    //   'id'=>'sa','name'=>'冲锋队','description'=>'',
    //   'country_code'=>'GER','card_level_code'=>'reserve',
    //   'attack'=>2,'health'=>1,'deploy_cost'=>1,'action_cost'=>1,
    //   'card_types'=>['army'],
    //   'effects'=>[['effect'=>'aready','num'=>0]]
    // ]
    if ($validate) $this->validateCodes($card);

    $typesStr = $this->encodeTypes($card['card_types'] ?? []);
    $effStr   = $this->encodeEffects($card['effects'] ?? []);

    $sql = 'INSERT INTO card_defs
            (id,name,description,country_code,card_level_code,card_types,card_effects,attack,health,deploy_cost,action_cost)
            VALUES (:id,:name,:description,:country_code,:card_level_code,:card_types,:card_effects,:attack,:health,:deploy_cost,:action_cost)
            ON CONFLICT(id, country_code) DO UPDATE SET
              name=excluded.name,
              description=excluded.description,
              country_code=excluded.country_code,
              card_level_code=excluded.card_level_code,
              card_types=excluded.card_types,
              card_effects=excluded.card_effects,
              attack=excluded.attack,
              health=excluded.health,
              deploy_cost=excluded.deploy_cost,
              action_cost=excluded.action_cost';
    $stmt = $this->pdo->prepare($sql);
    $stmt->execute([
      ':id' => $card['id'],
      ':name' => $card['name'],
      ':description' => $card['description'] ?? null,
      ':country_code' => $card['country_code'],
      ':card_level_code' => $card['card_level_code'],
      ':card_types' => $typesStr,
      ':card_effects' => $effStr,
      ':attack' => (int)$card['attack'],
      ':health' => (int)$card['health'],
      ':deploy_cost' => (int)$card['deploy_cost'],
      ':action_cost' => (int)$card['action_cost'],
    ]);
  }

  public function getCardDef(string $id, string $country): ?array {
    $stmt = $this->pdo->prepare(
      'SELECT c.*, co.name AS country_name, cl.max_cards
       FROM card_defs c
       JOIN countries   co ON co.code = c.country_code
       JOIN card_levels cl ON cl.code = c.card_level_code
       WHERE c.id = ? and c.country_code=?'
    );
    $stmt->execute([$id, $country]);
    $row = $stmt->fetch();
    if (!$row) return null;

    return [
      'id' => $row['id'],
      'name' => $row['name'],
      'description' => $row['description'],
      'country_code' => $row['country_code'],
      'country_name' => $row['country_name'],
      'card_level_code' => $row['card_level_code'],
      'level_max' => (int)$row['max_cards'],
      'attack' => (int)$row['attack'],
      'health' => (int)$row['health'],
      'deploy_cost' => (int)$row['deploy_cost'],
      'action_cost' => (int)$row['action_cost'],
      'card_types' => $this->decodeTypes($row['card_types']),
      'effects'    => $this->decodeEffects($row['card_effects']),
    ];
  }

  public function listCardDefs(): array {
    $sql = 'SELECT id,name,country_code,card_level_code,attack,health,deploy_cost,action_cost,card_types,card_effects
            FROM card_defs ORDER BY id';
    $rows = $this->pdo->query($sql)->fetchAll();
    foreach ($rows as &$r) {
      $r['card_types'] = $this->decodeTypes($r['card_types']);
      $r['effects']    = $this->decodeEffects($r['card_effects']);
    }
    return $rows;
  }
 
  public function listCardDefsByCountry(string $country): array {
    $sql = 'SELECT id,name,country_code,card_level_code,attack,health,deploy_cost,action_cost,card_types,card_effects
            FROM card_defs WHERE country_code=? ORDER BY id';
	$stmt = $this->pdo->prepare($sql);
	$stmt.execute([$country]);
    $rows = $stmt->fetchAll();
    foreach ($rows as &$r) {
      $r['card_types'] = $this->decodeTypes($r['card_types']);
      $r['effects']    = $this->decodeEffects($r['card_effects']);
    }
    return $rows;
  }

  public function deleteCard(string $id, string $country): void {
    $stmt = $this->pdo->prepare('DELETE FROM card_defs WHERE id = ? and country_code=?');
    $stmt->execute([$id, $country]);
  }
}
