<?php
class BetController
{
    private BetService $service;
    private BetRepository $repository;
    private TransactionRepository $transactions;
    private UserRepository $users;

    public function __construct(BetService $service, BetRepository $repository, TransactionRepository $transactions, UserRepository $users)
    {
        $this->service = $service;
        $this->repository = $repository;
        $this->transactions = $transactions;
        $this->users = $users;
    }

    public function list(): void
    {
        $userId = ensureLogged();
        $apostas = $this->repository->listByUser($userId);
        jsonResponse(['apostas' => $apostas]);
    }

    public function create(): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $bet = $this->service->createBet($userId, (int)($body['jogo_id'] ?? 0), (int)($body['placar_casa'] ?? 0), (int)($body['placar_fora'] ?? 0), (float) ($body['valor'] ?? 0));
        jsonResponse(['aposta' => $bet], 201);
    }

    public function pay(int $id): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $this->service->payBet($userId, $id);
        jsonResponse(['message' => 'Pagamento marcado como pago']);
    }

    public function confirm(int $id): void
    {
        Csrf::verify();
        $userId = ensureLogged();
        $this->service->confirmPayment($userId, $id);
        jsonResponse(['message' => 'Pagamento confirmado e aposta registrada']);
    }
}
