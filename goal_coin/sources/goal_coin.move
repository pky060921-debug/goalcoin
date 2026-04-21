module goal_coin::goal_coin {
    use sui::object::{Self, UID};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    /// 목표 데이터를 담을 객체
    public struct Goal has key, store {
        id: UID,
        owner: address,
        description: vector<u8>, 
        target_amount: u64,      
        staked_sui: Coin<SUI>,   
        is_completed: bool,      
    }

    /// 1. 목표 설정 및 SUI 예치 함수
    public entry fun create_goal(
        description: vector<u8>, 
        stake: Coin<SUI>, 
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let amount = coin::value(&stake);

        let new_goal = Goal {
            id: object::new(ctx),
            owner: sender,
            description,
            target_amount: amount,
            staked_sui: stake, 
            is_completed: false,
        };

        transfer::public_transfer(new_goal, sender);
    }

    /// 2. 목표 달성 및 보증금 반환
    public entry fun claim_refund(
        goal: Goal, 
        ctx: &mut TxContext
    ) {
        let Goal { id, owner, description: _, target_amount: _, staked_sui, is_completed: _ } = goal;
        transfer::public_transfer(staked_sui, owner);
        object::delete(id);
    }
}
