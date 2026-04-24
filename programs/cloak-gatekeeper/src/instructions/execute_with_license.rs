use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke;
use anchor_lang::solana_program::pubkey;

use crate::errors::CloakSquadsError;
use crate::events::LicenseConsumed;
use crate::state::*;

pub const PAYLOAD_DOMAIN_SEP: &[u8] = b"cloak-squads-payload-v1\0";
pub const CLOAK_MOCK_PROGRAM_ID: Pubkey = pubkey!("9oNHUEqLVcUBygReEgy26yxDSAPFUi48bb2MJ4UsqQJr");

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
    proof_bytes: [u8; 256],
    merkle_root: [u8; 32],
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
    require_keys_eq!(
        ctx.accounts.cloak_program.key(),
        CLOAK_MOCK_PROGRAM_ID,
        CloakSquadsError::InvalidCpiTarget
    );
    require!(
        ctx.accounts.cloak_program.to_account_info().executable,
        CloakSquadsError::InvalidCpiTarget
    );

    let ix = Instruction {
        program_id: ctx.accounts.cloak_program.key(),
        accounts: vec![
            AccountMeta::new(ctx.accounts.cloak_pool.key(), false),
            AccountMeta::new(ctx.accounts.nullifier_record.key(), false),
            AccountMeta::new(ctx.accounts.operator.key(), true),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ],
        data: build_stub_transact_data(&invariants, proof_bytes, merkle_root),
    };

    invoke(
        &ix,
        &[
            ctx.accounts.cloak_pool.to_account_info(),
            ctx.accounts.nullifier_record.to_account_info(),
            ctx.accounts.operator.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    ctx.accounts.license.status = LicenseStatus::Consumed;

    emit!(LicenseConsumed {
        cofre: ctx.accounts.cofre.key(),
        payload_hash,
        cloak_tx_signature_hint: invariants.commitment,
    });

    Ok(())
}

fn build_stub_transact_data(
    invariants: &PayloadInvariants,
    proof_bytes: [u8; 256],
    merkle_root: [u8; 32],
) -> Vec<u8> {
    let mut data = Vec::with_capacity(8 + 32 + 32 + 8 + 32 + 256 + 32);
    let discriminator = anchor_lang::solana_program::hash::hash(b"global:stub_transact").to_bytes();
    data.extend_from_slice(&discriminator[..8]);
    data.extend_from_slice(&invariants.nullifier);
    data.extend_from_slice(&invariants.commitment);
    data.extend_from_slice(&invariants.amount.to_le_bytes());
    data.extend_from_slice(&invariants.recipient_vk_pub);
    data.extend_from_slice(&proof_bytes);
    data.extend_from_slice(&merkle_root);
    data
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
    /// CHECK: CPI target program is selected by environment for the spike.
    pub cloak_program: UncheckedAccount<'info>,
    /// CHECK: Mock Cloak pool account owned and validated by the mock program.
    #[account(mut)]
    pub cloak_pool: UncheckedAccount<'info>,
    /// CHECK: Created by cloak-mock during CPI.
    #[account(mut)]
    pub nullifier_record: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
