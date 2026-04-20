#[test_only]
module goal_coin::goal_vault_tests {
    use sui::test_scenario;
    use sui::coin;
    use sui::sui::SUI;
    use goal_coin::goal_vault::{Self, Goal};

    #[test]
    fun test_user_deposit() {
        // 가상의 유저 지갑 주소 생성
        let user = @0xAAAA; 
        
        // 테스트 시나리오 시작
        let mut scenario = test_scenario::begin(user);

        // [트랜잭션 1] 유저가 10,000 코인 예치 실행
        test_scenario::next_tx(&mut scenario, user);
        {
            let ctx = test_scenario::ctx(&mut scenario);
            // 가짜(Test용) 코인 10,000개 생성
            let payment = coin::mint_for_testing<SUI>(10000, ctx);
            
            // 예치 함수 실행
            goal_vault::deposit(payment, ctx);
        }

        // [트랜잭션 2] Goal 객체가 유저에게 정상적으로 발급되었는지 검증
        test_scenario::next_tx(&mut scenario, user);
        {
            // 유저의 소유물 중 Goal 객체가 있는지 확인 (없으면 시스템 에러로 간주하고 테스트 실패)
            let goal = test_scenario::take_from_sender<Goal>(&scenario);
            
            // 확인 완료 후 객체를 다시 돌려놓고 시나리오 종료
            test_scenario::return_to_sender(&scenario, goal);
        }

        test_scenario::end(scenario);
    }
}
