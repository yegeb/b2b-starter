/**
 * Runs a route's static-params generator and returns no params if it fails.
 *
 * Use it in `generateStaticParams` for routes that set `dynamicParams = true`.
 * When the Medusa API is unavailable at build time, the build then succeeds
 * and the route renders its pages on demand instead of failing the build.
 */
export async function staticParamsOrEmpty<T>(
  routeName: string,
  generate: () => Promise<T[] | null | undefined>
): Promise<T[]> {
  try {
    return (await generate()) ?? []
  } catch (error) {
    console.error(
      `Failed to generate static paths for ${routeName}: ${
        error instanceof Error ? error.message : "Unknown error"
      }. These pages render on demand.`
    )
    return []
  }
}
