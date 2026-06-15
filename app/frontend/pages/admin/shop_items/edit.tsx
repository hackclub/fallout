import { useState, type ReactNode } from 'react'
import { useForm, Link, router } from '@inertiajs/react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import ShopItemForm from '@/components/admin/shop/ShopItemForm'
import { Button } from '@/components/admin/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/admin/ui/alert-dialog'
import { type ShopItem, type ShopItemFormData } from '@/components/admin/shop/shopItem'

export default function AdminShopItemsEdit({ shop_item }: { shop_item: ShopItem }) {
  const form = useForm<ShopItemFormData>({
    name: shop_item.name,
    description: shop_item.description,
    price: shop_item.price,
    image_url: shop_item.image_url,
    status: shop_item.status,
    featured: shop_item.featured,
    currency: shop_item.currency,
    grants_streak_freeze: shop_item.grants_streak_freeze,
    requires_shipping: shop_item.requires_shipping,
    requires_date_selection: shop_item.requires_date_selection,
  })
  const [deleting, setDeleting] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    form.transform((data) => ({ shop_item: data }))
    form.patch(`/admin/shop_items/${shop_item.id}`)
  }

  function destroy() {
    setDeleting(true)
    router.delete(`/admin/shop_items/${shop_item.id}`, { onFinish: () => setDeleting(false) })
  }

  const orders = shop_item.orders_count ?? 0

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/shop_items"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Shop items
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{shop_item.name}</h1>
          <p className="text-sm text-muted-foreground">
            {orders === 0 ? 'No orders yet' : `${orders} order${orders === 1 ? '' : 's'}`}
            {shop_item.created_at && ` · added ${shop_item.created_at}`}
          </p>
        </div>
      </div>

      <ShopItemForm
        form={form}
        onSubmit={submit}
        submitLabel="Save changes"
        footer={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive">
                <Trash2 className="size-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{shop_item.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  {orders > 0
                    ? `This item has ${orders} order${orders === 1 ? '' : 's'}. Items with orders can't be deleted — set it to Unavailable instead to hide it from the shop.`
                    : 'This permanently removes the item from the shop. This cannot be undone.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                {orders === 0 && (
                  <AlertDialogAction
                    onClick={destroy}
                    disabled={deleting}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {deleting ? 'Deleting…' : 'Delete item'}
                  </AlertDialogAction>
                )}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />
    </div>
  )
}

AdminShopItemsEdit.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
