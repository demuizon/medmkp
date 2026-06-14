import { firstMatch, stripTags } from "../html"
import type {
  ExtractedProductRow,
  ProductPageCandidate,
  SupplierProductAdapter,
} from "../types"

type ShopifyVariant = {
  id?: number
  title?: string
  sku?: string
  available?: boolean
  featured_image?: ShopifyImage | string | null
  name?: string
  public_title?: string | null
  price?: number
  compare_at_price?: number | null
}

type ShopifyImage = {
  src?: string
  url?: string
}

type ShopifyProduct = {
  id?: number
  title?: string
  handle?: string
  description?: string
  vendor?: string
  type?: string
  product_type?: string
  tags?: string[]
  price?: number
  available?: boolean
  image?: ShopifyImage | string | null
  images?: Array<ShopifyImage | string>
  featured_image?: ShopifyImage | string | null
  variants?: ShopifyVariant[]
}

function parseJson(value: string) {
  if (!value.trim()) {
    return undefined
  }

  try {
    return JSON.parse(value) as ShopifyProduct | { product?: ShopifyProduct }
  } catch {
    return undefined
  }
}

function unwrapProduct(parsed: ShopifyProduct | { product?: ShopifyProduct } | undefined): ShopifyProduct | undefined {
  if (!parsed) {
    return undefined
  }

  return "product" in parsed ? parsed.product : parsed as ShopifyProduct
}

function productJson(html: string): ShopifyProduct | undefined {
  const appended = unwrapProduct(parseJson(firstMatch(html, [
    /<script[^>]+id=["']medmkp-shopify-product-json["'][^>]*>([\s\S]*?)<\/script>/i,
  ])))

  if (appended) {
    return appended
  }

  return unwrapProduct(parseJson(firstMatch(html, [
    /<script[^>]+id=["']tpa-store-data["'][^>]*>([\s\S]*?)<\/script>/i,
  ])))
}

function price(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return ""
  }

  return (value / 100).toFixed(2)
}

function imageSource(value: ShopifyImage | string | null | undefined) {
  if (typeof value === "string") {
    return value
  }

  return value?.src || value?.url || ""
}

function imageUrls(
  candidate: ProductPageCandidate,
  product: ShopifyProduct | undefined,
  variant: ShopifyVariant
) {
  return [
    ...new Set(
      [
        imageSource(variant.featured_image),
        imageSource(product?.featured_image),
        imageSource(product?.image),
        ...(product?.images ?? []).map(imageSource),
      ]
        .filter(Boolean)
        .map((url) => {
          try {
            return new URL(url, candidate.origin).href
          } catch {
            return ""
          }
        })
        .filter(Boolean)
    ),
  ]
}

export function shopifyAvailability(value: boolean | undefined) {
  if (value === true) {
    return "in_stock" as const
  }

  if (value === false) {
    return "unknown" as const
  }

  return undefined
}

function canonicalProductUrl(candidate: ProductPageCandidate, product: ShopifyProduct | undefined) {
  if (!product?.handle) {
    return candidate.url
  }

  return new URL("/products/" + product.handle, candidate.origin).href
}

export function shopifyVariantName(productTitle: string, variantTitle: string) {
  if (!variantTitle || /^default title$/i.test(variantTitle)) {
    return productTitle
  }

  return productTitle + " - " + variantTitle
}

function variantName(product: ShopifyProduct, variant: ShopifyVariant) {
  return shopifyVariantName(
    product.title ?? "",
    variant.public_title || variant.title || ""
  )
}

export function shopifyPackSize(value: string) {
  return firstMatch(value, [
    /([0-9][0-9,]*\s*\/\s*(?:bag|box|case|pack|pkg|bottle|tube|syringe|unit|cartridge|pk|bx)s?)/i,
    /((?:bag|box|case|pack|pkg|bottle|tube|syringe|unit|cartridge|pk|bx)s?\s+of\s+[0-9][A-Za-z0-9/-]*)/i,
  ])
}

function extractProducts(candidate: ProductPageCandidate, html: string): ExtractedProductRow[] {
  const product = productJson(html)
  const variants = product?.variants?.length ? product.variants : [{}]
  const description = stripTags(product?.description ?? "")
  const category = product?.type || product?.product_type || candidate.category || "Dental supplies"
  const productUrl = canonicalProductUrl(candidate, product)

  return variants.map((variant, index): ExtractedProductRow => {
    const name = product ? variantName(product, variant) : ""
    const sku = variant.sku || firstMatch(html, [
      /<meta[^>]+property=["']product:retailer_item_id["'][^>]+content=["']([^"']+)["']/i,
    ])
    const images = imageUrls(candidate, product, variant)

    return {
      sku,
      manufacturer_sku: sku,
      brand: product?.vendor,
      name,
      description: description || name,
      category,
      subcategory: candidate.subcategory || "",
      product_line: product?.type || product?.product_type || "",
      product_url: productUrl,
      pack_size: shopifyPackSize(name + " " + description),
      unit_of_measure: "",
      image_url: images[0] ?? "",
      price: price(variant.price ?? product?.price),
      price_basis: "each",
      availability: shopifyAvailability(variant.available ?? product?.available),
      min_quantity: 1,
      raw: {
        extracted_by: "shopify",
        product_id: product?.id,
        variant_id: variant.id,
        variant_index: index,
        source_page_url: candidate.url,
        sitemap_url: candidate.sitemap_url,
        confidence_score: candidate.confidence_score,
        reasons: candidate.reasons,
        image_urls: images,
      },
    }
  })
}

export const shopifyAdapter: SupplierProductAdapter = {
  id: "shopify",
  matches: (candidate: ProductPageCandidate) =>
    /(^|\.)amerdental\.com/i.test(candidate.url) ||
    /(^|\.)carolinadental\.com/i.test(candidate.url) ||
    /american dental accessories|carolina dental supply/i.test(candidate.distributor),
  extractProduct: (candidate, html): ExtractedProductRow => extractProducts(candidate, html)[0],
  extractProducts,
}
