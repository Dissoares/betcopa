<?php
declare(strict_types=1);

/**
 * Instancia o gateway de pagamento ativo com base na config `gateway_ativo`.
 * Suporta: mercadopago | expay
 */
class PaymentGatewayFactory
{
    public static function create(ConfigRepository $config): PaymentGatewayInterface
    {
        $gateway = $config->get('gateway_ativo', '');

        return match ($gateway) {
            'mercadopago' => self::makeMercadoPago($config),
            'expay'       => self::makeExpay($config),
            default       => throw new RuntimeException(
                'Gateway de pagamento não configurado. Acesse o painel admin → Configurações → Pagamento e selecione um gateway.'
            ),
        };
    }

    private static function makeMercadoPago(ConfigRepository $config): MercadoPagoGateway
    {
        $token = $config->get('mp_access_token', '');
        if ($token === '') {
            throw new RuntimeException('Mercado Pago: Access Token não configurado. Acesse Admin → Configurações → Pagamento.');
        }
        return new MercadoPagoGateway($token);
    }

    public static function createExpay(ConfigRepository $config): ExpayBrasilGateway
    {
        return self::makeExpay($config);
    }

    private static function makeExpay(ConfigRepository $config): ExpayBrasilGateway
    {
        $key = $config->get('expay_merchant_key', '');
        if ($key === '') {
            throw new RuntimeException('ExPay Brasil: Merchant Key não configurada. Acesse Admin → Configurações → Pagamento.');
        }
        $scheme  = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host    = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $notifUrl = "{$scheme}://{$host}/api/webhooks/expay";
        return new ExpayBrasilGateway($key, $notifUrl);
    }
}
