module goal_coin::goal {
    use std::option;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::url::{Self, Url};

    // OTW (One Time Witness): 코인 초기화용 고유 구조체
    public struct GOAL has drop {}

    // 모듈 배포 시 단 한 번 실행되는 초기화 함수
    fun init(witness: GOAL, ctx: &mut TxContext) {
        // GOAL 코인 생성 (Decimals: 9)
        let (treasury_cap, metadata) = coin::create_currency<GOAL>(
            witness,
            9, 
            b"GOAL", 
            b"Goal Coin", 
            b"Proof of Effort: Reward for BlankD", 
            option::some<Url>(url::new_unsafe_from_bytes(b"https://blankd.top/logo.png")), 
            ctx
        );

        // 코인의 이름, 심볼 등 기본 메타데이터 동결 (위변조 방지)
        transfer::public_freeze_object(metadata);

        // 💡 핵심: 무한 발행을 막기 위해 발행 권한(TreasuryCap)을 배포자(설계자의 백엔드 지갑)에게 귀속시킴
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }

    // 🎁 백엔드가 유저의 목표 달성을 확인했을 때 보상을 지급하는 함수
    public entry fun mint_reward(
        treasury_cap: &mut TreasuryCap<GOAL>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        coin::mint_and_transfer(treasury_cap, amount, recipient, ctx);
    }

    // 🔥 게임파이 요소 (방어막 구매, NFT 합성 등)를 위한 소각 함수
    public entry fun burn_coin(
        treasury_cap: &mut TreasuryCap<GOAL>,
        coin: Coin<GOAL>,
        _ctx: &mut TxContext
    ) {
        coin::burn(treasury_cap, coin);
    }
}
