use anchor_lang::prelude::*;

use crate::events::CofreInitialized;
use crate::state::*;
use crate::utils::verify_squads_vault_signer;

pub fn handler(
    ctx: Context<InitCofre>,
    multisig: Pubkey,
    operator: Pubkey,
    view_key_public: [u8; 32],
) -> Result<()> {
    verify_squads_vault_signer(&multisig, 0, &ctx.accounts.squads_vault)?;

    let cofre = &mut ctx.accounts.cofre;
    cofre.multisig = multisig;
    cofre.operator = operator;
    cofre.view_key_public = view_key_public;
    cofre.created_at = Clock::get()?.unix_timestamp;
    cofre.version = 1;
    cofre.revoked_audit = Vec::new();
    cofre.bump = ctx.bumps.cofre;

    emit!(CofreInitialized {
        cofre: cofre.key(),
        multisig,
        operator,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(multisig: Pubkey)]
pub struct InitCofre<'info> {
    #[account(
        init,
        payer = payer,
        space = Cofre::INIT_SPACE,
        seeds = [b"cofre", multisig.as_ref()],
        bump,
    )]
    pub cofre: Account<'info, Cofre>,
    pub squads_vault: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
