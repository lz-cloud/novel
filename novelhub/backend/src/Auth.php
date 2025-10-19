<?php
namespace NovelHub;

class Auth
{
    private Storage $storage;
    private string $secret;
    private ?array $currentPayload = null;

    public function __construct(Storage $storage, string $secret)
    {
        $this->storage = $storage;
        $this->secret = $secret;
    }

    // Authenticate request and return payload; if $required, error on missing/invalid
    public function authenticate(bool $required = true): ?array
    {
        $hdr = $this->getAuthHeader();
        if (!$hdr) {
            if ($required) Utils::error(401, 'Unauthorized');
            return null;
        }
        [$scheme, $token] = explode(' ', $hdr, 2) + [null, null];
        if (strtolower($scheme) !== 'bearer' || !$token) {
            if ($required) Utils::error(401, 'Invalid token format');
            return null;
        }
        $payload = $this->verifyJwt($token);
        if (!$payload) {
            if ($required) Utils::error(401, 'Unauthorized');
            return null;
        }
        // Check session exists and not expired/revoked
        $sessions = $this->storage->all('sessions');
        $valid = false;
        foreach ($sessions as $s) {
            if (($s['jti'] ?? '') === ($payload['jti'] ?? '')) {
                if (!($s['revoked'] ?? false) && strtotime($s['expiresAt'] ?? '1970-01-01') > time()) {
                    $valid = true;
                }
                break;
            }
        }
        if (!$valid) {
            if ($required) Utils::error(401, 'Session expired');
            return null;
        }
        $this->currentPayload = $payload;
        return $payload;
    }

    public function requireRole(string $role): void
    {
        $u = $this->currentPayload;
        if (!$u || strtoupper($u['role'] ?? '') !== strtoupper($role)) {
            Utils::error(403, 'Admin only');
        }
    }

    public function issueToken(int $userId, string $username, string $role): string
    {
        $jti = bin2hex(random_bytes(16));
        $exp = time() + (int)(getenv('SESSION_TTL_SECONDS') ?: 7 * 24 * 3600);
        $payload = [
            'id' => $userId,
            'username' => $username,
            'role' => $role,
            'jti' => $jti,
            'exp' => $exp,
            'iat' => time(),
        ];
        $token = $this->signJwt($payload);
        // persist session
        $this->storage->append('sessions', [
            'jti' => $jti,
            'userId' => $userId,
            'expiresAt' => gmdate('c', $exp),
            'revoked' => false,
            'createdAt' => Utils::now(),
        ]);
        $this->currentPayload = $payload;
        return $token;
    }

    public function revokeCurrentToken(): void
    {
        $payload = $this->currentPayload ?: $this->authenticate(true);
        $sessions = $this->storage->all('sessions');
        $changed = false;
        foreach ($sessions as &$s) {
            if (($s['jti'] ?? '') === ($payload['jti'] ?? '')) {
                $s['revoked'] = true;
                $changed = true;
                break;
            }
        }
        if ($changed) $this->storage->write('sessions', $sessions);
    }

    private function getAuthHeader(): ?string
    {
        $headers = function_exists('getallheaders') ? getallheaders() : [];
        $hdr = $headers['Authorization'] ?? $headers['authorization'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? null;
        return is_string($hdr) ? trim($hdr) : null;
    }

    // Minimal HS256 JWT implementation
    private function base64url_encode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function base64url_decode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) $data .= str_repeat('=', 4 - $remainder);
        return base64_decode(strtr($data, '-_', '+/')) ?: '';
    }

    private function signJwt(array $payload): string
    {
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];
        $segments = [
            $this->base64url_encode(json_encode($header)),
            $this->base64url_encode(json_encode($payload)),
        ];
        $signingInput = implode('.', $segments);
        $signature = hash_hmac('sha256', $signingInput, $this->secret, true);
        $segments[] = $this->base64url_encode($signature);
        return implode('.', $segments);
    }

    private function verifyJwt(string $jwt): ?array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) return null;
        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
        $header = json_decode($this->base64url_decode($encodedHeader), true);
        $payload = json_decode($this->base64url_decode($encodedPayload), true);
        $sig = $this->base64url_decode($encodedSignature);
        if (!is_array($header) || !is_array($payload)) return null;
        if (($header['alg'] ?? '') !== 'HS256') return null;
        $signingInput = $encodedHeader . '.' . $encodedPayload;
        $expected = hash_hmac('sha256', $signingInput, $this->secret, true);
        if (!hash_equals($expected, $sig)) return null;
        if (isset($payload['exp']) && time() >= (int)$payload['exp']) return null;
        return $payload;
    }
}
