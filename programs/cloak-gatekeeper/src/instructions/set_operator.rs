use anchor_lang::prelude::*;

use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(ctx: Context<SetOperator>, new_operator: Pubkey) -> Result<()> {
    verify_squads_vault_signer(
        &ctx.accounts.cofre.multisig,
        0,
        &ctx.accounts.squads_vault,
    )?;

    ctx.accounts.cofre.operator = new_operator;

    Ok(())
}

#[derive(Accounts)]
pub struct SetOperator<'info> {
    #[account(
        mut,
        seeds = [b"cofre", cofre.multisig.as_ref()],
        bump = cofre.bump,
    )]
    pub cofre: Account<'info, Cofre>,
    pub squads_vault: Signer<'info>,
}
