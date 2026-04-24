use anchor_lang::prelude::*;

use crate::errors::CloakSquadsError;
use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(ctx: Context<RevokeAudit>, diversifier_trunc: [u8; 16]) -> Result<()> {
    verify_squads_vault_signer(
        &ctx.accounts.cofre.multisig,
        0,
        &ctx.accounts.squads_vault,
    )?;

    let cofre = &mut ctx.accounts.cofre;
    require!(
        cofre.revoked_audit.len() < Cofre::MAX_REVOKED,
        CloakSquadsError::RevocationCapacity
    );
    require!(
        !cofre.revoked_audit.iter().any(|d| d == &diversifier_trunc),
        CloakSquadsError::RevocationCollision
    );

    cofre.revoked_audit.push(diversifier_trunc);

    Ok(())
}

#[derive(Accounts)]
pub struct RevokeAudit<'info> {
    #[account(
        mut,
        seeds = [b"cofre", cofre.multisig.as_ref()],
        bump = cofre.bump,
        realloc = Cofre::space(cofre.revoked_audit.len() + 1),
        realloc::payer = payer,
        realloc::zero = false,
    )]
    pub cofre: Account<'info, Cofre>,
    pub squads_vault: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
