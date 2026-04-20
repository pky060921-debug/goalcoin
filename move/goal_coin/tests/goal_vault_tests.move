#[test_only]
module goal_coin::goal_vault_tests {
    use sui::test_scenario;
    use sui::coin;
    use sui::sui::SUI;
    use goal_coin::goal_vault::{Self, Goal};

    #[test]
    fun test_user_deposit() {
        let user = @0xAAAA; 
        let mut scenario = test_scenario::begin(user);

        test_scenario::next_tx(&mut scenario, user);
        {
            let ctx = test_scenario::ctx(&mut scenario);
            let payment = coin::mint_for_testing<SUI>(10000, ctx);
            goal_vault::deposit(payment, ctx);
        };

        test_scenario::next_tx(&mut scenario, user);
        {
            let goal = test_scenario::take_from_sender<Goal>(&scenario);
            test_scenario::return_to_sender(&scenario, goal);
        };

        test_scenario::end(scenario);
    }
}
