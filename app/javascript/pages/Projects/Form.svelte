<script lang="ts">
  import { useForm, page } from '@inertiajs/svelte'
  import type { ProjectForm, SharedProps } from '@/types'

  let props: {
    project: ProjectForm
    title: string
    submit_url: string
    method: string
  } = $props()

  let shared = $derived($page.props as unknown as SharedProps)

  let form = useForm({
    name: props.project.name,
    description: props.project.description,
    demo_link: props.project.demo_link,
    repo_link: props.project.repo_link,
    is_unlisted: props.project.is_unlisted,
    tags: props.project.tags,
  })

  function submit(e: Event) {
    e.preventDefault()
    if (props.method === 'patch') {
      $form.patch(props.submit_url)
    } else {
      $form.post(props.submit_url)
    }
  }
</script>

<div class="max-w-2xl mx-auto py-8">
  <h1 class="font-bold text-4xl mb-6">{props.title}</h1>

  <form onsubmit={submit} class="space-y-4">
    {#if Object.keys(shared.errors).length > 0}
      <div class="bg-red-50 text-red-700 p-4 rounded mb-4">
        <ul>
          {#each Object.entries(shared.errors) as [field, messages]}
            {#each messages as msg}
              <li>{field} {msg}</li>
            {/each}
          {/each}
        </ul>
      </div>
    {/if}

    <div>
      <label for="name" class="block text-sm font-medium text-gray-700">Name</label>
      <input
        type="text"
        id="name"
        bind:value={$form.name}
        class="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
        required
      />
    </div>

    <div>
      <label for="description" class="block text-sm font-medium text-gray-700">Description</label>
      <textarea
        id="description"
        bind:value={$form.description}
        rows="4"
        class="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
      ></textarea>
    </div>

    <div>
      <label for="demo_link" class="block text-sm font-medium text-gray-700">Demo link</label>
      <input
        type="url"
        id="demo_link"
        bind:value={$form.demo_link}
        class="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
        placeholder="https://"
      />
    </div>

    <div>
      <label for="repo_link" class="block text-sm font-medium text-gray-700">Repo link</label>
      <input
        type="url"
        id="repo_link"
        bind:value={$form.repo_link}
        class="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
        placeholder="https://"
      />
    </div>

    <div>
      <label class="inline-flex items-center gap-2">
        <input type="checkbox" bind:checked={$form.is_unlisted} class="rounded border-gray-300" />
        <span class="text-sm text-gray-700">Unlisted</span>
      </label>
    </div>

    <div>
      <button
        type="submit"
        class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer"
        disabled={$form.processing}
      >
        {$form.processing ? 'Saving...' : 'Save'}
      </button>
    </div>
  </form>
</div>
