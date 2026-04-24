use anchor_lang::prelude::*;

use crate::errors::CloakSquadsError;
use crate::events::LicenseIssued;
use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(
    ctx: Context<IssueLicense>,
    payload_hash: [u8; 32],
    nonce: [u8; 16],
    ttl_secs: i64,
) -> Result<()> {
    verify_squads_vault_signer(&ctx.accounts.cofre.multisig, 0, &ctx.accounts.squads_vault)?;
    require!(ttl_secs > 0, CloakSquadsError::InvalidTtl);

    let now = Clock::get()?.unix_timestamp;
    let expires_at = now
        .checked_add(ttl_secs)
        .ok_or(CloakSquadsError::MathOverflow)?;

    let license = &mut ctx.accounts.license;
    license.cofre = ctx.accounts.cofre.key();
    license.payload_hash = payload_hash;
    license.nonce = nonce;
    license.issued_at = now;
    license.expires_at = expires_at;
    license.status = LicenseStatus::Active;
    license.close_authority = ctx.accounts.cofre.operator;
    license.bump = ctx.bumps.license;

    emit!(LicenseIssued {
        cofre: license.cofre,
        payload_hash,
        expires_at,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(payload_hash: [u8; 32])]
pub struct IssueLicense<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    pub squads_vault: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = License::INIT_SPACE,
        seeds = [b"license", cofre.key().as_ref(), payload_hash.as_ref()],
        bump,
    )]
    pub license: Account<'info, License>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
