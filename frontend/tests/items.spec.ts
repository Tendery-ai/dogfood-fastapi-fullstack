import { expect, type Page, test } from "@playwright/test"
import { createUser } from "./utils/privateApi"
import {
  randomEmail,
  randomItemDescription,
  randomItemTitle,
  randomPassword,
} from "./utils/random"
import { logInUser } from "./utils/user"

test("Items page is accessible and shows correct title", async ({ page }) => {
  await page.goto("/items")
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible()
  await expect(page.getByText("Create and manage your items")).toBeVisible()
})

test("Add Item button is visible", async ({ page }) => {
  await page.goto("/items")
  await expect(page.getByRole("button", { name: "Add Item" })).toBeVisible()
})

test.describe("Items management", () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  let email: string
  const password = randomPassword()

  test.beforeAll(async () => {
    email = randomEmail()
    await createUser({ email, password })
  })

  test.beforeEach(async ({ page }) => {
    await logInUser(page, email, password)
    await page.goto("/items")
  })

  test("Create a new item successfully", async ({ page }) => {
    const title = randomItemTitle()
    const description = randomItemDescription()

    await page.getByRole("button", { name: "Add Item" }).click()
    await page.getByLabel("Title").fill(title)
    await page.getByLabel("Description").fill(description)
    await page.getByRole("button", { name: "Save" }).click()

    await expect(page.getByText("Item created successfully")).toBeVisible()
    await expect(page.getByText(title)).toBeVisible()
  })

  test("Create item with only required fields", async ({ page }) => {
    const title = randomItemTitle()

    await page.getByRole("button", { name: "Add Item" }).click()
    await page.getByLabel("Title").fill(title)
    await page.getByRole("button", { name: "Save" }).click()

    await expect(page.getByText("Item created successfully")).toBeVisible()
    await expect(page.getByText(title)).toBeVisible()
  })

  test("Cancel item creation", async ({ page }) => {
    await page.getByRole("button", { name: "Add Item" }).click()
    await page.getByLabel("Title").fill("Test Item")
    await page.getByRole("button", { name: "Cancel" }).click()

    await expect(page.getByRole("dialog")).not.toBeVisible()
  })

  test("Title is required", async ({ page }) => {
    await page.getByRole("button", { name: "Add Item" }).click()
    await page.getByLabel("Title").fill("")
    await page.getByLabel("Title").blur()

    await expect(page.getByText("Title is required")).toBeVisible()
  })

  test.describe("Search", () => {
    const search = (page: Page) => page.getByLabel("Search items")

    test("Filters by title and description, ignoring case", async ({
      page,
    }) => {
      const token = Math.random().toString(36).substring(2, 10)
      const byTitle = `Title ${token}`
      const byDescription = `Other ${randomItemTitle()}`
      const unrelated = randomItemTitle()

      for (const [title, description] of [
        [byTitle, "plain"],
        [byDescription, `has ${token} inside`],
        [unrelated, "nothing"],
      ]) {
        await page.getByRole("button", { name: "Add Item" }).click()
        await page.getByLabel("Title").fill(title)
        await page.getByLabel("Description").fill(description)
        await page.getByRole("button", { name: "Save" }).click()
        await expect(page.getByText("Item created successfully")).toBeVisible()
        await expect(page.getByRole("dialog")).not.toBeVisible()
      }

      await search(page).fill(token.toUpperCase())

      await expect(page.getByText(byTitle)).toBeVisible()
      await expect(page.getByText(byDescription)).toBeVisible()
      await expect(page.getByText(unrelated)).not.toBeVisible()

      await search(page).fill("")
      await expect(page.getByText(unrelated)).toBeVisible()
    })

    test("Shows a message when nothing matches", async ({ page }) => {
      await search(page).fill(`no-match-${Math.random().toString(36)}`)

      await expect(page.getByText("No items match your search")).toBeVisible()
    })

    test("Debounces typing and sends a single request", async ({ page }) => {
      const keywords: (string | null)[] = []
      await page.route("**/api/v1/items/?*", async (route) => {
        keywords.push(new URL(route.request().url()).searchParams.get("q"))
        await route.continue()
      })

      await search(page).pressSequentially("abc", { delay: 20 })
      await expect(page.getByText("No items match your search")).toBeVisible()

      expect(keywords).toContain("abc")
      expect(keywords).not.toContain("a")
      expect(keywords).not.toContain("ab")
    })

    test("Returns to page 1 when the keyword changes", async ({ page }) => {
      const makeItems = (prefix: string) =>
        Array.from({ length: 12 }, (_, n) => ({
          id: `00000000-0000-0000-0000-${prefix}${String(n).padStart(11, "0")}`,
          title: `${prefix}-item-${n}`,
          description: null,
          owner_id: "00000000-0000-0000-0000-000000000000",
          created_at: null,
        }))

      await page.route("**/api/v1/items/?*", async (route) => {
        const q = new URL(route.request().url()).searchParams.get("q")
        const data = makeItems(q ? "bbbbbbbbbbbb" : "aaaaaaaaaaaa")
        await route.fulfill({ json: { data, count: data.length } })
      })

      await page.goto("/items")
      await page.getByRole("button", { name: "Go to next page" }).click()
      const previous = page.getByRole("button", { name: "Go to previous page" })
      await expect(previous).toBeEnabled()

      await search(page).fill("item")

      await expect(page.getByText("bbbbbbbbbbbb-item-0")).toBeVisible()
      await expect(previous).toBeDisabled()
    })
  })

  test.describe("Edit and Delete", () => {
    let itemTitle: string

    test.beforeEach(async ({ page }) => {
      itemTitle = randomItemTitle()

      await page.getByRole("button", { name: "Add Item" }).click()
      await page.getByLabel("Title").fill(itemTitle)
      await page.getByRole("button", { name: "Save" }).click()
      await expect(page.getByText("Item created successfully")).toBeVisible()
      await expect(page.getByRole("dialog")).not.toBeVisible()
    })

    test("Edit an item successfully", async ({ page }) => {
      const itemRow = page.getByRole("row").filter({ hasText: itemTitle })
      await itemRow.getByRole("button").last().click()
      await page.getByRole("menuitem", { name: "Edit Item" }).click()

      const updatedTitle = randomItemTitle()
      await page.getByLabel("Title").fill(updatedTitle)
      await page.getByRole("button", { name: "Save" }).click()

      await expect(page.getByText("Item updated successfully")).toBeVisible()
      await expect(page.getByText(updatedTitle)).toBeVisible()
    })

    test("Delete an item successfully", async ({ page }) => {
      const itemRow = page.getByRole("row").filter({ hasText: itemTitle })
      await itemRow.getByRole("button").last().click()
      await page.getByRole("menuitem", { name: "Delete Item" }).click()

      await page.getByRole("button", { name: "Delete" }).click()

      await expect(
        page.getByText("The item was deleted successfully"),
      ).toBeVisible()
      await expect(page.getByText(itemTitle)).not.toBeVisible()
    })
  })
})

test.describe("Items empty state", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("Shows empty state message when no items exist", async ({ page }) => {
    const email = randomEmail()
    const password = randomPassword()
    await createUser({ email, password })
    await logInUser(page, email, password)

    await page.goto("/items")

    await expect(page.getByText("You don't have any items yet")).toBeVisible()
    await expect(page.getByText("Add a new item to get started")).toBeVisible()
  })
})
