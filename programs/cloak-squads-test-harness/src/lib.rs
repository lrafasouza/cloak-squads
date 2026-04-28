use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hash;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::pubkey;

declare_id!("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

pub const GATEKEEPER_PROGRAM_ID: Pubkey =
    pubkey!("AgFx8yS8bQnXSCSGfN3f8oz3HJGeF5rwLoWtfHTEEaAq");

#[program]
pub mod cloak_squads_test_harness {
    use super::*;

    pub fn invoke_init_cofre(
        ctx: Context<InvokeInitCofre>,
        multisig: Pubkey,
        operator: Pubkey,
        view_key_public: [u8; 32],
    ) -> Result<()> {
        let data = ix_data("init_cofre", &(multisig, operator, view_key_public))?;
        invoke_with_squads_vault(
            &ctx.accounts.gatekeeper_program,
            &[
                AccountMeta::new(ctx.accounts.cofre.key(), false),
                AccountMeta::new_readonly(ctx.accounts.squads_vault.key(), true),
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            &data,
            &[
                ctx.accounts.cofre.to_account_info(),
                ctx.accounts.squads_vault.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.gatekeeper_program.to_account_info(),
            ],
            &multisig,
            ctx.bumps.squads_vault,
        )
    }

    pub fn invoke_issue_license(
        ctx: Context<InvokeIssueLicense>,
        cofre_multisig: Pubkey,
        payload_hash: [u8; 32],
        nonce: [u8; 16],
        ttl_secs: i64,
    ) -> Result<()> {
        let data = ix_data("issue_license", &(payload_hash, nonce, ttl_secs))?;
        invoke_with_squads_vault(
            &ctx.accounts.gatekeeper_program,
            &[
                AccountMeta::new_readonly(ctx.accounts.cofre.key(), false),
                AccountMeta::new_readonly(ctx.accounts.squads_vault.key(), true),
                AccountMeta::new(ctx.accounts.license.key(), false),
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            &data,
            &[
                ctx.accounts.cofre.to_account_info(),
                ctx.accounts.squads_vault.to_account_info(),
                ctx.accounts.license.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.gatekeeper_program.to_account_info(),
            ],
            &cofre_multisig,
            ctx.bumps.squads_vault,
        )
    }

    pub fn invoke_init_view_distribution(
        ctx: Context<InvokeInitViewDistribution>,
        cofre_multisig: Pubkey,
    ) -> Result<()> {
        let data = ix_data("init_view_distribution", &())?;
        invoke_with_squads_vault(
            &ctx.accounts.gatekeeper_program,
            &[
                AccountMeta::new_readonly(ctx.accounts.cofre.key(), false),
                AccountMeta::new_readonly(ctx.accounts.squads_vault.key(), true),
                AccountMeta::new(ctx.accounts.view_distribution.key(), false),
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            &data,
            &[
                ctx.accounts.cofre.to_account_info(),
                ctx.accounts.squads_vault.to_account_info(),
                ctx.accounts.view_distribution.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.gatekeeper_program.to_account_info(),
            ],
            &cofre_multisig,
            ctx.bumps.squads_vault,
        )
    }

    pub fn invoke_add_signer_view(
        ctx: Context<InvokeAddSignerView>,
        cofre_multisig: Pubkey,
        signer: Pubkey,
        ephemeral_pk: [u8; 32],
        nonce: [u8; 24],
        ciphertext: [u8; 48],
    ) -> Result<()> {
        let data = ix_data(
            "add_signer_view",
            &(signer, ephemeral_pk, nonce, ciphertext),
        )?;
        invoke_with_squads_vault(
            &ctx.accounts.gatekeeper_program,
            &[
                AccountMeta::new_readonly(ctx.accounts.cofre.key(), false),
                AccountMeta::new_readonly(ctx.accounts.squads_vault.key(), true),
                AccountMeta::new(ctx.accounts.view_distribution.key(), false),
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            &data,
            &[
                ctx.accounts.cofre.to_account_info(),
                ctx.accounts.squads_vault.to_account_info(),
                ctx.accounts.view_distribution.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.gatekeeper_program.to_account_info(),
            ],
            &cofre_multisig,
            ctx.bumps.squads_vault,
        )
    }

    pub fn invoke_remove_signer_view(
        ctx: Context<InvokeRemoveSignerView>,
        cofre_multisig: Pubkey,
        target: Pubkey,
    ) -> Result<()> {
        let data = ix_data("remove_signer_view", &(target,))?;
        invoke_with_squads_vault(
            &ctx.accounts.gatekeeper_program,
            &[
                AccountMeta::new_readonly(ctx.accounts.cofre.key(), false),
                AccountMeta::new_readonly(ctx.accounts.squads_vault.key(), true),
                AccountMeta::new(ctx.accounts.view_distribution.key(), false),
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            &data,
            &[
                ctx.accounts.cofre.to_account_info(),
                ctx.accounts.squads_vault.to_account_info(),
                ctx.accounts.view_distribution.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.gatekeeper_program.to_account_info(),
            ],
            &cofre_multisig,
            ctx.bumps.squads_vault,
        )
    }

    pub fn invoke_emergency_close_license(
        ctx: Context<InvokeEmergencyCloseLicense>,
        cofre_multisig: Pubkey,
    ) -> Result<()> {
        let data = ix_data("emergency_close_license", &())?;
        invoke_with_squads_vault(
            &ctx.accounts.gatekeeper_program,
            &[
                AccountMeta::new_readonly(ctx.accounts.cofre.key(), false),
                AccountMeta::new_readonly(ctx.accounts.squads_vault.key(), true),
                AccountMeta::new(ctx.accounts.license.key(), false),
                AccountMeta::new(ctx.accounts.operator.key(), false),
                AccountMeta::new(ctx.accounts.payer.key(), true),
            ],
            &data,
            &[
                ctx.accounts.cofre.to_account_info(),
                ctx.accounts.squads_vault.to_account_info(),
                ctx.accounts.license.to_account_info(),
                ctx.accounts.operator.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.gatekeeper_program.to_account_info(),
            ],
            &cofre_multisig,
            ctx.bumps.squads_vault,
        )
    }

    pub fn invoke_revoke_audit(
        ctx: Context<InvokeRevokeAudit>,
        cofre_multisig: Pubkey,
        diversifier_trunc: [u8; 16],
    ) -> Result<()> {
        let data = ix_data("revoke_audit", &(diversifier_trunc,))?;
        invoke_with_squads_vault(
            &ctx.accounts.gatekeeper_program,
            &[
                AccountMeta::new(ctx.accounts.cofre.key(), false),
                AccountMeta::new_readonly(ctx.accounts.squads_vault.key(), true),
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
            ],
            &data,
            &[
                ctx.accounts.cofre.to_account_info(),
                ctx.accounts.squads_vault.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.gatekeeper_program.to_account_info(),
            ],
            &cofre_multisig,
            ctx.bumps.squads_vault,
        )
    }

    pub fn invoke_set_operator(
        ctx: Context<InvokeSetOperator>,
        cofre_multisig: Pubkey,
        new_operator: Pubkey,
    ) -> Result<()> {
        let data = ix_data("set_operator", &(new_operator,))?;
        invoke_with_squads_vault(
            &ctx.accounts.gatekeeper_program,
            &[
                AccountMeta::new(ctx.accounts.cofre.key(), false),
                AccountMeta::new_readonly(ctx.accounts.squads_vault.key(), true),
            ],
            &data,
            &[
                ctx.accounts.cofre.to_account_info(),
                ctx.accounts.squads_vault.to_account_info(),
                ctx.accounts.gatekeeper_program.to_account_info(),
            ],
            &cofre_multisig,
            ctx.bumps.squads_vault,
        )
    }
}

fn ix_data<T: AnchorSerialize>(name: &str, args: &T) -> Result<Vec<u8>> {
    let preimage = format!("global:{name}");
    let digest = hash(preimage.as_bytes()).to_bytes();
    let mut data = digest[..8].to_vec();
    args.serialize(&mut data)
        .map_err(|_| error!(HarnessError::SerializationFailed))?;
    Ok(data)
}

fn invoke_with_squads_vault<'info>(
    gatekeeper_program: &UncheckedAccount<'info>,
    accounts: &[AccountMeta],
    data: &[u8],
    account_infos: &[AccountInfo<'info>],
    multisig: &Pubkey,
    vault_bump: u8,
) -> Result<()> {
    require_keys_eq!(
        gatekeeper_program.key(),
        GATEKEEPER_PROGRAM_ID,
        HarnessError::InvalidGatekeeperProgram
    );

    let vault_index = [0u8];
    let bump = [vault_bump];
    let signer_seeds: &[&[u8]] = &[b"multisig", multisig.as_ref(), b"vault", &vault_index, &bump];

    let ix = Instruction {
        program_id: gatekeeper_program.key(),
        accounts: accounts.to_vec(),
        data: data.to_vec(),
    };

    invoke_signed(&ix, account_infos, &[signer_seeds])?;
    Ok(())
}

#[derive(Accounts)]
#[instruction(multisig: Pubkey)]
pub struct InvokeInitCofre<'info> {
    /// CHECK: checked by address in invoke_with_squads_vault.
    pub gatekeeper_program: UncheckedAccount<'info>,
    /// CHECK: created and validated by cloak-gatekeeper.
    #[account(mut)]
    pub cofre: UncheckedAccount<'info>,
    /// CHECK: PDA signer for CPI only.
    #[account(seeds = [b"multisig", multisig.as_ref(), b"vault", &[0]], bump)]
    pub squads_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cofre_multisig: Pubkey)]
pub struct InvokeIssueLicense<'info> {
    /// CHECK: checked by address in invoke_with_squads_vault.
    pub gatekeeper_program: UncheckedAccount<'info>,
    /// CHECK: typed and validated by cloak-gatekeeper.
    pub cofre: UncheckedAccount<'info>,
    /// CHECK: PDA signer for CPI only.
    #[account(seeds = [b"multisig", cofre_multisig.as_ref(), b"vault", &[0]], bump)]
    pub squads_vault: UncheckedAccount<'info>,
    /// CHECK: created and validated by cloak-gatekeeper.
    #[account(mut)]
    pub license: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cofre_multisig: Pubkey)]
pub struct InvokeInitViewDistribution<'info> {
    /// CHECK: checked by address in invoke_with_squads_vault.
    pub gatekeeper_program: UncheckedAccount<'info>,
    /// CHECK: typed and validated by cloak-gatekeeper.
    pub cofre: UncheckedAccount<'info>,
    /// CHECK: PDA signer for CPI only.
    #[account(seeds = [b"multisig", cofre_multisig.as_ref(), b"vault", &[0]], bump)]
    pub squads_vault: UncheckedAccount<'info>,
    /// CHECK: created and validated by cloak-gatekeeper.
    #[account(mut)]
    pub view_distribution: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cofre_multisig: Pubkey)]
