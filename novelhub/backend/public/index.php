<?php
// Simple PHP backend for NovelHub with file-based storage and no Redis/SQL
// Entry point and router

declare(strict_types=1);

// Basic autoload (simple, no composer)
spl_autoload_register(function ($class) {
    $baseDir = __DIR__ . '/../src/';
    $file = $baseDir . str_replace('\\', '/', $class) . '.php';
    if (file_exists($file)) require $file;
});

require_once __DIR__ . '/../src/Utils.php';
require_once __DIR__ . '/../src/Storage.php';
require_once __DIR__ . '/../src/Auth.php';

use NovelHub\Utils;
use NovelHub\Storage;
use NovelHub\Auth;

// CORS/Headers (behind same-origin nginx but safe)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    http_response_code(204);
    exit;
}
header('Content-Type: application/json; charset=utf-8');

$storage = new Storage(getenv('DATA_DIR') ?: (__DIR__ . '/../data'));
$auth = new Auth($storage, getenv('JWT_SECRET') ?: 'insecure_secret');

// Seed initial data if empty
seedIfNeeded($storage);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH) ?: '/';

// Route helper
function route($pattern, $path)
{
    $regex = '#^' . preg_replace('#\\{([^/]+)\\}#', '(?P<$1>[^/]+)', preg_quote($pattern, '#')) . '$#';
    if (preg_match($regex, $path, $m)) {
        $params = [];
        foreach ($m as $k => $v) if (!is_int($k)) $params[$k] = $v;
        return $params;
    }
    return false;
}

// Health
if ($path === '/health') {
    echo json_encode(['status' => 'ok']);
    exit;
}

// API routing
// Authentication: try to parse token (optional)
$user = $auth->authenticate(false);

