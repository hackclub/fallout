<script lang="ts">
  import { router, Link } from '@inertiajs/svelte'
  import Pagination from '@/components/Pagination.svelte'
  import type { AdminUserRow, PagyProps } from '@/types'

  let props: { users: AdminUserRow[]; pagy: PagyProps; query: string } = $props()
  let searchQuery = $state(props.query)

  function search(e: Event) {
    e.preventDefault()
    router.get('/admin/users', { query: searchQuery }, { preserveState: true })
  }
</script>

<div class="max-w-6xl mx-auto py-8">
  <h1 class="font-bold text-4xl mb-6">Admin: Users</h1>

  <form onsubmit={search} class="mb-6">
    <div class="flex gap-2">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Search users..."
        class="border rounded px-3 py-2 flex-1"
      />
      <button type="submit" class="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 cursor-pointer">Search</button>
    </div>
  </form>

  <table class="w-full border-collapse">
    <thead>
      <tr class="border-b text-left">
        <th class="py-2 px-3">Name</th>
        <th class="py-2 px-3">Email</th>
        <th class="py-2 px-3">Roles</th>
        <th class="py-2 px-3">Projects</th>
        <th class="py-2 px-3">Joined</th>
      </tr>
    </thead>
    <tbody>
      {#each props.users as user}
        <tr class="border-b hover:bg-gray-50" class:opacity-50={user.is_discarded}>
          <td class="py-2 px-3">
            <Link href="/admin/users/{user.id}" class="text-blue-600 hover:underline">{user.display_name}</Link>
            {#if user.is_discarded}
              <span class="text-xs text-red-500 ml-1">Deleted</span>
            {/if}
          </td>
          <td class="py-2 px-3">{user.email}</td>
          <td class="py-2 px-3">{user.roles.join(', ')}</td>
          <td class="py-2 px-3">{user.projects_count}</td>
          <td class="py-2 px-3">{user.created_at}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <Pagination pagy={props.pagy} />
</div>
