module goal_coin::goal_vault {
    use sui::sui::SUI;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    const FEE_BPS: u64 = 300; // 3% 플랫폼 수수료
    const DIVISOR: u64 = 10000;

    struct Vault has key {
        id: UID,
        ops_balance: Balance<SUI>,    // 운영비
        burn_balance: Balance<SUI>,   // 소각
        reward_balance: Balance<SUI>, // 리워드
    }

    struct Goal has key {
        id: UID,
        owner: address,
        deposit: Balance<SUI>,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(Vault {
            id: object::new(ctx),
            ops_balance: balance::zero(),
            burn_balance: balance::zero(),
            reward_balance: balance::zero(),
        });
    }

    public entry fun deposit(payment: Coin<SUI>, ctx: &mut TxContext) {
        let amount = coin::value(&payment);
        assert!(amount > 0, 0);

        let goal = Goal {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            deposit: coin::into_balance(payment),
        };
        transfer::transfer(goal, tx_context::sender(ctx));
    }
}
