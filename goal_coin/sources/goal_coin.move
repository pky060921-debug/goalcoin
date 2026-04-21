module goal_coin::goal_coin {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance}; // 코인 보관을 위해 Balance 추가
    use sui::sui::SUI;

    /// 목표 데이터를 담을 객체
    public struct Goal has key, store {
        id: UID,
        owner: address,
        description: vector<u8>, 
        target_amount: u64,      
        staked_sui: Balance<SUI>, // Coin 대신 더 가벼운 Balance를 사용합니다.
        is_completed: bool,      
    }

    /// 1. 목표 설정 및 SUI 예치 함수
    public fun create_goal(
        description: vector<u8>, 
        stake: Coin<SUI>, 
        ctx: &mut TxContext
    ) {
        let sender = ctx.sender();
        let amount = stake.value();

        let new_goal = Goal {
            id: object::new(ctx),
            owner: sender,
            description,
            target_amount: amount,
            // 전달받은 Coin을 Balance로 변환하여 보관합니다.
            staked_sui: coin::into_balance(stake), 
            is_completed: false,
        };

        transfer::public_transfer(new_goal, sender);
    }

    /// 2. 목표 달성 및 보증금 반환
    public fun claim_refund(
        goal: Goal, 
        ctx: &mut TxContext
    ) {
        let Goal { 
            id, 
            owner, 
            description: _, 
            target_amount: _, 
            staked_sui, 
            is_completed: _ 
        } = goal;

        // Balance를 다시 Coin으로 변환하여 주인에게 돌려줍니다.
        let return_coin = coin::from_balance(staked_sui, ctx);
        transfer::public_transfer(return_coin, owner);

        id.delete();
    }
}
