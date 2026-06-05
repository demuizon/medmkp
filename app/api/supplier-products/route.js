import { NextResponse } from "next/server";

export async function GET(request) {
  const medusaUrl = process.env.MEDUSA_BACKEND_URL || "http://127.0.0.1:9000";
  const url = new URL(request.url);
  const query = url.search || "";

  try {
    const response = await fetch(`${medusaUrl}/medmkp/supplier-products${query}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Medusa returned ${response.status}`);
    }

    const body = await response.json();
    return NextResponse.json({
      ...body,
      source: "medusa",
    });
  } catch (error) {
    return NextResponse.json(
      {
        count: 0,
        supplier_products: [],
        source: "fallback",
        warning: "Medusa backend is not reachable.",
      },
      { status: 503 }
    );
  }
}
