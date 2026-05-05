import { getOrcaQuote } from "@/lib/orca-service";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const inputMint = searchParams.get("inputMint");
  const outputMint = searchParams.get("outputMint");
  const amount = searchParams.get("amount");
  const slippageBps = searchParams.get("slippageBps");

  if (!inputMint || !outputMint || !amount) {
    return NextResponse.json(
      { error: "Missing required parameters: inputMint, outputMint, amount" },
      { status: 400 },
    );
  }

  try {
    const quote = await getOrcaQuote({
      inputMint,
      outputMint,
      amount,
      slippageBps: slippageBps ? Number.parseInt(slippageBps, 10) : 50,
    });

    return NextResponse.json(quote);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Orca quote failed", details: message }, { status: 500 });
  }
}
