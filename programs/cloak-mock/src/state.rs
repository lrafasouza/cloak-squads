use anchor_lang::prelude::*;

#[account]
pub struct StubPool {
    pub mint: Pubkey,
    pub merkle_root_stub: [u8; 32],
    pub tx_count: u64,
    pub bump: u8,
}

impl StubPool {
    pub const INIT_SPACE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct NullifierRecord {
    pub nullifier: [u8; 32],
    pub consumed_at: i64,
    pub bump: u8,
}

impl NullifierRecord {
    pub const INIT_SPACE: usize = 8 + 32 + 8 + 1;
}
