<?php
class GameController
{
    private GameService $service;
    private GameRepository $repository;
    private BetService $bets;

    public function __construct(GameService $service, GameRepository $repository, BetService $bets)
    {
        $this->service = $service;
        $this->repository = $repository;
        $this->bets = $bets;
    }

    public function list(): void
    {
        $jogos = $this->service->listGames();
        jsonResponse(['jogos' => $jogos]);
    }

    public function create(): void
    {
        Csrf::verify();
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $id = $this->service->createGame($body);
        jsonResponse(['id' => $id]);
    }

    public function result(int $id): void
    {
        Csrf::verify();
        $body = json_decode(file_get_contents('php://input'), true) ?: [];
        $casa = (int) ($body['placar_casa'] ?? 0);
        $fora = (int) ($body['placar_fora'] ?? 0);
        $this->service->setResult($id, $casa, $fora);
        $this->bets->processResult($id);
        jsonResponse(['message' => 'Resultado inserido e apostas processadas']);
    }
}
