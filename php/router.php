<?php
// Router + API
declare(strict_types=1);

$__root = __DIR__;
$__public = $__root;
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/';

if (PHP_SAPI === 'cli-server') {
  // Serve static files directly if they exist
  $file = realpath($__public . $path);
  if ($file && str_starts_with($file, $__public) && is_file($file)) {
    return false;
  }
}

session_start();

// Helpers
function json_out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}
function read_json(): array {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw ?: 'null', true);
  return is_array($data) ? $data : [];
}
function require_login(): int {
  if (!isset($_SESSION['uid'])) json_out(['error' => 'Unauthorized'], 401);
  return (int)$_SESSION['uid'];
}
function method(string $expect): void {
  if (strtoupper($_SERVER['REQUEST_METHOD']) !== strtoupper($expect)) {
    json_out(['error' => 'Method Not Allowed'], 405);
  }
}

require_once $__root . '/db.php';
require_once $__root . '/card_defs_repo.php';
require_once $__root . '/decks_repo.php';
require_once $__root . '/user_repo.php';
require_once $__root . '/room_repo.php';
require_once $__root . '/game.php';

$pdo = DB::conn();

$route = rtrim($path, '/');

// API routes
if ($route === '/api/ping') {
  json_out(['pong' => true, 'time' => gmdate('c')]);
}

if ($route === '/api/me') {
  $uid = $_SESSION['uid'] ?? null;
  if (!$uid) json_out(['user' => null]);
  $u = (new UserRepository($pdo))->getUserById((int)$uid);
  json_out(['user' => $u]);
}

if ($route === '/api/users/register') {
  method('POST');
  $b = read_json();
  $username = trim($b['username'] ?? '');
  $nickname = trim($b['nickname'] ?? '');
  $password = (string)($b['password'] ?? '');
  if ($username === '' || $nickname === '' || $password === '') {
    json_out(['error' => 'Missing fields'], 400);
  }
  try {
    $repo = new UserRepository($pdo);
    $uid = $repo->createUser($username, $nickname, $password);
    $_SESSION['uid'] = $uid;
    json_out(['ok' => true, 'id' => $uid]);
  } catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 400);
  }
}

if ($route === '/api/users/login') {
  method('POST');
  $b = read_json();
  $username = (string)($b['username'] ?? '');
  $password = (string)($b['password'] ?? '');
  $repo = new UserRepository($pdo);
  $u = $repo->verifyLogin($username, $password);
  if (!$u) json_out(['error' => 'Invalid credentials'], 401);
  $_SESSION['uid'] = (int)$u['id'];
  json_out(['ok' => true, 'user' => $u]);
}

if ($route === '/api/users/logout') {
  method('POST');
  session_destroy();
  json_out(['ok' => true]);
}

if ($route === '/api/cards') {
  method('GET');
  $repo = new CardDefsRepository($pdo);
  json_out($repo->listCardDefs());
}

if (preg_match('#^/api/cards/([^/]+)$#', $route, $m)) {
  method('GET');
  $repo = new CardDefsRepository($pdo);
  $card = $repo->getCard($m[1]);
  if (!$card) json_out(['error' => 'Not found'], 404);
  json_out($card);
}

if ($route === '/api/decks') {
  $uid = require_login();
  if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $repo = new DeckRepository($pdo);
    json_out($repo->listDecksByUser($uid));
  } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
	$b = read_json();
    $repo = new DeckRepository($pdo);
    $deckId = $repo->createDeck($uid, $b['name']);
    json_out(['ok' => true, 'deck_id' => $deckId], 201);
  } else {
    json_out(['error' => 'Method Not Allowed'], 405);
  }
}

if (preg_match('#^/api/decks/([^/]+)$#', $route, $m)) {
  $uid = require_login();
  $deckId = $m[1];
  $repo = new DeckRepository($pdo);
  $owner = $repo->deckOwner($deckId);
  if ($owner === null) json_out(['error' => 'Not found'], 404);
  if ($owner !== $uid) json_out(['error' => 'Forbidden'], 403);

  if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $deck = $repo->getDeck($deckId);
    json_out($deck ?: ['error' => 'Not found'], $deck ? 200 : 404);
  } elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $repo->deleteDeck($deckId);
    json_out(['ok' => true]);
  } else {
    json_out(['error' => 'Method Not Allowed'], 405);
  }
}

