<?php
require __DIR__ . '/db.php';

function seedDicts(PDO $pdo): void {
  // 国家
  $countries = [
    ['GER','德国'], ['SOV','苏联'], ['FRA','法国'], ['ENG','英国'],
    ['CHI','中国'], ['JAP','日本'], ['ITA','意大利'],
  ];
  $stmt = $pdo->prepare(
    'INSERT INTO countries(code,name) VALUES(?,?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name'
  );
  foreach ($countries as $c) $stmt->execute($c);

  // 卡牌类型（修正 headquarters 拼写）
  $types = [
    ['army','军队'],
    ['navy','海军'],
    ['air_force','空军'],
    ['headquarters','司令部'],
    ['command','指令'],
    ['action','行动'],
  ];
  $stmt = $pdo->prepare(
    'INSERT INTO card_types(code,name) VALUES(?,?)
     ON CONFLICT(code) DO UPDATE SET name=excluded.name'
  );
  foreach ($types as $t) $stmt->execute($t);

  // 卡牌级别
  $levels = [
    ['elite', 1],
    ['ordinary', 3],
    ['reserve', 5],
    ['derivative', 0],
  ];
  $stmt = $pdo->prepare(
    'INSERT INTO card_levels(code,max_cards) VALUES(?,?)
     ON CONFLICT(code) DO UPDATE SET max_cards=excluded.max_cards'
  );
  foreach ($levels as $lv) $stmt->execute($lv);

  // 效果
  $effects = [
    'produce','armor','dearmor','intelligence','support',
    'aready','lightning','sputtering','guerrilla','commander','guard'
  ];
  $stmt = $pdo->prepare(
    'INSERT INTO card_effect_defs(code) VALUES(?)
     ON CONFLICT(code) DO NOTHING'
  );
  foreach ($effects as $e) $stmt->execute([$e]);
}

if (PHP_SAPI === 'cli' && basename(__FILE__) === basename($_SERVER['argv'][0])) {
  $pdo = DB::conn();
  //DB::execSqlFile($pdo, __DIR__ . '/../schema.sqlite.sql');
  seedDicts($pdo);
  echo "SQLite schema created and seeded.\n";
}