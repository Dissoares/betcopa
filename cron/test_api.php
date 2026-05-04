<?php
/**
 * Acesse no browser: http://localhost/betcopa/cron/test_api.php
 * Mostra o status da conexão com a API-Football.
 */
define('ROOT', dirname(__DIR__));
$config = require ROOT . '/src/config.php';

$apiKey = $config['api_football']['key'] ?? '';

echo "<pre>\n";
echo "API Key: " . (empty($apiKey) ? '❌ NÃO CONFIGURADA' : substr($apiKey, 0, 8) . '...') . "\n\n";

// Testa conectividade básica
$ch = curl_init('https://v3.football.api-sports.io/status');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER     => ["x-apisports-key: {$apiKey}"],
    CURLOPT_SSL_VERIFYPEER => false, // Laragon pode ter problemas com SSL
]);
$raw    = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err    = curl_error($ch);
curl_close($ch);

if ($err) {
    echo "❌ Erro cURL: {$err}\n";
} elseif ($status !== 200) {
    echo "❌ HTTP {$status}\n{$raw}\n";
} else {
    $data = json_decode($raw, true);
    $account = $data['response']['account'] ?? null;
    $sub     = $data['response']['subscription'] ?? null;
    $req     = $data['response']['requests'] ?? null;

    echo "✅ Conectado!\n\n";
    if ($account) echo "Conta: {$account['email']} ({$account['plan']})\n";
    if ($sub)     echo "Plano: {$sub['plan']} — expira {$sub['end']}\n";
    if ($req)     echo "Requisições: {$req['current']}/{$req['limit_day']} hoje\n";
}

echo "\n</pre>";
