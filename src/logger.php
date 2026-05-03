<?php
class Logger
{
    private const FILE = __DIR__ . '/../logs/app.log';

    public static function info(string $message, array $context = []): void
    {
        self::write('INFO', $message, $context);
    }

    public static function error(string $message, array $context = []): void
    {
        self::write('ERROR', $message, $context);
    }

    private static function write(string $level, string $message, array $context = []): void
    {
        $timestamp = date('Y-m-d H:i:s');
        $line = sprintf("[%s] %s: %s %s\n", $timestamp, $level, $message, json_encode($context, JSON_UNESCAPED_UNICODE));
        @file_put_contents(self::FILE, $line, FILE_APPEND | LOCK_EX);
    }
}
