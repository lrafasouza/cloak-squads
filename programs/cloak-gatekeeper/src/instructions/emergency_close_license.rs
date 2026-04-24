use anchor_lang::prelude::*;

use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(ctx: Context<EmergencyCloseLicense>) -> Result<()> {
    verify_squads_vault_signer(
        &ctx.accounts.cofre.multisig,
        0,
        &ctx.accounts.squads_vault,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct EmergencyCloseLicense<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    pub squads_vault: Signer<'info>,
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
    /// Tx-fee payer.
    #[account(mut)]
    pub payer: Signer<'info>,
}
