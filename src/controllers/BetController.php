<?php
class BetController
{
    private BetService $service;
    private BetRepository $repository;
    private ConfigRepository $configRepo;

    public function __construct(BetService $service, BetRepository $repository, ConfigRepository $configRepo)
    {
        $this->service    = $service;
        $this->repository = $repository;
        $this->configRepo = $configRepo;
    }

    public function list(): void
    {
        $userId = ensureLogged();
        jsonResponse(['apostas' => $this->repository->listByUser($userId)]);
    }

    public function create(): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $body   = json_decode(file_get_contents('php://input'), true) ?: [];

        $bet = $this->service->createBet(
            $userId,
            (int) ($body['jogo_id']      ?? 0),
            (int) ($body['placar_casa']  ?? 0),
            (int) ($body['placar_fora']  ?? 0),
            (int) ($body['multiplicador'] ?? 5)
        );

        jsonResponse(['aposta' => $bet], 201);
    }

    public function pay(int $id): void
    {
        Csrf::verify();
        $userId  = ensureLogged();
        $gateway = PaymentGatewayFactory::create($this->configRepo);
        $data    = $this->service->payBet($userId, $id, $gateway);
        jsonResponse(array_merge(['message' => 'Cobrança PIX criada'], $data));
    }

    public function confirm(int $id): void
    {
        Csrf::verify();
        $userId  = ensureLogged();
        $gateway = PaymentGatewayFactory::create($this->configRepo);
        $this->service->confirmPayment($userId, $id, $gateway);
        jsonResponse(['message' => 'Aposta confirmada']);
    }
}
