import { describe, expect, test } from "vitest";
import { getMemberVote } from "../src/proposal-vote";

function pk(address: string) {
  return {
    toBase58: () => address,
  };
}

describe("getMemberVote", () => {
  test("returns the vote list containing the member", () => {
    const proposal = {
      approved: [pk("approved-member")],
      rejected: [pk("rejected-member")],
      cancelled: [pk("cancelled-member")],
    };

    expect(getMemberVote(proposal, "approved-member")).toBe("approved");
    expect(getMemberVote(proposal, "rejected-member")).toBe("rejected");
    expect(getMemberVote(proposal, "cancelled-member")).toBe("cancelled");
  });

  test("returns null when the wallet is missing or has not voted", () => {
    const proposal = {
      approved: [pk("approved-member")],
      rejected: [],
      cancelled: [],
    };

    expect(getMemberVote(proposal, "other-member")).toBeNull();
    expect(getMemberVote(proposal, null)).toBeNull();
  });
});
