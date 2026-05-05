import { buildOrcaSwapInstructions } from "@/lib/orca-service";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { quoteResponse, userPublicKey } = body;

    if (!quoteResponse || !userPublicKey) {
      return NextResponse.json(
        { error: "Missing required fields: quoteResponse, userPublicKey" },
        { status: 400 },
      );
    }

    const result = await buildOrcaSwapInstructions({
      quote: quoteResponse,
      userPublicKey,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Orca swap build failed", details: message },
      { status: 500 },
    );
  }
}
