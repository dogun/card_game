<?php
require __DIR__ . '/db.php';

class DictRepository {
  public function __construct(private PDO $pdo) {}

  // Countries
  public function listCountries(): array {
    return $this->pdo->query('SELECT code, name FROM countries ORDER BY code')->fetchAll();
  }
  public function getCountry(string $code): ?array {
    $stmt = $this->pdo->prepare('SELECT code, name FROM countries WHERE code = ?');
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    return $row ?: null;
  }
  public function findCountriesByName(string $kw): array {
    $stmt = $this->pdo->prepare('SELECT code, name FROM countries WHERE name LIKE ? ORDER BY name');
    $stmt->execute(['%'.$kw.'%']);
    return $stmt->fetchAll();
  }

  // Card types
  public function listCardTypes(): array {
    return $this->pdo->query('SELECT code, name FROM card_types ORDER BY code')->fetchAll();
  }
  public function getCardType(string $code): ?array {
    $stmt = $this->pdo->prepare('SELECT code, name FROM card_types WHERE code = ?');
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    return $row ?: null;
  }

  // Card levels
  public function listCardLevels(): array {
    return $this->pdo->query('SELECT code, max_cards FROM card_levels ORDER BY code')->fetchAll();
  }
  public function getCardLevel(string $code): ?array {
    $stmt = $this->pdo->prepare('SELECT code, max_cards FROM card_levels WHERE code = ?');
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    return $row ?: null;
  }

  // Card effects (definitions)
  public function listEffectDefs(): array {
    return $this->pdo->query('SELECT code FROM card_effect_defs ORDER BY code')->fetchAll();
  }
  public function getEffectDef(string $code): ?array {
    $stmt = $this->pdo->prepare('SELECT code FROM card_effect_defs WHERE code = ?');
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    return $row ?: null;
  }
}