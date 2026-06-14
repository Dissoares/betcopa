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
        $page   = max(1, (int) ($_GET['page']  ?? 1));
        $limit  = max(5,  min(50, (int) ($_GET['limit'] ?? 10)));
        jsonResponse([
            'apostas' => $this->repository->listByUser($userId, $page, $limit),
            'total'   => $this->repository->countByUser($userId),
            'page'    => $page,
            'limit'   => $limit,
        ]);
    }

    public function create(): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $body   = json_decode(file_get_contents('php://input'), true) ?: [];

        $bet = $this->service->createBet(
            $userId,
            (int)   ($body['jogo_id']     ?? 0),
            (int)   ($body['placar_casa'] ?? 0),
            (int)   ($body['placar_fora'] ?? 0),
            (float) ($body['valor']       ?? 50.0)
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

    public function payWithBalance(int $id): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $this->service->payBetWithBalance($userId, $id);
        jsonResponse(['message' => 'Aposta confirmada com saldo']);
    }
}
