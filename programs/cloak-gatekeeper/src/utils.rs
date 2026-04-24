use anchor_lang::prelude::*;
use anchor_lang::solana_program::pubkey;

use crate::errors::CloakSquadsError;

pub const SQUADS_V4_PROGRAM_ID: Pubkey = pubkey!("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

pub fn verify_squads_vault_signer(
    multisig: &Pubkey,
    vault_index: u8,
    squads_vault: &Signer<'_>,
) -> Result<()> {
    let (expected_vault, _) = Pubkey::find_program_address(
        &[
            b"multisig",
            multisig.as_ref(),
            b"vault",
            &[vault_index],
        ],
        &SQUADS_V4_PROGRAM_ID,
    );

    require_keys_eq!(
        squads_vault.key(),
        expected_vault,
        CloakSquadsError::InvalidSquadsSigner
    );

    Ok(())
}
