<?php
namespace NovelHub;

class Storage
{
    private string $dir;

    public function __construct(string $dir)
    {
        $this->dir = rtrim($dir, '/');
        if (!is_dir($this->dir)) {
            mkdir($this->dir, 0777, true);
        }
    }

    public function path(string $collection): string
    {
        return $this->dir . '/' . $collection . '.json';
    }

    public function ensureCollection(string $collection): void
    {
        $path = $this->path($collection);
        if (!file_exists($path)) {
            $this->writeFile($path, []);
        }
    }

    public function all(string $collection): array
    {
        $path = $this->path($collection);
        if (!file_exists($path)) return [];
        $json = file_get_contents($path);
        $data = json_decode($json, true);
        return is_array($data) ? $data : [];
    }

    public function write(string $collection, array $data): void
    {
        $this->writeFile($this->path($collection), $data);
    }

    public function append(string $collection, array $record): void
    {
        $data = $this->all($collection);
        $data[] = $record;
        $this->write($collection, $data);
    }

    public function upsert(string $collection, array $record, string $key = 'id'): void
    {
        $data = $this->all($collection);
        $found = false;
        foreach ($data as $i => $item) {
            if (($item[$key] ?? null) === ($record[$key] ?? null)) {
                $data[$i] = $record;
                $found = true;
                break;
            }
        }
        if (!$found) $data[] = $record;
        $this->write($collection, $data);
    }

    public function findById(string $collection, int $id): ?array
    {
        $data = $this->all($collection);
        foreach ($data as $item) if ((int)($item['id'] ?? 0) === $id) return $item;
        return null;
    }

    public function findOne(string $collection, callable $predicate): ?array
    {
        $data = $this->all($collection);
        foreach ($data as $item) if ($predicate($item)) return $item;
        return null;
    }

    public function filter(string $collection, callable $predicate): array
    {
        return array_values(array_filter($this->all($collection), $predicate));
    }

    public function nextId(string $collection): int
    {
        $max = 0;
        foreach ($this->all($collection) as $item) {
            $max = max($max, (int)($item['id'] ?? 0));
        }
        return $max + 1;
    }

    private function writeFile(string $path, array $data): void
    {
        $fp = fopen($path, 'c+');
        if (!$fp) throw new \RuntimeException('Cannot open file: ' . $path);
        try {
            if (!flock($fp, LOCK_EX)) throw new \RuntimeException('Cannot lock file: ' . $path);
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            fflush($fp);
            flock($fp, LOCK_UN);
        } finally {
            fclose($fp);
        }
    }
}