pub struct InvokeAddSignerView<'info> {
    /// CHECK: checked by address in invoke_with_squads_vault.
    pub gatekeeper_program: UncheckedAccount<'info>,
    /// CHECK: typed and validated by cloak-gatekeeper.
    pub cofre: UncheckedAccount<'info>,
    /// CHECK: PDA signer for CPI only.
    #[account(seeds = [b"multisig", cofre_multisig.as_ref(), b"vault", &[0]], bump)]
    pub squads_vault: UncheckedAccount<'info>,
    /// CHECK: typed and reallocated by cloak-gatekeeper.
    #[account(mut)]
    pub view_distribution: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cofre_multisig: Pubkey)]
pub struct InvokeRemoveSignerView<'info> {
    /// CHECK: checked by address in invoke_with_squads_vault.
    pub gatekeeper_program: UncheckedAccount<'info>,
    /// CHECK: typed and validated by cloak-gatekeeper.
    pub cofre: UncheckedAccount<'info>,
    /// CHECK: PDA signer for CPI only.
    #[account(seeds = [b"multisig", cofre_multisig.as_ref(), b"vault", &[0]], bump)]
    pub squads_vault: UncheckedAccount<'info>,
    /// CHECK: typed and reallocated by cloak-gatekeeper.
    #[account(mut)]
    pub view_distribution: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cofre_multisig: Pubkey)]
