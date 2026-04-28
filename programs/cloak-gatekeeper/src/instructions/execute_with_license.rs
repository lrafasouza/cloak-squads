use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;

use crate::errors::CloakSquadsError;
use crate::events::LicenseConsumed;
use crate::state::*;

pub const PAYLOAD_DOMAIN_SEP: &[u8] = b"cloak-squads-payload-v1\0";

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PayloadInvariants {
    pub nullifier: [u8; 32],
    pub commitment: [u8; 32],
    pub amount: u64,
    pub token_mint: Pubkey,
    pub recipient_vk_pub: [u8; 32],
    pub nonce: [u8; 16],
}

pub fn hash_payload(invariants: &PayloadInvariants) -> [u8; 32] {
    let mut buf = Vec::with_capacity(PAYLOAD_DOMAIN_SEP.len() + 32 + 32 + 8 + 32 + 32 + 16);
    buf.extend_from_slice(PAYLOAD_DOMAIN_SEP);
    buf.extend_from_slice(&invariants.nullifier);
    buf.extend_from_slice(&invariants.commitment);
    buf.extend_from_slice(&invariants.amount.to_le_bytes());
    buf.extend_from_slice(invariants.token_mint.as_ref());
    buf.extend_from_slice(&invariants.recipient_vk_pub);
    buf.extend_from_slice(&invariants.nonce);
    hash(&buf).to_bytes()
}

pub fn handler(
    ctx: Context<ExecuteWithLicense>,
    invariants: PayloadInvariants,
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.operator.key(),
        ctx.accounts.cofre.operator,
        CloakSquadsError::NotOperator
    );

    let now = Clock::get()?.unix_timestamp;
    require!(
        ctx.accounts.license.expires_at >= now,
        CloakSquadsError::LicenseExpired
    );
    require!(
        ctx.accounts.license.status == LicenseStatus::Active,
        CloakSquadsError::LicenseConsumed
    );

    let payload_hash = hash_payload(&invariants);
    require!(
        ctx.accounts.license.payload_hash == payload_hash,
        CloakSquadsError::LicensePayloadMismatch
    );

    ctx.accounts.license.status = LicenseStatus::Consumed;

    emit!(LicenseConsumed {
        cofre: ctx.accounts.cofre.key(),
        payload_hash,
        cloak_tx_signature_hint: invariants.commitment,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteWithLicense<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    #[account(
        mut,
        seeds = [b"license", cofre.key().as_ref(), license.payload_hash.as_ref()],
        bump = license.bump,
        has_one = cofre,
    )]
    pub license: Account<'info, License>,
    pub operator: Signer<'info>,
    pub system_program: Program<'info, System>,
}
