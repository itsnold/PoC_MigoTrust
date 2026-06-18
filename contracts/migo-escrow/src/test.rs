#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

// Register a mock Stellar Asset Contract so we can test real token transfers.
fn setup(env: &Env) -> (Address, MigoEscrowContractClient<'_>, Address, TokenClient<'_>) {
    let token_admin = Address::generate(env);
    // register_stellar_asset_contract_v2 returns a StellarAssetContract struct.
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token = TokenClient::new(env, &token_id);

    // Deploy the escrow contract.
    let contract_id = env.register(MigoEscrowContract, ());
    let client = MigoEscrowContractClient::new(env, &contract_id);

    // Initialise with the token address (the SAC contract id).
    client.init(&token_id);

    (contract_id, client, token_id, token)
}

// Use the StellarAssetClient to mint (classic asset issuer privilege).
fn mint(env: &Env, token_id: &Address, to: &Address, amount: i128) {
    let sac = StellarAssetClient::new(env, token_id);
    sac.mint(to, &amount);
}

fn dummy_terms(env: &Env) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0] = 1;
    BytesN::from_array(env, &bytes)
}

#[test]
fn init_sets_token() {
    let env = Env::default();
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let contract_id = env.register(MigoEscrowContract, ());
    let client = MigoEscrowContractClient::new(&env, &contract_id);
    client.init(&token_id);
    // Re-init should fail.
    assert_eq!(client.try_init(&token_id), Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn open_locks_funds_and_returns_id() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, client, token_id, token) = setup(&env);

    let client_addr = Address::generate(&env);
    let provider = Address::generate(&env);

    // Fund the client with 1000 units.
    mint(&env, &token_id, &client_addr, 1000);

    let id = client.open(&client_addr, &provider, &500, &dummy_terms(&env));

    assert_eq!(id, 1);
    // Client balance reduced; contract holds the funds.
    assert_eq!(token.balance(&client_addr), 500);
    assert_eq!(token.balance(&contract_id), 500);

    let mission = client.get_mission(&1);
    assert_eq!(mission.client, client_addr);
    assert_eq!(mission.provider, provider);
    assert_eq!(mission.amount, 500);
    assert_eq!(mission.status, Status::Funded);
    assert!(!mission.client_confirmed);
    assert!(!mission.provider_confirmed);
}

#[test]
fn both_confirm_then_release_pays_provider() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, client, token_id, token) = setup(&env);

    let client_addr = Address::generate(&env);
    let provider = Address::generate(&env);

    mint(&env, &token_id, &client_addr, 1000);

    let _id = client.open(&client_addr, &provider, &500, &dummy_terms(&env));

    // Confirm from both parties.
    client.confirm(&1, &client_addr);
    client.confirm(&1, &provider);

    let mission = client.get_mission(&1);
    assert_eq!(mission.status, Status::Ready);

    // Release — callable by anyone.
    client.release(&1);

    assert_eq!(token.balance(&provider), 500);
    assert_eq!(token.balance(&contract_id), 0);

    let mission = client.get_mission(&1);
    assert_eq!(mission.status, Status::Released);
}

#[test]
fn release_before_both_confirmed_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_contract_id, client, token_id, _token) = setup(&env);

    let client_addr = Address::generate(&env);
    let provider = Address::generate(&env);

    mint(&env, &token_id, &client_addr, 1000);

    let _id = client.open(&client_addr, &provider, &500, &dummy_terms(&env));

    // Only client confirms.
    client.confirm(&1, &client_addr);
    assert_eq!(client.try_release(&1), Err(Ok(Error::NotBothConfirmed)));
}

#[test]
fn dispute_freezes_funds() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, client, token_id, token) = setup(&env);

    let client_addr = Address::generate(&env);
    let provider = Address::generate(&env);

    mint(&env, &token_id, &client_addr, 1000);

    let _id = client.open(&client_addr, &provider, &500, &dummy_terms(&env));

    // Provider disputes.
    client.dispute(&1, &provider);

    let mission = client.get_mission(&1);
    assert_eq!(mission.status, Status::Disputed);

    // Release should now fail.
    assert_eq!(client.try_release(&1), Err(Ok(Error::NotBothConfirmed)));
    // Funds still locked in the contract.
    assert_eq!(token.balance(&contract_id), 500);
}

#[test]
fn non_party_cannot_confirm() {
    let env = Env::default();
    env.mock_all_auths();
    let (_contract_id, client, token_id, _token) = setup(&env);

    let client_addr = Address::generate(&env);
    let provider = Address::generate(&env);
    let stranger = Address::generate(&env);

    mint(&env, &token_id, &client_addr, 1000);

    let _id = client.open(&client_addr, &provider, &500, &dummy_terms(&env));

    assert_eq!(
        client.try_confirm(&1, &stranger),
        Err(Ok(Error::NotAuthorized))
    );
}

#[test]
fn rejects_non_positive_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let (_contract_id, client, token_id, _token) = setup(&env);

    let client_addr = Address::generate(&env);
    let provider = Address::generate(&env);

    mint(&env, &token_id, &client_addr, 1000);

    assert_eq!(
        client.try_open(&client_addr, &provider, &0, &dummy_terms(&env)),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        client.try_open(&client_addr, &provider, &-5, &dummy_terms(&env)),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn double_confirm_fails() {
    let env = Env::default();
    env.mock_all_auths();
    let (_contract_id, client, token_id, _token) = setup(&env);

    let client_addr = Address::generate(&env);
    let provider = Address::generate(&env);

    mint(&env, &token_id, &client_addr, 1000);

    let _id = client.open(&client_addr, &provider, &500, &dummy_terms(&env));
    client.confirm(&1, &client_addr);
    assert_eq!(
        client.try_confirm(&1, &client_addr),
        Err(Ok(Error::AlreadyConfirmed))
    );
}

#[test]
fn get_mission_missing_fails() {
    let env = Env::default();
    let (_contract_id, client, _token_id, _token) = setup(&env);
    assert_eq!(client.try_get_mission(&999), Err(Ok(Error::MissionNotFound)));
}
