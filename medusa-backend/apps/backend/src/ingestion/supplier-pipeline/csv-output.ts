import { mkdirSync, writeFileSync } from "fs"
import { dirname, resolve } from "path"

export function csvValue(value: unknown) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "")
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function writeCsv<Row extends Record<string, unknown>>(
  path: string,
  headers: readonly (keyof Row | string)[],
  rows: Row[]
) {
  const absolutePath = resolve(path)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(
    absolutePath,
    [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((header) => csvValue(row[header as keyof Row])).join(",")
      ),
    ].join("\n") + "\n"
  )
}
