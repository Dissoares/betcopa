<?php
declare(strict_types=1);

/**
 * Instancia o gateway de pagamento ativo.
 * Atualmente suporta: mercadopago
 */
class PaymentGatewayFactory
{
    public static function create(ConfigRepository $config): PaymentGatewayInterface
    {
        $token = $config->get('mp_access_token', '');
        if ($token === '') {
            throw new RuntimeException('Gateway de pagamento não configurado. Acesse o painel admin → Configurações → Pagamento e informe o Access Token do Mercado Pago.');
        }
        return new MercadoPagoGateway($token);
    }
}
