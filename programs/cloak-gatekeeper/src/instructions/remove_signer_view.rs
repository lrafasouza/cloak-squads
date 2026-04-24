use anchor_lang::prelude::*;

use crate::errors::CloakSquadsError;
use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(ctx: Context<RemoveSignerView>, target: Pubkey) -> Result<()> {
    verify_squads_vault_signer(
        &ctx.accounts.cofre.multisig,
        0,
        &ctx.accounts.squads_vault,
    )?;

    let dist = &mut ctx.accounts.view_distribution;
    let position = dist
        .entries
        .iter()
        .position(|entry| entry.signer == target)
        .ok_or(CloakSquadsError::SignerNotFound)?;
    dist.entries.remove(position);

    Ok(())
}

#[derive(Accounts)]
#[instruction(target: Pubkey)]
pub struct RemoveSignerView<'info> {
    #[account(seeds = [b"cofre", cofre.multisig.as_ref()], bump = cofre.bump)]
    pub cofre: Account<'info, Cofre>,
    pub squads_vault: Signer<'info>,
    #[account(
        mut,
        seeds = [b"view_dist", cofre.key().as_ref()],
        bump = view_distribution.bump,
        realloc = ViewKeyDistribution::space(view_distribution.entries.len().saturating_sub(1)),
        realloc::payer = payer,
        realloc::zero = false,
    )]
    pub view_distribution: Account<'info, ViewKeyDistribution>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
