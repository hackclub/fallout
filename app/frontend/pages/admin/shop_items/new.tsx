import type { ReactNode } from 'react'
import { useForm, Link } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import AdminLayout from '@/layouts/AdminLayout'
import ShopItemForm from '@/components/admin/shop/ShopItemForm'
import { BLANK_FORM, type ShopItemFormData } from '@/components/admin/shop/shopItem'

export default function AdminShopItemsNew() {
  const form = useForm<ShopItemFormData>({ ...BLANK_FORM })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    form.transform((data) => ({ shop_item: data }))
    form.post('/admin/shop_items')
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/shop_items"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Shop items
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New shop item</h1>
      <ShopItemForm form={form} onSubmit={submit} submitLabel="Create item" />
    </div>
  )
}

AdminShopItemsNew.layout = (page: ReactNode) => <AdminLayout>{page}</AdminLayout>
