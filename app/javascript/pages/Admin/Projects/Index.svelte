<script lang="ts">
  import { router, Link } from '@inertiajs/svelte'
  import Pagination from '@/components/Pagination.svelte'
  import type { AdminProjectRow, PagyProps } from '@/types'

  let props: { projects: AdminProjectRow[]; pagy: PagyProps; query: string } = $props()
  let searchQuery = $state(props.query)

  function search(e: Event) {
    e.preventDefault()
    router.get('/admin/projects', { query: searchQuery }, { preserveState: true })
  }
</script>

<div class="max-w-6xl mx-auto py-8">
  <h1 class="font-bold text-4xl mb-6">Admin: Projects</h1>

  <form onsubmit={search} class="mb-6">
    <div class="flex gap-2">
      <input
        type="search"
        bind:value={searchQuery}
        placeholder="Search projects..."
        class="border rounded px-3 py-2 flex-1"
      />
      <button type="submit" class="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300 cursor-pointer">Search</button>
    </div>
  </form>

  <table class="w-full border-collapse">
    <thead>
      <tr class="border-b text-left">
        <th class="py-2 px-3">Name</th>
        <th class="py-2 px-3">Owner</th>
        <th class="py-2 px-3">Ships</th>
        <th class="py-2 px-3">Unlisted</th>
        <th class="py-2 px-3">Created</th>
      </tr>
    </thead>
    <tbody>
      {#each props.projects as project}
        <tr class="border-b hover:bg-gray-50" class:opacity-50={project.is_discarded}>
          <td class="py-2 px-3">
            <Link href="/admin/projects/{project.id}" class="text-blue-600 hover:underline">{project.name}</Link>
            {#if project.is_discarded}
              <span class="text-xs text-red-500 ml-1">Deleted</span>
            {/if}
          </td>
          <td class="py-2 px-3"
            ><Link href="/admin/users/{project.user_id}" class="text-blue-600 hover:underline"
              >{project.user_display_name}</Link
            ></td
          >
          <td class="py-2 px-3">{project.ships_count}</td>
          <td class="py-2 px-3">{project.is_unlisted ? 'Yes' : 'No'}</td>
          <td class="py-2 px-3">{project.created_at}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <Pagination pagy={props.pagy} />
</div>
