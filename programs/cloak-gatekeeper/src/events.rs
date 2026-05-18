use anchor_lang::prelude::*;

#[event]
pub struct LicenseIssued {
    pub cofre: Pubkey,
    pub payload_hash: [u8; 32],
    pub expires_at: i64,
    /// F-001 audit closure — emits the issuing vault index so off-chain
    /// auditors can reconstruct which sub-vault authorized the license
    /// without re-deriving the PDA from seeds.
    pub vault_index: u8,
}

#[event]
pub struct LicenseConsumed {
    pub cofre: Pubkey,
    pub payload_hash: [u8; 32],
    pub cloak_tx_signature_hint: [u8; 32],
    /// F-001 audit closure — emits the vault index that issued the license,
    /// closing the audit-trail gap noted in the Pass 1 report ("operator-only
    /// consume → no on-chain witness of source vault").
    pub vault_index: u8,
}

#[event]
pub struct CofreInitialized {
    pub cofre: Pubkey,
    pub multisig: Pubkey,
    pub operator: Pubkey,
}
