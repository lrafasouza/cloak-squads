use anchor_lang::prelude::*;

#[account]
pub struct Cofre {
    pub multisig: Pubkey,
    pub operator: Pubkey,
    pub view_key_public: [u8; 32],
    pub created_at: i64,
    pub version: u8,
    pub revoked_audit: Vec<[u8; 16]>,
    pub bump: u8,
}

impl Cofre {
    pub const MAX_REVOKED: usize = 256;

    pub const fn space(revoked_count: usize) -> usize {
        8 + 32 + 32 + 32 + 8 + 1 + 4 + (16 * revoked_count) + 1
    }

    pub const INIT_SPACE: usize = Self::space(0);
}

#[account]
pub struct ViewKeyDistribution {
    pub cofre: Pubkey,
    pub entries: Vec<EncryptedViewKey>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EncryptedViewKey {
    pub signer: Pubkey,
    pub ephemeral_pk: [u8; 32],
    pub nonce: [u8; 24],
    pub ciphertext: [u8; 48],
    pub added_at: i64,
}

impl EncryptedViewKey {
    pub const SPACE: usize = 32 + 32 + 24 + 48 + 8;
}

impl ViewKeyDistribution {
    pub const fn space(entries: usize) -> usize {
        8 + 32 + 4 + (entries * EncryptedViewKey::SPACE) + 1
    }
}

#[account]
pub struct License {
    pub cofre: Pubkey,
    pub payload_hash: [u8; 32],
    pub nonce: [u8; 16],
    pub issued_at: i64,
    pub expires_at: i64,
    pub status: LicenseStatus,
    pub close_authority: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum LicenseStatus {
    Active,
    Consumed,
}

impl License {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 16 + 8 + 8 + 1 + 32 + 1;
}
