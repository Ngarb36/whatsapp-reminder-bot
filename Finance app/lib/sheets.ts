const SHEET_ID = "1EK6eh5uImdpE1MbwJtwAuEZqKjKSKvT7NXb8uzhcMzs"

export async function getSheetData(
  accessToken: string,
  sheetName: string = "Nadav",
  range: string = "A1:T40"
): Promise<string[][]> {
  const fullRange = `${sheetName}!${range}`
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(fullRange)}`

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Sheets API error: ${response.status} ${err}`)
  }

  const data = await response.json()
  return (data.values as string[][]) || []
}

export async function updateCell(
  accessToken: string,
  range: string,
  value: string
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      range,
      majorDimension: "ROWS",
      values: [[value]],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Update failed: ${response.status} ${err}`)
  }
}
