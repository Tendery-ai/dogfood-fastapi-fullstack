import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { Suspense, useState } from "react"

import { ItemsService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import AddItem from "@/components/Items/AddItem"
import { columns } from "@/components/Items/columns"
import PendingItems from "@/components/Pending/PendingItems"
import { Input } from "@/components/ui/input"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"

function getItemsQueryOptions(keyword: string) {
  return {
    queryFn: () =>
      ItemsService.readItems({
        skip: 0,
        limit: 100,
        q: keyword || undefined,
      }),
    queryKey: ["items", { q: keyword }],
  }
}

export const Route = createFileRoute("/_layout/items")({
  component: Items,
  head: () => ({
    meta: [
      {
        title: "Items - FastAPI Template",
      },
    ],
  }),
})

function ItemsTableContent({ keyword }: { keyword: string }) {
  const { data: items } = useSuspenseQuery(getItemsQueryOptions(keyword))

  if (items.data.length === 0 && keyword) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">No items match your search</h3>
        <p className="text-muted-foreground">Try a different keyword</p>
      </div>
    )
  }

  if (items.data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">You don't have any items yet</h3>
        <p className="text-muted-foreground">Add a new item to get started</p>
      </div>
    )
  }

  return (
    <DataTable columns={columns} data={items.data} resetPageKey={keyword} />
  )
}

function ItemsTable({ keyword }: { keyword: string }) {
  return (
    <Suspense fallback={<PendingItems />}>
      <ItemsTableContent keyword={keyword} />
    </Suspense>
  )
}

function Items() {
  const [search, setSearch] = useState("")
  const keyword = useDebouncedValue(search.trim(), 300)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Items</h1>
          <p className="text-muted-foreground">Create and manage your items</p>
        </div>
        <AddItem />
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Search items"
          placeholder="Search items..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <ItemsTable keyword={keyword} />
    </div>
  )
}
