import { useMemo } from 'react'
import { createPlayer } from '@videojs/react'
import { MinimalVideoSkin, Video, videoFeatures } from '@videojs/react/video'
import '@videojs/react/video/minimal-skin.css'
import { ArrowUpRightIcon, ClapperboardIcon, GlobeIcon } from 'lucide-react'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { parseVideoUrl, type VideoSource } from '@/lib/videoEmbed'

const WatchPlayer = createPlayer({ features: videoFeatures })

export interface WatchLink {
  label: string
  url: string | null | undefined
}

interface WatchItem {
  source: VideoSource
  labels: string[]
}

/** Plays every distinct demo link; links pointing at the same video collapse into one player. */
export default function WatchPanel({ links }: { links: WatchLink[] }) {
  const items = useMemo(() => {
    const byKey = new Map<string, WatchItem>()
    for (const { label, url } of links) {
      const source = url ? parseVideoUrl(url) : null
      if (!source) continue
      const existing = byKey.get(source.key)
      if (existing) {
        if (!existing.labels.includes(label)) existing.labels.push(label)
      } else {
        byKey.set(source.key, { source, labels: [label] })
      }
    }
    // videos first, plain links after
    return [...byKey.values()].sort((a, b) => Number(a.source.kind === 'link') - Number(b.source.kind === 'link'))
  }, [links])

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
        <ClapperboardIcon className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No demo links</p>
        <p className="text-xs text-muted-foreground">This project has no demo video or playable URL.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8 p-6">
        {items.map((item) => (
          <WatchCard key={item.source.key} item={item} />
        ))}
      </div>
    </div>
  )
}

function WatchCard({ item: { source, labels } }: { item: WatchItem }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        {labels.map((l) => (
          <Badge key={l} variant="secondary">
            {l}
          </Badge>
        ))}
        <span className="text-xs text-muted-foreground shrink-0">{source.provider}</span>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground hover:underline truncate min-w-0"
        >
          {source.url}
        </a>
        <Button variant="outline" size="sm" className="ml-auto shrink-0" asChild>
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            Open
            <ArrowUpRightIcon data-icon="inline-end" />
          </a>
        </Button>
      </div>

      {source.kind === 'link' ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4">
          <GlobeIcon className="size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Not a video link. Open it in a new tab to check the demo.</p>
        </div>
      ) : (
        <div
          className={`overflow-hidden rounded-lg border border-border bg-black shadow-sm ${
            source.kind === 'embed' && source.vertical ? 'mx-auto aspect-9/16 h-[75vh]' : 'aspect-video w-full'
          }`}
        >
          {source.kind === 'embed' ? (
            <iframe
              src={source.src}
              title={`${source.provider} demo`}
              className="size-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <WatchPlayer.Provider>
              <MinimalVideoSkin style={{ width: '100%', height: '100%' }}>
                <Video src={source.src} playsInline preload="metadata" className="size-full bg-black" />
              </MinimalVideoSkin>
            </WatchPlayer.Provider>
          )}
        </div>
      )}
    </section>
  )
}