pub struct InvokeEmergencyCloseLicense<'info> {
    /// CHECK: checked by address in invoke_with_squads_vault.
    pub gatekeeper_program: UncheckedAccount<'info>,
    /// CHECK: typed and validated by cloak-gatekeeper.
    pub cofre: UncheckedAccount<'info>,
    /// CHECK: PDA signer for CPI only.
    #[account(seeds = [b"multisig", cofre_multisig.as_ref(), b"vault", &[0]], bump)]
    pub squads_vault: UncheckedAccount<'info>,
    /// CHECK: typed and closed by cloak-gatekeeper.
    #[account(mut)]
    pub license: UncheckedAccount<'info>,
    /// CHECK: address-constrained by cloak-gatekeeper.
    #[account(mut)]
    pub operator: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(cofre_multisig: Pubkey)]
pub struct InvokeRevokeAudit<'info> {
    /// CHECK: checked by address in invoke_with_squads_vault.
    pub gatekeeper_program: UncheckedAccount<'info>,
    /// CHECK: typed and reallocated by cloak-gatekeeper.
    #[account(mut)]
    pub cofre: UncheckedAccount<'info>,
    /// CHECK: PDA signer for CPI only.
    #[account(seeds = [b"multisig", cofre_multisig.as_ref(), b"vault", &[0]], bump)]
    pub squads_vault: UncheckedAccount<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cofre_multisig: Pubkey)]
pub struct InvokeSetOperator<'info> {
    /// CHECK: checked by address in invoke_with_squads_vault.
    pub gatekeeper_program: UncheckedAccount<'info>,
    /// CHECK: typed and mutated by cloak-gatekeeper.
    #[account(mut)]
    pub cofre: UncheckedAccount<'info>,
    /// CHECK: PDA signer for CPI only.
    #[account(seeds = [b"multisig", cofre_multisig.as_ref(), b"vault", &[0]], bump)]
    pub squads_vault: UncheckedAccount<'info>,
}

#[error_code]
pub enum HarnessError {
    #[msg("Gatekeeper program id does not match cloak-gatekeeper")]
    InvalidGatekeeperProgram,
    #[msg("Failed to serialize CPI instruction data")]
    SerializationFailed,
}
