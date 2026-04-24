use anchor_lang::prelude::*;

use crate::errors::CloakSquadsError;
use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(
    ctx: Context<AddSignerView>,
    signer: Pubkey,
    ephemeral_pk: [u8; 32],
    nonce: [u8; 24],
    ciphertext: [u8; 48],
) -> Result<()> {
    verify_squads_vault_signer(
        &ctx.accounts.cofre.multisig,
        0,
        &ctx.accounts.squads_vault,
    )?;

    let dist = &mut ctx.accounts.view_distribution;
    require!(
        !dist.entries.iter().any(|entry| entry.signer == signer),
        CloakSquadsError::SignerAlreadyExists
    );

    dist.entries.push(EncryptedViewKey {
        signer,
        ephemeral_pk,
        nonce,
        ciphertext,
        added_at: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct AddSignerView<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    pub squads_vault: Signer<'info>,
    #[account(
        mut,
        seeds = [b"view_dist", cofre.key().as_ref()],
        bump = view_distribution.bump,
        realloc = ViewKeyDistribution::space(view_distribution.entries.len() + 1),
        realloc::payer = payer,
        realloc::zero = false,
    )]
    pub view_distribution: Account<'info, ViewKeyDistribution>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
