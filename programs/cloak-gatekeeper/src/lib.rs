use anchor_lang::prelude::*;

use crate::instructions::{
    AddSignerView, CloseExpiredLicense, EmergencyCloseLicense, ExecuteWithLicense, InitCofre,
    InitViewDistribution, IssueLicense, PayloadInvariants, RemoveSignerView, RevokeAudit,
    SetOperator,
};

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

pub(crate) use instructions::add_signer_view::__client_accounts_add_signer_view;
pub(crate) use instructions::close_expired_license::__client_accounts_close_expired_license;
pub(crate) use instructions::emergency_close_license::__client_accounts_emergency_close_license;
pub(crate) use instructions::execute_with_license::__client_accounts_execute_with_license;
pub(crate) use instructions::init_cofre::__client_accounts_init_cofre;
pub(crate) use instructions::init_view_distribution::__client_accounts_init_view_distribution;
pub(crate) use instructions::issue_license::__client_accounts_issue_license;
pub(crate) use instructions::remove_signer_view::__client_accounts_remove_signer_view;
pub(crate) use instructions::revoke_audit::__client_accounts_revoke_audit;
pub(crate) use instructions::set_operator::__client_accounts_set_operator;

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

    pub fn init_view_distribution(ctx: Context<InitViewDistribution>) -> Result<()> {
        instructions::init_view_distribution::handler(ctx)
    }

    pub fn add_signer_view(
        ctx: Context<AddSignerView>,
        signer: Pubkey,
        ephemeral_pk: [u8; 32],
        nonce: [u8; 24],
        ciphertext: [u8; 48],
    ) -> Result<()> {
        instructions::add_signer_view::handler(ctx, signer, ephemeral_pk, nonce, ciphertext)
    }

    pub fn remove_signer_view(ctx: Context<RemoveSignerView>, target: Pubkey) -> Result<()> {
        instructions::remove_signer_view::handler(ctx, target)
    }

    pub fn close_expired_license(ctx: Context<CloseExpiredLicense>) -> Result<()> {
        instructions::close_expired_license::handler(ctx)
    }

    pub fn emergency_close_license(ctx: Context<EmergencyCloseLicense>) -> Result<()> {
        instructions::emergency_close_license::handler(ctx)
    }

    pub fn revoke_audit(ctx: Context<RevokeAudit>, diversifier_trunc: [u8; 16]) -> Result<()> {
        instructions::revoke_audit::handler(ctx, diversifier_trunc)
    }

    pub fn set_operator(ctx: Context<SetOperator>, new_operator: Pubkey) -> Result<()> {
        instructions::set_operator::handler(ctx, new_operator)
    }
}
