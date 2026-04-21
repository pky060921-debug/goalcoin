module goal_coin::goal {
    use std::option;
    use sui::coin::{Self, TreasuryCap};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    // OTW(One-Time Witness): 모듈 이름과 동일한 대문자 구조체. 단 한 번만 생성됩니다.
    public struct GOAL has drop {}

    // 모듈이 배포될 때 최초로 1번만 실행되는 초기화 함수
    fun init(witness: GOAL, ctx: &mut TxContext) {
        // 코인의 메타데이터(이름, 심볼, 소수점 등)와 발행 권한(TreasuryCap) 생성
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            9, // 소수점 (SUI와 동일)
            b"GOAL", // 코인 심볼
            b"Goal Coin", // 코인 이름
            b"Proof of Effort Reward Token", // 설명
            option::none(), // 로고 이미지 URL (나중에 추가 가능)
            ctx
        );

        // 메타데이터는 누구나 볼 수 있도록 동결(Freeze)하여 공유
        transfer::public_freeze_object(metadata);
        
        // 코인을 발행(Mint)할 수 있는 조폐 권한(TreasuryCap)을 배포자(관리자)에게 전달
        transfer::public_transfer(treasury_cap, tx_context::sender(ctx));
    }
}
