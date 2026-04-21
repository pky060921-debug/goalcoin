module goal_coin::goal_coin {
    use sui::coin::{Self, Coin};
    use sui::balance::Balance;
    use sui::sui::SUI;

    /// 목표 데이터를 담을 객체
    public struct Goal has key, store {
        id: UID,
        owner: address,
        description: vector<u8>, 
        target_amount: u64,      
        staked_sui: Balance<SUI>, 
        is_completed: bool,      
    }

    /// 1. 목표 생성 로직 (객체를 반환하여 결합성을 높임)
    public fun create_goal_logic(
        description: vector<u8>, 
        stake: Coin<SUI>, 
        ctx: &mut TxContext
    ): Goal {
        let sender = ctx.sender();
        let amount = stake.value();

        Goal {
            id: object::new(ctx),
            owner: sender,
            description,
            target_amount: amount,
            staked_sui: coin::into_balance(stake), 
            is_completed: false,
        }
    }

    /// 2. 실제 트랜잭션용 함수 (프론트엔드에서 호출할 지점)
    public entry fun create_goal(
        description: vector<u8>, 
        stake: Coin<SUI>, 
        ctx: &mut TxContext
    ) {
        let goal = create_goal_logic(description, stake, ctx);
        let sender = ctx.sender();
        // 생성된 객체를 보낸 사람에게 전송
        transfer::public_transfer(goal, sender);
    }

    /// 3. 목표 달성 및 보증금 반환
    public entry fun claim_refund(
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

        let return_coin = coin::from_balance(staked_sui, ctx);
        transfer::public_transfer(return_coin, owner);

        id.delete();
    }
}
