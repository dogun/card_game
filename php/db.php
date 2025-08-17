<?php
class DB {
  private static ?PDO $conn = null;

  public static function conn(): PDO {
    if (self::$conn === null) {
      $path = getenv('SQLITE_PATH') ?: __DIR__ . '/game.db';
      $dir = dirname($path);
      if (!is_dir($dir)) mkdir($dir, 0777, true);

      $dsn = 'sqlite:' . $path;
      $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
      ];
      self::$conn = new PDO($dsn, null, null, $options);
      self::$conn->exec('PRAGMA foreign_keys = ON');
    }
    return self::$conn;
  }

  public static function execSqlFile(PDO $pdo, string $file): void {
    $sql = file_get_contents($file);
    if ($sql === false) throw new RuntimeException("Cannot read $file");
    $pdo->exec($sql);
  }
}
