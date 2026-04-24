use anchor_lang::prelude::*;

use crate::errors::CloakSquadsError;
use crate::state::*;

pub fn handler(ctx: Context<CloseExpiredLicense>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        now > ctx.accounts.license.expires_at,
        CloakSquadsError::LicenseNotExpired
    );

    Ok(())
}

#[derive(Accounts)]
pub struct CloseExpiredLicense<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    #[account(
        mut,
        close = operator,
        seeds = [b"license", cofre.key().as_ref(), license.payload_hash.as_ref()],
        bump = license.bump,
        has_one = cofre,
    )]
    pub license: Account<'info, License>,
    /// CHECK: validated against `cofre.operator`; only used as the rent destination for the close.
    #[account(mut, address = cofre.operator)]
    pub operator: UncheckedAccount<'info>,
    /// Tx-fee payer. Anyone can submit, no constraint on identity.
    #[account(mut)]
    pub payer: Signer<'info>,
}
