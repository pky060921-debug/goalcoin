module contracts::goal_vault {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Coin};
    use sui::sui::SUI;

    // 📦 보증금을 보관할 금고 객체
    public struct GoalVault has key {
        id: UID,
        owner: address,
        balance: Coin<SUI>,
    }

    // 📥 [입구] 예치하기
    public entry fun deposit(coin: Coin<SUI>, ctx: &mut TxContext) {
        let vault = GoalVault {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            balance: coin,
        };
        transfer::transfer(vault, tx_context::sender(ctx));
    }

    // 📤 [출구] 출금하기 (새로 추가된 핵심 엔진!)
    public entry fun withdraw(vault: GoalVault, ctx: &mut TxContext) {
        // 1. 금고를 해체하여 안의 내용물을 꺼냅니다.
        let GoalVault { id, owner: _, balance } = vault;
        
        // 2. 텅 빈 금고 껍데기는 블록체인에서 완전히 파기합니다.
        object::delete(id);
        
        // 3. 금고 안에 있던 보증금(SUI)을 다시 유저의 지갑으로 쏴줍니다!
        transfer::public_transfer(balance, tx_context::sender(ctx));
    }
}
