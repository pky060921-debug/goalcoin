module goal_coin::goal_vault {
    use sui::sui::SUI;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    const FEE_BPS: u64 = 300; // 3% 플랫폼 수수료
    const DIVISOR: u64 = 10000;

    public struct Vault has key {
        id: UID,
        ops_balance: Balance<SUI>,    // 운영비
        burn_balance: Balance<SUI>,   // 소각
        reward_balance: Balance<SUI>, // 리워드
    }

    public struct Goal has key {
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

    // 경고 해결: entry 제거하고 public만 사용
    public fun deposit(payment: Coin<SUI>, ctx: &mut TxContext) {
        let amount = coin::value(&payment);
        assert!(amount > 0, 0);

        let goal = Goal {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            deposit: coin::into_balance(payment),
        };
        transfer::transfer(goal, tx_context::sender(ctx));
    }

    // 경고 해결: 미사용 상수를 활용하는 환급 및 수수료 정산 로직 추가
    public fun complete_goal(
        vault: &mut Vault,
        goal: Goal,
        ctx: &mut TxContext
    ) {
        let Goal { id, owner: _, deposit: mut total_balance } = goal;
        object::delete(id);

        let total_amount = balance::value(&total_balance);
        let total_fee_amount = (total_amount * FEE_BPS) / DIVISOR;
        let refund_amount = total_amount - total_fee_amount;

        // 수수료 3등분 (각 1%씩)
        let share = total_fee_amount / 3;
        
        balance::join(&mut vault.ops_balance, balance::split(&mut total_balance, share));
        balance::join(&mut vault.burn_balance, balance::split(&mut total_balance, share));
        
        let remaining_fee = balance::value(&total_balance) - refund_amount;
        balance::join(&mut vault.reward_balance, balance::split(&mut total_balance, remaining_fee));

        // 97% 환급
        let refund_coin = coin::from_balance(balance::split(&mut total_balance, refund_amount), ctx);
        transfer::public_transfer(refund_coin, tx_context::sender(ctx));

        let dust = coin::from_balance(total_balance, ctx);
        transfer::public_transfer(dust, tx_context::sender(ctx));
    }
}
