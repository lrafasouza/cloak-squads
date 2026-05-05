import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams.toString();
  const targetUrl = `https://api.jup.ag/swap/v2/order?${searchParams}`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `Jupiter API error: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch from Jupiter", details: String(error) },
      { status: 500 }
    );
  }
}
