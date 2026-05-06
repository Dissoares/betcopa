<?php
declare(strict_types=1);

/**
 * Instancia o gateway configurado em `configuracoes.gateway_ativo`.
 * Para trocar de gateway: UPDATE configuracoes SET valor='mercadopago' WHERE chave='gateway_ativo'
 */
class PaymentGatewayFactory
{
    public static function create(ConfigRepository $config): PaymentGatewayInterface
    {
        $gateway = $config->get('gateway_ativo', 'simulado');

        return match ($gateway) {
            'mercadopago' => new MercadoPagoGateway($config->get('mp_access_token', '')),
            default       => new SimulatedGateway(),
        };
    }
}
