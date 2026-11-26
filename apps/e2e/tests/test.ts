import { test as base } from "@playwright/test"

// The seeded products use images from a public S3 bucket, and the storefront
// loads them unoptimized, straight from the browser. Page navigations wait for
// the load event, which waits for every image, so a slow or unreachable bucket
// made a navigation time out although the page had rendered. Serve a small
// local image instead, so that the tests do not depend on that network.
export const PRODUCT_IMAGES =
  "https://medusa-public-images.s3.eu-west-1.amazonaws.com/**"

// A 1x1 transparent PNG.
const placeholderImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==",
  "base64"
)

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(PRODUCT_IMAGES, (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        body: placeholderImage,
      })
    )
    await use(context)
  },
})

export { expect } from "@playwright/test"
