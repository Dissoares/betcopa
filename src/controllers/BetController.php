<?php
class BetController
{
    private BetService $service;
    private BetRepository $repository;

    public function __construct(BetService $service, BetRepository $repository)
    {
        $this->service    = $service;
        $this->repository = $repository;
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
        $userId = ensureLogged();
        $this->service->payBet($userId, $id);
        jsonResponse(['message' => 'Pagamento marcado']);
    }

    public function confirm(int $id): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $this->service->confirmPayment($userId, $id);
        jsonResponse(['message' => 'Aposta confirmada']);
    }
}
