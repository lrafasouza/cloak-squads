use anchor_lang::prelude::*;

use crate::instructions::{ExecuteWithLicense, InitCofre, IssueLicense, PayloadInvariants};

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

pub(crate) use instructions::execute_with_license::__client_accounts_execute_with_license;
pub(crate) use instructions::init_cofre::__client_accounts_init_cofre;
pub(crate) use instructions::issue_license::__client_accounts_issue_license;

declare_id!("WkzdQAdWRmab53mN83ayqiEc4E3gShTwgACBDkPbe4J");

#[program]
pub mod cloak_gatekeeper {
    use super::*;

    pub fn init_cofre(
        ctx: Context<InitCofre>,
        multisig: Pubkey,
        operator: Pubkey,
        view_key_public: [u8; 32],
    ) -> Result<()> {
        instructions::init_cofre::handler(ctx, multisig, operator, view_key_public)
    }

    pub fn issue_license(
        ctx: Context<IssueLicense>,
        payload_hash: [u8; 32],
        nonce: [u8; 16],
        ttl_secs: i64,
    ) -> Result<()> {
        instructions::issue_license::handler(ctx, payload_hash, nonce, ttl_secs)
    }

    pub fn execute_with_license(
        ctx: Context<ExecuteWithLicense>,
        invariants: PayloadInvariants,
        proof_bytes: [u8; 256],
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::execute_with_license::handler(ctx, invariants, proof_bytes, merkle_root)
    }
}
