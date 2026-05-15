use anchor_lang::prelude::*;

use crate::errors::CloakSquadsError;
use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(ctx: Context<EmergencyCloseLicense>, vault_index: u8) -> Result<()> {
    // Defense-in-depth (audit Pass 1 design drift): emergency_close_license is
    // a cofre-wide admin operation — it lets the registered operator reclaim
    // rent from any license stuck in `Active` status before its TTL elapses.
    // The product convention has always been "only vault[0] (Primary) can
    // authorise admin operations" (matches `revoke_audit`, `set_operator`,
    // `init_view_distribution`, `add/remove_signer_view`). Hardcoding the
    // check in Rust closes the residual where a buggy or malicious client
    // could pass a non-zero vault_index and have the chain accept it as
    // long as the corresponding vault PDA signed.
    require!(
        vault_index == 0,
        CloakSquadsError::AdminMustUsePrimaryVault
    );

    verify_squads_vault_signer(
        &ctx.accounts.cofre.multisig,
        vault_index,
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
        seeds = [b"license", cofre.key().as_ref(), &[license.vault_index], license.payload_hash.as_ref()],
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
