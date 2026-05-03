<?php
return [
    'db' => [
        'driver' => 'mysql',
        'host' => '127.0.0.1',
        'dbname' => 'betcopa',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],
    'limits' => [
        'max_gain_per_bet' => 5000.00,
        'max_bet_value' => 500.00,
    ],
    'admin_email' => 'admin@betcopa.local',
];