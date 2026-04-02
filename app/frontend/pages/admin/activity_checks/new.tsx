import { useForm } from '@inertiajs/react'
import { FormEvent } from 'react'

interface Segment {
  start_min: number
  end_min: number
  duration_min: number
}

interface Results {
  inactive_frames: number
  total_frames: number
  inactive_percentage: number
  segments: Segment[]
}

export default function AdminActivityChecksNew({ results }: { results?: Results }) {
  const { data, setData, post, processing } = useForm<{ video: File | null }>({ video: null })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!data.video) return
    post('/admin/activity_checks', { forceFormData: true })
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="font-bold text-4xl mb-2">Timelapse Activity Check</h1>
      <p className="text-brown mb-8">
        Upload a timelapse video to analyze frame-by-frame activity. Each frame represents 1 minute.
      </p>

      <form onSubmit={handleSubmit} className="mb-8">
        <div className="flex items-end gap-4">
          <label className="flex-1">
            <span className="block text-sm font-medium mb-1">Video file</span>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setData('video', e.target.files?.[0] ?? null)}
              className="block w-full text-sm border border-dark-brown rounded-lg p-2 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-brown file:text-white hover:file:bg-dark-brown"
            />
          </label>
          <button
            type="submit"
            disabled={!data.video || processing}
            className="px-6 py-2 bg-brown text-white rounded-lg font-medium disabled:opacity-50 hover:bg-dark-brown"
          >
            {processing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </form>

      {results && <ActivityResults results={results} />}
    </div>
  )
}

function ActivityResults({ results }: { results: Results }) {
  const activePercentage = (100 - results.inactive_percentage).toFixed(1)

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Frames" value={results.total_frames} subtitle="1 frame = 1 minute" />
        <StatCard
          label="Active"
          value={`${activePercentage}%`}
          subtitle={`${results.total_frames - results.inactive_frames} active transitions`}
        />
        <StatCard
          label="Inactive"
          value={`${results.inactive_percentage}%`}
          subtitle={`${results.inactive_frames} idle transitions`}
          warn={results.inactive_percentage > 30}
        />
      </div>

      <h2 className="font-bold text-xl mb-3">Timeline</h2>
      <Timeline totalFrames={results.total_frames} segments={results.segments} />

      {results.segments.length > 0 && (
        <>
          <h2 className="font-bold text-xl mt-8 mb-3">Inactive Segments</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 px-3">Start</th>
                <th className="py-2 px-3">End</th>
                <th className="py-2 px-3">Duration</th>
              </tr>
            </thead>
            <tbody>
              {results.segments.map((seg, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-3">Minute {seg.start_min}</td>
                  <td className="py-2 px-3">Minute {seg.end_min}</td>
                  <td className="py-2 px-3">{seg.duration_min} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  subtitle,
  warn,
}: {
  label: string
  value: string | number
  subtitle: string
  warn?: boolean
}) {
  return (
    <div className={`border rounded-lg p-4 ${warn ? 'border-red-400 bg-red-50' : 'border-dark-brown'}`}>
      <div className="text-sm text-brown">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs text-brown mt-1">{subtitle}</div>
    </div>
  )
}

function Timeline({ totalFrames, segments }: { totalFrames: number; segments: Segment[] }) {
  if (totalFrames === 0) return null

  const inactiveSet = new Set<number>()
  for (const seg of segments) {
    for (let i = seg.start_min; i <= seg.end_min; i++) {
      inactiveSet.add(i)
    }
  }

  return (
    <div>
      <div className="flex w-full h-8 rounded overflow-hidden border border-dark-brown">
        {Array.from({ length: totalFrames }, (_, i) => {
          const inactive = inactiveSet.has(i)
          return (
            <div
              key={i}
              className={inactive ? 'bg-red-400' : 'bg-green-500'}
              style={{ flex: 1 }}
              title={`Minute ${i}${inactive ? ' (idle)' : ''}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-xs text-brown mt-1">
        <span>0 min</span>
        <span>{totalFrames} min</span>
      </div>
    </div>
  )
}
