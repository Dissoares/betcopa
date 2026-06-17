<?php
class ReferralController
{
    private UserRepository $users;
    private TransactionRepository $transactions;
    private ConfigRepository $config;

    public function __construct(
        UserRepository $users,
        TransactionRepository $transactions,
        ConfigRepository $config
    ) {
        $this->users        = $users;
        $this->transactions = $transactions;
        $this->config       = $config;
    }

    public function info(): void
    {
        requireLogin();
        $userId = (int) $_SESSION['user_id'];

        $code     = $this->users->ensureReferralCode($userId);
        $count    = $this->users->countReferrals($userId);
        $bonusPer = (float) $this->config->get('bonus_indicacao', '10');

        jsonResponse([
            'code'           => $code,
            'referral_count' => $count,
            'bonus_per'      => $bonusPer,
            'total_earned'   => round($count * $bonusPer, 2),
        ]);
    }
}
