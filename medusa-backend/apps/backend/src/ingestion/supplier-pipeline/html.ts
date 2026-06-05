export function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

export function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, " "))
}

export function firstMatch(html: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    const value = match?.[1]?.trim()

    if (value) {
      return decodeHtml(value)
    }
  }

  return ""
}

export function metaContent(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
        "i"
      ),
    ]
    const value = firstMatch(html, patterns)

    if (value) {
      return value
    }
  }

  return ""
}

export function jsonLdBlocks(html: string) {
  return [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ]
    .map((match) => stripTags(match[1]))
    .map((json) => {
      try {
        return JSON.parse(json)
      } catch {
        return undefined
      }
    })
    .filter(Boolean)
}

export function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd)
  }

  if (typeof value !== "object") {
    return []
  }

  const record = value as Record<string, unknown>
  return [record, ...flattenJsonLd(record["@graph"])]
}

export function stringValue(value: unknown) {
  if (typeof value === "string") {
    return decodeHtml(value)
  }

  if (typeof value === "number") {
    return String(value)
  }

  return ""
}

export function productJsonLd(html: string) {
  return jsonLdBlocks(html)
    .flatMap(flattenJsonLd)
    .find((record) => {
      const type = record["@type"]

      return Array.isArray(type)
        ? type.some((entry) => String(entry).toLowerCase() === "product")
        : String(type).toLowerCase() === "product"
    })
}

export function nestedString(
  record: Record<string, unknown> | undefined,
  path: string[]
) {
  let current: unknown = record

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return ""
    }

    current = (current as Record<string, unknown>)[key]
  }

  return stringValue(current)
}
