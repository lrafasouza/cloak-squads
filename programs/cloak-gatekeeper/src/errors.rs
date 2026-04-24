use anchor_lang::prelude::*;

#[error_code]
pub enum CloakSquadsError {
    #[msg("Signer is not the Squads vault PDA for this cofre")]
    InvalidSquadsSigner,
    #[msg("Caller is not the registered operator")]
    NotOperator,
    #[msg("License has expired")]
    LicenseExpired,
    #[msg("License has already been consumed")]
    LicenseConsumed,
    #[msg("Payload invariants do not match license hash")]
    LicensePayloadMismatch,
    #[msg("Invalid payload nonce length")]
    InvalidNonce,
    #[msg("License TTL must be greater than zero")]
    InvalidTtl,
    #[msg("CPI target is not the configured Cloak program")]
    InvalidCpiTarget,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Revoked audit diversifier collision detected")]
    RevocationCollision,
    #[msg("Too many revocations - realloc required by caller")]
    RevocationCapacity,
    #[msg("License is not yet expired")]
    LicenseNotExpired,
    #[msg("Signer is already present in the view-key distribution")]
    SignerAlreadyExists,
    #[msg("Signer not found in the view-key distribution")]
    SignerNotFound,
}