// /api/auth/login
if ($method === 'POST' && $path === '/api/auth/login') {
    $body = Utils::jsonBody();
    $identifier = trim((string)($body['identifier'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($identifier === '' || $password === '') {
        Utils::error(400, 'Missing fields');
    }
    $u = $storage->findOne('users', function ($x) use ($identifier) {
        return ($x['email'] ?? null) === $identifier || ($x['username'] ?? null) === $identifier;
    });
    if (!$u || empty($u['passwordHash']) || !password_verify($password, $u['passwordHash'])) {
        Utils::error(401, 'Invalid credentials');
    }
    if (!empty($u['isDisabled'])) Utils::error(403, 'Account disabled');
    $token = $auth->issueToken((int)$u['id'], (string)($u['username'] ?? ''), (string)($u['role'] ?? 'USER'));
    echo json_encode(['token' => $token]);
    exit;
}

// /api/auth/logout
if ($method === 'POST' && $path === '/api/auth/logout') {
    $authUser = $auth->authenticate(true);
    $auth->revokeCurrentToken();
    echo json_encode(['success' => true]);
    exit;
}

// /api/auth/me
if ($method === 'GET' && $path === '/api/auth/me') {
    $authUser = $auth->authenticate(true);
    $userData = $storage->findById('users', (int)$authUser['id']);
    echo json_encode(Utils::pick($userData, ['id', 'email', 'username', 'role', 'createdAt']));
    exit;
}

// Admin: list users
if ($method === 'GET' && $path === '/api/auth/users') {
    $authUser = $auth->authenticate(true);
    $auth->requireRole('ADMIN');
    $users = $storage->all('users');
    $out = array_map(function ($u) {
        return Utils::pick($u, ['id', 'email', 'username', 'role', 'isDisabled', 'createdAt']);
    }, $users);
    echo json_encode($out);
    exit;
}

// Admin: disable/enable user
if ($method === 'PUT' && ($params = route('/api/auth/users/{id}/disable', $path))) {
    $authUser = $auth->authenticate(true);
    $auth->requireRole('ADMIN');
    $id = (int)$params['id'];
    $body = Utils::jsonBody();
    $disable = !empty($body['disable']);
    $u = $storage->findById('users', $id);
    if (!$u) Utils::error(404, 'Not found');
    $u['isDisabled'] = $disable;
    $storage->upsert('users', $u, 'id');
    echo json_encode(['id' => $u['id'], 'isDisabled' => $u['isDisabled']]);
    exit;
}

// Admin: change role
if ($method === 'PUT' && ($params = route('/api/auth/users/{id}/role', $path))) {
    $authUser = $auth->authenticate(true);
    $auth->requireRole('ADMIN');
    $id = (int)$params['id'];
    $body = Utils::jsonBody();
    $role = strtoupper((string)($body['role'] ?? ''));
    if (!in_array($role, ['USER', 'ADMIN'], true)) Utils::error(400, 'Invalid role');
    $u = $storage->findById('users', $id);
    if (!$u) Utils::error(404, 'Not found');
    $u['role'] = $role;
    $storage->upsert('users', $u, 'id');
    echo json_encode(['id' => $u['id'], 'role' => $u['role']]);
    exit;
}

// --- Novels ---
// List novels
if ($method === 'GET' && $path === '/api/novels') {
    $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';
    $author = isset($_GET['author']) ? trim((string)$_GET['author']) : '';
    $novels = $storage->all('novels');
    // Enrich author
    $usersById = Utils::indexBy($storage->all('users'), 'id');
    $filtered = array_values(array_filter($novels, function ($n) use ($q, $author, $usersById) {
        $ok = true;
        if ($q !== '') {
            $authorName = $usersById[$n['authorId']]['username'] ?? '';
            $ok = stripos($n['title'], $q) !== false || stripos((string)($n['description'] ?? ''), $q) !== false || stripos($authorName, $q) !== false;
        }
        if ($ok && $author !== '') {
            $authorName = $usersById[$n['authorId']]['username'] ?? '';
            $ok = strcasecmp($authorName, $author) === 0;
        }
        return $ok;
    }));
    usort($filtered, function ($a, $b) { return strcmp($b['createdAt'], $a['createdAt']); });
    $out = array_map(function ($n) use ($usersById) {
        $n['author'] = ['id' => $n['authorId'], 'username' => $usersById[$n['authorId']]['username'] ?? ''];
        $n['categories'] = $n['categories'] ?? [];
        return $n;
    }, $filtered);
    echo json_encode($out);
    exit;
}

// Get novel by id
if ($method === 'GET' && ($params = route('/api/novels/{id}', $path))) {
    $id = (int)$params['id'];
    $n = $storage->findById('novels', $id);
    if (!$n) Utils::error(404, 'Not found');
    $user = $storage->findById('users', (int)$n['authorId']);
    $n['author'] = ['id' => $n['authorId'], 'username' => $user['username'] ?? ''];
    $n['categories'] = $n['categories'] ?? [];
    echo json_encode($n);
    exit;
}

// Create novel
if ($method === 'POST' && $path === '/api/novels') {
    $authUser = $auth->authenticate(true);
    $body = Utils::jsonBody();
    $title = trim((string)($body['title'] ?? ''));
    if ($title === '') Utils::error(400, 'Title required');
    $novel = [
        'id' => $storage->nextId('novels'),
        'title' => $title,
        'coverUrl' => $body['coverUrl'] ?? null,
        'description' => (string)($body['description'] ?? ''),
        'tags' => is_array($body['tags'] ?? null) ? array_values($body['tags']) : [],
        'authorId' => (int)$authUser['id'],
        'createdAt' => Utils::now(),
        'updatedAt' => Utils::now(),
        'categories' => [],
    ];
    $storage->append('novels', $novel);
    echo json_encode($novel);
    exit;
}

// List chapters of novel
if ($method === 'GET' && ($params = route('/api/novels/{id}/chapters', $path))) {
    $id = (int)$params['id'];
    $n = $storage->findById('novels', $id);
    if (!$n) Utils::error(404, 'Not found');
    $uid = $user['id'] ?? null;
    $isOwner = $uid && (int)$uid === (int)$n['authorId'];
    $chapters = array_values(array_filter($storage->all('chapters'), function ($c) use ($id, $isOwner) {
        if ((int)$c['novelId'] !== $id) return false;
        if (!$isOwner && !empty($c['isDraft'])) return false;
        return true;
    }));
    usort($chapters, function ($a, $b) { return ($a['order'] <=> $b['order']); });
    echo json_encode($chapters);
    exit;
}

// --- Chapters ---
// Get chapter by id
if ($method === 'GET' && ($params = route('/api/chapters/{id}', $path))) {
    $id = (int)$params['id'];
    $ch = $storage->findById('chapters', $id);
    if (!$ch) Utils::error(404, 'Not found');
    if (!empty($ch['isDraft'])) {
        // Only owner can view drafts
        $novel = $storage->findById('novels', (int)$ch['novelId']);
        $uid = $user['id'] ?? null;
        if (!$uid || (int)$novel['authorId'] !== (int)$uid) {
            Utils::error(403, 'Forbidden');
        }
    }
    echo json_encode($ch);
    exit;
}

// Create chapter for novel
if ($method === 'POST' && ($params = route('/api/chapters/novel/{novelId}', $path))) {
    $authUser = $auth->authenticate(true);
    $novelId = (int)$params['novelId'];
    $novel = $storage->findById('novels', $novelId);
    if (!$novel) Utils::error(404, 'Novel not found');
    $isAdmin = ($authUser['role'] ?? 'USER') === 'ADMIN';
    if ((int)$novel['authorId'] !== (int)$authUser['id'] && !$isAdmin) Utils::error(403, 'Forbidden');
    $body = Utils::jsonBody();
    $title = trim((string)($body['title'] ?? ''));
    $content = (string)($body['content'] ?? '');
    $isDraft = isset($body['isDraft']) ? (bool)$body['isDraft'] : true;
    $existing = array_values(array_filter($storage->all('chapters'), fn($c) => (int)$c['novelId'] === $novelId));
    $lastOrder = 0;
    foreach ($existing as $c) $lastOrder = max($lastOrder, (int)($c['order'] ?? 0));
    $chapter = [
        'id' => $storage->nextId('chapters'),
        'title' => $title,
        'content' => $content,
        'isDraft' => $isDraft,
        'order' => $lastOrder + 1,
        'novelId' => $novelId,
        'createdAt' => Utils::now(),
        'updatedAt' => Utils::now(),
    ];
    $storage->append('chapters', $chapter);
    echo json_encode($chapter);
    exit;
}

// If reached here, not found
Utils::error(404, 'Not found');

// --- helpers ---
function seedIfNeeded(Storage $storage): void {
    // Create directories and files if not exist
    $storage->ensureCollection('users');
    $storage->ensureCollection('novels');
    $storage->ensureCollection('chapters');
    $storage->ensureCollection('bookmarks');
    $storage->ensureCollection('sessions');
    $users = $storage->all('users');
    if (count($users) === 0) {
        $admin = [
            'id' => 1,
            'email' => 'admin@novelhub.local',
            'username' => 'admin',
            'passwordHash' => password_hash('Admin12345!', PASSWORD_DEFAULT),
            'role' => 'ADMIN',
            'isDisabled' => false,
            'createdAt' => Utils::now(),
            'updatedAt' => Utils::now(),
        ];
        $storage->append('users', $admin);
        $novel = [
            'id' => 1,
            'title' => 'The Seeded Saga',
            'description' => 'An example novel created by the seed script.',
            'coverUrl' => null,
            'tags' => ['example', 'seed'],
            'authorId' => 1,
            'categories' => [],
            'createdAt' => Utils::now(),
            'updatedAt' => Utils::now(),
        ];
        $storage->append('novels', $novel);
        $ch1 = [
            'id' => 1,
            'title' => 'Chapter 1: Awakening',
            'content' => '<p>This is the beginning of our story...</p>',
            'isDraft' => false,
            'order' => 1,
            'novelId' => 1,
            'createdAt' => Utils::now(),
            'updatedAt' => Utils::now(),
        ];
        $storage->append('chapters', $ch1);
        $ch2 = [
            'id' => 2,
            'title' => 'Chapter 2: Journey',
            'content' => '<p>The journey continues...</p>',
            'isDraft' => false,
            'order' => 2,
            'novelId' => 1,
            'createdAt' => Utils::now(),
            'updatedAt' => Utils::now(),
        ];
        $storage->append('chapters', $ch2);
    }
}
