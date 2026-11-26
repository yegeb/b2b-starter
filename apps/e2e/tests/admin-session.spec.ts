import type { Page } from "@playwright/test"
import { expect, test } from "./test"
import { backendUrl, fixtures, openPage, submitAdminLogin } from "./fixtures"

const { admin } = fixtures

const isPath = (path: string) => (response: { url(): string }) =>
  new URL(response.url()).pathname === path

const currentUserResponse = (page: Page) =>
  page.waitForResponse(isPath("/admin/users/me"))

// The backend runs over plain HTTP with NODE_ENV=development, like the local
// container preview. A secure-only session cookie would be dropped here.
test("the Admin rejects a wrong password and keeps a session over local HTTP across a reload", async ({
  page,
}) => {
  await openPage(page, `${backendUrl}/app/login`)

  const rejected = page.waitForResponse(isPath("/auth/user/emailpass"))
  await submitAdminLogin(page, {
    email: admin.email,
    password: `${admin.password}-wrong`,
  })
  expect((await rejected).status()).toBe(401)
  await expect(page.getByText("Invalid email or password")).toBeVisible()
  await expect(page).toHaveURL(/\/app\/login/)

  const signedIn = currentUserResponse(page)
  await submitAdminLogin(page, admin)
  expect((await signedIn).status()).toBe(200)
  await page.waitForURL((url) => !url.pathname.endsWith("/login"))
  const signedInUrl = page.url()

  const afterReload = currentUserResponse(page)
  await page.reload()
  expect((await afterReload).status()).toBe(200)
  await expect(page).toHaveURL(signedInUrl)
  await expect(page.getByText(admin.email)).toBeVisible()
})
