export function parseCsv(text: string) {
  const rows: string[][] = []
  let current = ""
  let row: string[] = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === "," && !inQuotes) {
      row.push(current)
      current = ""
      continue
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1
      }
      row.push(current)
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row)
      }
      row = []
      current = ""
      continue
    }

    current += char
  }

  if (current.length || row.length) {
    row.push(current)
    rows.push(row)
  }

  return rows
}
