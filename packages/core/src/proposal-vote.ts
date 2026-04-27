type VoteListKey = "approved" | "rejected" | "cancelled";

type VoteList = {
  approved?: readonly { toBase58(): string }[];
  rejected?: readonly { toBase58(): string }[];
  cancelled?: readonly { toBase58(): string }[];
};

export type MemberVote = VoteListKey | null;

export function getMemberVote(proposal: VoteList, memberAddress: string | null | undefined): MemberVote {
  if (!memberAddress) return null;

  for (const key of ["approved", "rejected", "cancelled"] as const) {
    if (proposal[key]?.some((member) => member.toBase58() === memberAddress)) {
      return key;
    }
  }

  return null;
}
