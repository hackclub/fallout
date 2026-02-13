<script lang="ts">
  import { useForm, page } from '@inertiajs/svelte'
  import type { ShipForm, SharedProps } from '@/types'

  let props: { ship: ShipForm; statuses: string[] } = $props()

  let shared = $derived($page.props as unknown as SharedProps)

  let form = useForm({
    status: props.ship.status,
    feedback: props.ship.feedback,
    justification: props.ship.justification,
    approved_seconds: props.ship.approved_seconds,
  })

  function submit(e: Event) {
    e.preventDefault()
    $form.patch(`/admin/reviews/${props.ship.id}`)
  }
</script>

<div class="max-w-2xl mx-auto py-8">
  <h1 class="font-bold text-4xl mb-2">Review Ship #{props.ship.id}</h1>
  <p class="text-gray-500 mb-6">for {props.ship.project_name} by {props.ship.user_display_name}</p>

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
      <label for="status" class="block text-sm font-medium text-gray-700">Status</label>
      <select id="status" bind:value={$form.status} class="mt-1 block w-full border border-gray-300 rounded px-3 py-2">
        {#each props.statuses as status}
          <option value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
        {/each}
      </select>
    </div>

    <div>
      <label for="feedback" class="block text-sm font-medium text-gray-700">Feedback</label>
      <textarea
        id="feedback"
        bind:value={$form.feedback}
        rows="4"
        class="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
      ></textarea>
    </div>

    <div>
      <label for="justification" class="block text-sm font-medium text-gray-700">Justification</label>
      <input
        type="text"
        id="justification"
        bind:value={$form.justification}
        class="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
      />
    </div>

    <div>
      <label for="approved_seconds" class="block text-sm font-medium text-gray-700">Approved seconds</label>
      <input
        type="number"
        id="approved_seconds"
        bind:value={$form.approved_seconds}
        class="mt-1 block w-full border border-gray-300 rounded px-3 py-2"
      />
    </div>

    <div>
      <button
        type="submit"
        class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 cursor-pointer"
        disabled={$form.processing}
      >
        {$form.processing ? 'Updating...' : 'Update Ship'}
      </button>
    </div>
  </form>
</div>
