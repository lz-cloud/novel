<?php
namespace NovelHub;

class Utils
{
    public static function jsonBody(): array
    {
        $raw = file_get_contents('php://input') ?: '';
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    public static function error(int $status, string $message): void
    {
        http_response_code($status);
        echo json_encode(['error' => $message]);
        exit;
    }

    public static function pick(array $arr, array $keys): array
    {
        $out = [];
        foreach ($keys as $k) if (array_key_exists($k, $arr)) $out[$k] = $arr[$k];
        return $out;
    }

    public static function indexBy(array $arr, string $key): array
    {
        $out = [];
        foreach ($arr as $item) {
            if (isset($item[$key])) $out[$item[$key]] = $item;
        }
        return $out;
    }

    public static function now(): string
    {
        return gmdate('c');
    }
}
