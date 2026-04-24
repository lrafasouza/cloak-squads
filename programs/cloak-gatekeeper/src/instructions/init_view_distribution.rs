use anchor_lang::prelude::*;

use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(ctx: Context<InitViewDistribution>) -> Result<()> {
    verify_squads_vault_signer(
        &ctx.accounts.cofre.multisig,
        0,
        &ctx.accounts.squads_vault,
    )?;

    let view_distribution = &mut ctx.accounts.view_distribution;
    view_distribution.cofre = ctx.accounts.cofre.key();
    view_distribution.entries = Vec::new();
    view_distribution.bump = ctx.bumps.view_distribution;

    Ok(())
}

#[derive(Accounts)]
pub struct InitViewDistribution<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    pub squads_vault: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = ViewKeyDistribution::space(0),
        seeds = [b"view_dist", cofre.key().as_ref()],
        bump,
    )]
    pub view_distribution: Account<'info, ViewKeyDistribution>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
