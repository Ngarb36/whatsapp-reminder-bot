import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getSheetData, updateCell } from "@/lib/sheets"

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!(session as any)?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const sheet = searchParams.get("sheet") || "Nadav"
  const range = searchParams.get("range") || "A1:T40"

  try {
    const values = await getSheetData((session as any).accessToken, sheet, range)
    return Response.json({ values })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!(session as any)?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { range, value } = await request.json()
    await updateCell((session as any).accessToken, range, value)
    return Response.json({ success: true })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
