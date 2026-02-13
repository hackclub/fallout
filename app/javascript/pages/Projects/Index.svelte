<script lang="ts">
  import { router, Link } from '@inertiajs/svelte'
  import Pagination from '@/components/Pagination.svelte'
  import type { ProjectCard, PagyProps } from '@/types'

  let props: { projects: ProjectCard[]; pagy: PagyProps; query: string } = $props()
  let searchQuery = $state(props.query)

  function search(e: Event) {
    e.preventDefault()
    router.get('/projects', { query: searchQuery }, { preserveState: true })
  }
</script>

<div class="max-w-4xl mx-auto py-8">
  <div class="flex items-center justify-between mb-6">
    <h1 class="font-bold text-4xl">Projects</h1>
    <Link href="/projects/new" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">New Project</Link>
  </div>

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

  {#if props.projects.length > 0}
    {#each props.projects as project}
      <div class="border rounded-lg p-4 mb-4">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">
            <Link href="/projects/{project.id}" class="hover:underline">{project.name}</Link>
          </h2>
          {#if project.is_unlisted}
            <span class="text-sm text-gray-500">Unlisted</span>
          {/if}
        </div>

        {#if project.description}
          <p class="text-gray-600 mt-2">{project.description}</p>
        {/if}

        {#if project.tags.length > 0}
          <div class="flex flex-wrap gap-2 mt-2">
            {#each project.tags as tag}
              <span class="bg-gray-100 text-gray-700 text-sm px-2 py-1 rounded">{tag}</span>
            {/each}
          </div>
        {/if}

        <div class="flex gap-4 mt-3 text-sm text-gray-500">
          <span>by {project.user_display_name}</span>
          <span>{project.ships_count} ships</span>
        </div>
      </div>
    {/each}

    <Pagination pagy={props.pagy} />
  {:else}
    <p class="text-gray-500">No projects yet.</p>
  {/if}
</div>
