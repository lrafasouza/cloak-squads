use anchor_lang::prelude::*;

#[event]
pub struct LicenseIssued {
    pub cofre: Pubkey,
    pub payload_hash: [u8; 32],
    pub expires_at: i64,
}

#[event]
pub struct LicenseConsumed {
    pub cofre: Pubkey,
    pub payload_hash: [u8; 32],
    pub cloak_tx_signature_hint: [u8; 32],
}

#[event]
pub struct CofreInitialized {
    pub cofre: Pubkey,
    pub multisig: Pubkey,
    pub operator: Pubkey,
}
