import { genericAdapter } from "../generic"
import { shopifyAdapter } from "../shopify"
import { extractShopifyCatalogProducts } from "../../shopify-catalog-extraction"
import type { ProductPageCandidate } from "../../types"

function candidate(partial: Partial<ProductPageCandidate> = {}): ProductPageCandidate {
  return {
    distributor: "American Dental Accessories",
    website_url: "https://amerdental.com",
    origin: "https://amerdental.com",
    prices: "Y",
    sitemap_url: "https://amerdental.com/sitemap_products_1.xml",
    url: "https://amerdental.com/products/test-product",
    url_type: "product",
    confidence_score: 90,
    reasons: ["test"],
    category: "Dental supplies",
    subcategory: "",
    ...partial,
  }
}

describe("supplier product image extraction", () => {
  it("stores generic JSON-LD product images on extracted rows", () => {
    const row = genericAdapter.extractProduct(
      candidate({ distributor: "Generic Dental", origin: "https://supplier.test", url: "https://supplier.test/product/123" }),
      `
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Nitrile Gloves",
                "sku": "GLV-100",
                "image": ["/images/gloves.jpg"],
                "offers": {"price": "12.34", "availability": "https://schema.org/InStock"}
              }
            </script>
          </head>
        </html>
      `
    )

    expect(row.image_url).toBe("https://supplier.test/images/gloves.jpg")
    expect(row.raw).toMatchObject({
      image_urls: ["https://supplier.test/images/gloves.jpg"],
    })
  })

  it("stores Shopify product and variant image URLs on page extraction rows", () => {
    const rows = shopifyAdapter.extractProducts?.(
      candidate(),
      `
        <script type="application/json" id="medmkp-shopify-product-json">
          {
            "id": 123,
            "title": "Utility Cart",
            "handle": "utility-cart",
            "vendor": "Dental Brand",
            "product_type": "Equipment",
            "image": {"src": "//cdn.shopify.com/s/files/cart-main.jpg"},
            "images": [{"src": "//cdn.shopify.com/s/files/cart-alt.jpg"}],
            "variants": [{
              "id": 456,
              "sku": "CART-1",
              "price": 19999,
              "available": true,
              "featured_image": {"src": "//cdn.shopify.com/s/files/cart-variant.jpg"}
            }]
          }
        </script>
      `
    )

    expect(rows?.[0].image_url).toBe("https://cdn.shopify.com/s/files/cart-variant.jpg")
    expect(rows?.[0].raw).toMatchObject({
      image_urls: [
        "https://cdn.shopify.com/s/files/cart-variant.jpg",
        "https://cdn.shopify.com/s/files/cart-main.jpg",
        "https://cdn.shopify.com/s/files/cart-alt.jpg",
      ],
    })
  })

  it("stores Shopify products.json image URLs on full-catalog extraction rows", async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        products: [{
          id: 789,
          title: "Prophy Cups",
          handle: "prophy-cups",
          vendor: "Dental Brand",
          product_type: "Preventive",
          image: { src: "https://cdn.shopify.com/s/files/prophy-main.jpg" },
          images: [{ src: "https://cdn.shopify.com/s/files/prophy-alt.jpg" }],
          variants: [{
            id: 790,
            sku: "PROPHY-1",
            price: "8.50",
            available: true,
            featured_image: { src: "https://cdn.shopify.com/s/files/prophy-variant.jpg" },
          }],
        }],
      }),
    } as Response)) as typeof fetch

    try {
      const result = await extractShopifyCatalogProducts([
        candidate({ url: "https://amerdental.com/products/prophy-cups" }),
      ])

      expect(result.products).toHaveLength(1)
      expect(result.products[0].image_url).toBe("https://cdn.shopify.com/s/files/prophy-variant.jpg")
      expect(result.products[0].raw).toMatchObject({
        image_urls: [
          "https://cdn.shopify.com/s/files/prophy-variant.jpg",
          "https://cdn.shopify.com/s/files/prophy-main.jpg",
          "https://cdn.shopify.com/s/files/prophy-alt.jpg",
        ],
      })
    } finally {
      global.fetch = originalFetch
    }
  })
})
