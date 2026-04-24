use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

declare_id!("2G3UEzSaWdqk6g2KPfeDWaQUcDqnpjynXX5wnWzw4YKE");

#[program]
pub mod cloak_gatekeeper {
    use super::*;

    pub fn init_cofre(
        ctx: Context<instructions::InitCofre>,
        multisig: Pubkey,
        operator: Pubkey,
        view_key_public: [u8; 32],
    ) -> Result<()> {
        instructions::init_cofre::handler(ctx, multisig, operator, view_key_public)
    }

    pub fn issue_license(
        ctx: Context<instructions::IssueLicense>,
        payload_hash: [u8; 32],
        nonce: [u8; 16],
        ttl_secs: i64,
    ) -> Result<()> {
        instructions::issue_license::handler(ctx, payload_hash, nonce, ttl_secs)
    }

    pub fn execute_with_license(
        ctx: Context<instructions::ExecuteWithLicense>,
        invariants: instructions::PayloadInvariants,
        proof_bytes: [u8; 256],
        merkle_root: [u8; 32],
    ) -> Result<()> {
        instructions::execute_with_license::handler(ctx, invariants, proof_bytes, merkle_root)
    }
}