if (preg_match('#^/api/decks/([^/]+)/cards$#', $route, $m)) {
  method('PUT');
  $uid = require_login();
  $deckId = $m[1];
  $repo = new DeckRepository($pdo);
  $owner = $repo->deckOwner($deckId);
  if ($owner === null) json_out(['error' => 'Not found'], 404);
  if ($owner !== $uid) json_out(['error' => 'Forbidden'], 403);

  $b = read_json();
  $items = $b['items'] ?? [];
  if (!is_array($items)) $items = [];
  try {
    $repo->setDeckCards($deckId, $items);
    json_out(['ok' => true]);
  } catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 400);
  }
}

/* Rooms & Game APIs */
$roomRepo = new RoomRepository($pdo);
$game = new GameService($pdo, $roomRepo);

if ($route === '/api/rooms') {
  $uid = require_login();
  if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $roomId = $roomRepo->createRoom($uid);
    json_out(['ok'=>true,'room_id'=>$roomId], 201);
  } else {
    json_out(['error'=>'Method Not Allowed'],405);
  }
}

if (preg_match('#^/api/rooms/([^/]+)/join$#', $route, $m)) {
  method('POST');
  $uid = require_login();
  try {
    $roomRepo->joinRoom($m[1], $uid);
    json_out(['ok'=>true]);
  } catch (Throwable $e) { json_out(['error'=>$e->getMessage()],400); }
}

if (preg_match('#^/api/rooms/([^/]+)/deck$#', $route, $m)) {
  method('PUT');
  $uid = require_login();
  $b = read_json();
  $deckId = (string)($b['deck_id'] ?? '');
  if ($deckId === '') json_out(['error'=>'deck_id required'],400);
  try {
    $roomRepo->setPlayerDeck($m[1], $uid, $deckId);
    json_out(['ok'=>true]);
  } catch (Throwable $e) { json_out(['error'=>$e->getMessage()],400); }
}

if (preg_match('#^/api/rooms/([^/]+)/start$#', $route, $m)) {
  method('POST');
  $uid = require_login();
  try {
    $res = $game->startGame($m[1], $uid);
    json_out($res);
  } catch (Throwable $e) { json_out(['error'=>$e->getMessage()],400); }
}

if (preg_match('#^/api/rooms/([^/]+)/state$#', $route, $m)) {
  method('GET');
  try {
    $res = $roomRepo->getState($m[1]);
    json_out($res);
  } catch (Throwable $e) { json_out(['error'=>$e->getMessage()],400); }
}

if (preg_match('#^/api/rooms/([^/]+)/action$#', $route, $m)) {
  method('POST');
  $uid = require_login();
  $b = read_json();
  $type = (string)($b['type'] ?? '');
  $ver  = (int)($b['version'] ?? -1);
  try {
    switch ($type) {
      case 'choose_draw_pile':
        $pile = (string)($b['pile'] ?? '');
        $res = $game->chooseDrawPile($m[1], $uid, $pile, $ver);
        break;
      case 'play_support':
        $idx = (int)($b['hand_index'] ?? -1);
        $res = $game->playToSupport($m[1], $uid, $idx, $ver);
        break;
      case 'support_to_front':
        $idx = (int)($b['support_index'] ?? -1);
        $res = $game->supportToFront($m[1], $uid, $idx, $ver);
        break;
      case 'attack':
        $res = $game->attack(
          $m[1], $uid,
          (string)($b['from'] ?? ''), (int)($b['index'] ?? -1),
          (string)($b['target_from'] ?? ''), (int)($b['target_index'] ?? -1),
          $ver
        );
        break;
      case 'end_turn':
        $res = $game->endTurn($m[1], $uid, $ver);
        break;
      default:
        throw new InvalidArgumentException('Unknown action type');
    }
    json_out($res);
  } catch (Throwable $e) { json_out(['error'=>$e->getMessage()],400); }
}

// Fallback: serve SPA
readfile($__public . '/index.html');
