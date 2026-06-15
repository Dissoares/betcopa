<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');

$config = require __DIR__ . '/../src/config.php';
$dbcfg = $config['db'];

try {
    $dsn = sprintf('%s:host=%s;charset=%s', $dbcfg['driver'], $dbcfg['host'], $dbcfg['charset']);
    $pdo = new PDO($dsn, $dbcfg['user'], $dbcfg['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    $sql = file_get_contents(__DIR__ . '/../sql/schema.sql');
    if ($sql === false) {
        throw new RuntimeException('Não foi possível ler o arquivo sql/schema.sql');
    }

    $stmts = array_filter(array_map('trim', preg_split('/;\s*\n/', $sql)));
    foreach ($stmts as $stmt) {
        if ($stmt === '' || str_starts_with($stmt, '--')) {
            continue;
        }
        $pdo->exec($stmt);
    }

    $message = 'Instalação concluída com sucesso. Agora acesse <a href="/">a página inicial</a>.';
} catch (Throwable $e) {
    $message = 'Erro na instalação: ' . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8');
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>

<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-405Z6HMN1Z"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-405Z6HMN1Z');
</script>


  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Instalação BetCopa</title>
  <style>
    body { font-family: Arial, sans-serif; background:#03102a; color:#f4f7ff; margin:0; padding:2rem; }
    .box { max-width: 720px; margin:0 auto; background:#0f1a39; padding:2rem; border-radius:18px; border:1px solid rgba(255,255,255,.08); }
    a { color:#68b7ff; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Instalação BetCopa</h1>
    <p><?php echo $message; ?></p>
  </div>
</body>
</html>
