use anchor_lang::prelude::*;

pub mod state;
use state::*;

declare_id!("EVVhEEX7TF4AMTm4cggRJ5p5zzoLMP1Mb9PevQ5YshDu");

#[program]
pub mod cloak_mock {
    use super::*;

    pub fn init_pool(ctx: Context<InitPool>, mint: Pubkey) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.mint = mint;
        pool.merkle_root_stub = [0u8; 32];
        pool.tx_count = 0;
        pool.bump = ctx.bumps.pool;
        Ok(())
    }

    pub fn stub_transact(
        ctx: Context<StubTransact>,
        nullifier: [u8; 32],
        commitment: [u8; 32],
        _amount: u64,
        _recipient_vk_pub: [u8; 32],
        _proof_bytes: [u8; 256],
        _merkle_root: [u8; 32],
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let nullifier_rec = &mut ctx.accounts.nullifier_record;
        nullifier_rec.nullifier = nullifier;
        nullifier_rec.consumed_at = Clock::get()?.unix_timestamp;
        nullifier_rec.bump = ctx.bumps.nullifier_record;

        for (idx, byte) in commitment.iter().enumerate() {
            pool.merkle_root_stub[idx] ^= byte;
        }

        pool.tx_count = pool
            .tx_count
            .checked_add(1)
            .ok_or(anchor_lang::solana_program::program_error::ProgramError::ArithmeticOverflow)?;

        emit!(StubTransactEvent {
            nullifier,
            commitment,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(mint: Pubkey)]
pub struct InitPool<'info> {
    #[account(
        init,
        payer = payer,
        space = StubPool::INIT_SPACE,
        seeds = [b"stub_pool", mint.as_ref()],
        bump,
    )]
    pub pool: Account<'info, StubPool>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier: [u8; 32])]
pub struct StubTransact<'info> {
    #[account(mut, seeds = [b"stub_pool", pool.mint.as_ref()], bump = pool.bump)]
    pub pool: Account<'info, StubPool>,
    #[account(
        init,
        payer = payer,
        space = NullifierRecord::INIT_SPACE,
        seeds = [b"nullifier", nullifier.as_ref()],
        bump,
    )]
    pub nullifier_record: Account<'info, NullifierRecord>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct StubTransactEvent {
    pub nullifier: [u8; 32],
    pub commitment: [u8; 32],
}
