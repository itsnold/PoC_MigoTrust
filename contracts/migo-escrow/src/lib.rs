#![no_std]
//! MIGO Protect — trust escrow for local-service missions on Stellar testnet.
//!
//! A client locks XLM into escrow for a "mission" (an errand, repair, cleaning
//! job, etc.) performed by a provider. Both parties sign off; once both confirm,
//! anyone may call `release` and the contract pays the provider. Either party may
//! raise a dispute, which freezes the funds (no on-chain adjudication in the MVP).

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token::Client as TokenClient,
    Address, BytesN, Env, Symbol,
};

/// Snapshot of a mission, returned to the frontend.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Mission {
    pub id: u64,
    pub client: Address,
    pub provider: Address,
    pub amount: i128, // stroops of the escrow token (XLM)
    pub terms_hash: BytesN<32>,
    pub client_confirmed: bool,
    pub provider_confirmed: bool,
    pub status: Status,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Status {
    /// Funds locked in escrow; awaiting confirmations.
    Funded = 0,
    /// Both parties confirmed; ready to release.
    Ready = 1,
    /// Funds paid to provider.
    Released = 2,
    /// Frozen pending off-chain resolution.
    Disputed = 3,
}

/// Instance + persistent storage keys.
#[contracttype]
pub enum DataKey {
    Token,        // Address of the escrow token (testnet XLM SAC) — instance
    NextId,       // u64 counter for mission ids — instance
    Mission(u64), // Mission record — persistent
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    MissionNotFound = 5,
    NotAuthorized = 6,
    AlreadyConfirmed = 7,
    NotBothConfirmed = 8,
    NotReleasable = 9,
}

#[contract]
pub struct MigoEscrowContract;

#[contractimpl]
impl MigoEscrowContract {
    /// Set the escrow token (testnet XLM SAC). Callable once.
    pub fn init(env: Env, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Token) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        env.storage().instance().extend_ttl(1000, 5000);
        Ok(())
    }

    /// Client opens a mission: locks `amount` of the escrow token from `client`
    /// into the contract. The client must authorise this call (and the implicit
    /// SAC transfer sub-invoke). Returns the new mission id.
    pub fn open(
        env: Env,
        client: Address,
        provider: Address,
        amount: i128,
        terms_hash: BytesN<32>,
    ) -> Result<u64, Error> {
        client.require_auth();

        let token = Self::token(&env)?;
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        // Pull funds from the client into the contract.
        TokenClient::new(&env, &token).transfer(&client, &env.current_contract_address(), &amount);

        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .ok_or(Error::NotInitialized)?;
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        let now = env.ledger().timestamp();
        let mission = Mission {
            id,
            client: client.clone(),
            provider: provider.clone(),
            amount,
            terms_hash,
            client_confirmed: false,
            provider_confirmed: false,
            status: Status::Funded,
            created_at: now,
        };
        env.storage().persistent().set(&DataKey::Mission(id), &mission);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Mission(id), 100, 5000);

        env.events().publish(
            (Symbol::new(&env, "open"), id),
            (client, provider, amount),
        );

        Ok(id)
    }

    /// A party confirms the mission is complete. `by` must be the client or provider.
    pub fn confirm(env: Env, id: u64, by: Address) -> Result<(), Error> {
        by.require_auth();

        let mut mission: Mission = env
            .storage()
            .persistent()
            .get(&DataKey::Mission(id))
            .ok_or(Error::MissionNotFound)?;

        if mission.status != Status::Funded && mission.status != Status::Ready {
            return Err(Error::NotReleasable);
        }

        let is_client = by == mission.client;
        let is_provider = by == mission.provider;
        if !is_client && !is_provider {
            return Err(Error::NotAuthorized);
        }

        if is_client {
            if mission.client_confirmed {
                return Err(Error::AlreadyConfirmed);
            }
            mission.client_confirmed = true;
        }
        if is_provider {
            if mission.provider_confirmed {
                return Err(Error::AlreadyConfirmed);
            }
            mission.provider_confirmed = true;
        }

        if mission.client_confirmed && mission.provider_confirmed {
            mission.status = Status::Ready;
        }

        env.storage().persistent().set(&DataKey::Mission(id), &mission);

        env.events().publish(
            (Symbol::new(&env, "confirm"), id),
            (mission.client, mission.provider, mission.amount),
        );

        Ok(())
    }

    /// Release the escrowed funds to the provider. Callable by anyone once both
    /// parties have confirmed. The contract authorises its own SAC transfer.
    pub fn release(env: Env, id: u64) -> Result<(), Error> {
        let mission: Mission = env
            .storage()
            .persistent()
            .get(&DataKey::Mission(id))
            .ok_or(Error::MissionNotFound)?;

        if mission.status != Status::Ready {
            return Err(Error::NotBothConfirmed);
        }

        let token = Self::token(&env)?;
        TokenClient::new(&env, &token)
            .transfer(&env.current_contract_address(), &mission.provider, &mission.amount);

        let mut updated = mission.clone();
        updated.status = Status::Released;
        env.storage().persistent().set(&DataKey::Mission(id), &updated);

        env.events().publish(
            (Symbol::new(&env, "release"), id),
            (mission.client, mission.provider, mission.amount),
        );

        Ok(())
    }

    /// Either party raises a dispute; funds freeze (no adjudication in MVP).
    pub fn dispute(env: Env, id: u64, by: Address) -> Result<(), Error> {
        by.require_auth();

        let mut mission: Mission = env
            .storage()
            .persistent()
            .get(&DataKey::Mission(id))
            .ok_or(Error::MissionNotFound)?;

        if mission.status == Status::Released || mission.status == Status::Disputed {
            return Err(Error::NotReleasable);
        }
        if by != mission.client && by != mission.provider {
            return Err(Error::NotAuthorized);
        }

        mission.status = Status::Disputed;
        env.storage().persistent().set(&DataKey::Mission(id), &mission);

        env.events().publish(
            (Symbol::new(&env, "dispute"), id),
            (mission.client, mission.provider, mission.amount),
        );

        Ok(())
    }

    /// Read-only: fetch a mission by id.
    pub fn get_mission(env: Env, id: u64) -> Result<Mission, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Mission(id))
            .ok_or(Error::MissionNotFound)
    }

    fn token(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(Error::NotInitialized)
    }
}

mod test;
