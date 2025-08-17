<?php
require_once __DIR__ . '/db.php';

class UserRepository {
  public function __construct(private PDO $pdo) {}

  public function createUser(string $username, string $nickname, string $password): int {
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $this->pdo->prepare(
      'INSERT INTO users(username, nickname, password_hash) VALUES(?,?,?)'
    );
    try {
      $stmt->execute([$username, $nickname, $hash]);
    } catch (PDOException $e) {
      if ($this->isUniqueConstraint($e)) {
        throw new InvalidArgumentException("Username already exists");
      }
      throw $e;
    }
    return (int)$this->pdo->lastInsertId();
  }

  public function getUserById(int $id): ?array {
    $stmt = $this->pdo->prepare('SELECT id, username, nickname, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
  }

  public function getUserByUsername(string $username): ?array {
    $stmt = $this->pdo->prepare('SELECT id, username, nickname, created_at FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    return $row ?: null;
  }

  public function verifyLogin(string $username, string $password): ?array {
    $stmt = $this->pdo->prepare('SELECT * FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();
    if (!$user) return null;
    if (!password_verify($password, $user['password_hash'])) return null;
    // 可按需返回更多字段
    unset($user['password_hash']);
    return $user;
  }

  public function listUsers(): array {
    return $this->pdo
      ->query('SELECT id, username, nickname, created_at FROM users ORDER BY id')
      ->fetchAll();
  }

  public function deleteUser(int $id): void {
    $stmt = $this->pdo->prepare('DELETE FROM users WHERE id = ?');
    $stmt->execute([$id]);
  }

  private function isUniqueConstraint(PDOException $e): bool {
    // SQLite 唯一约束错误码 19 (constraint failed)
    return $e->getCode() === '23000' || $e->errorInfo[1] === 19;
  }
}