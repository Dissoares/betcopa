<?php
/**
 * Copie este arquivo para config.php e preencha com seus dados.
 * NÃO versione o config.php real (ele está no .gitignore).
 */
return [
    'db' => [
        'driver'  => 'mysql',
        'host'    => '127.0.0.1',
        'dbname'  => 'betcopa',
        'user'    => 'root',
        'pass'    => '',
        'charset' => 'utf8mb4',
    ],
    'limits' => [
        'max_gain_per_bet' => 5000.00,
        'max_bet_value'    => 500.00,
    ],
    'admin_email'  => 'admin@betcopa.local',
    'api_football' => [
        'key'      => '',   // Cole aqui sua chave de api-sports.io
        'timezone' => 'America/Sao_Paulo',
    ],
];
