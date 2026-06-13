<?php
return [
    'db' => [
        'driver'  => 'mysql',
        'host'    => '127.0.0.1',
        'dbname'  => 'srawnhvz_placaronline',
        'user'    => 'srawnhvz_placaronline',
        'pass'    => '@Dantas22',
        'charset' => 'utf8mb4',
    ],
    'limits' => [
        'max_gain_per_bet' => 5000.00,
        'max_bet_value'    => 500.00,
    ],
    'admin_email'  => 'admin@betcopa.local',
    'api_football' => [
        'key'      => '049407ce78214043b2e3b2307a493e68',   // football-data.org
        'timezone' => 'America/Sao_Paulo',
    ],
];
