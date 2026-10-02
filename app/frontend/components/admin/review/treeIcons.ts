import type { FileTreeIcons } from '@pierre/trees'

// Same construction as the built-in "complete" set: 16×16 page with a folded corner (.bg at .4) and a
// glyph (.fg). Built-ins get color from a data-icon-token CSS rule that custom icons can't join, so
// the color is set inline, using the same fallback chain the built-in tokens use.
const PAGE =
  '<path fill="currentColor" d="M8 4a3 3 0 0 0 3 3h3v5.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 12.5v-9A2.5 2.5 0 0 1 4.5 1H8z" class="bg" opacity=".4"/>'
const FOLD = 'M9.5 1a.5.5 0 0 1 .354.146l4 4A.5.5 0 0 1 14 5.5V6h-3a2 2 0 0 1-2-2V1z'

type Tint = 'green' | 'blue' | 'purple' | 'orange' | 'indigo'

interface CustomIcon {
  id: string
  tint: Tint
  /** Each entry is its own evenodd path, so holes stay holes without overlapping shapes cancelling out. */
  glyph: string[]
  extensions: string[]
}

const ICONS: CustomIcon[] = [
  {
    // IC package: body with a pin-1 dot knocked out, two pins per side
    id: 'fallout-tree-kicad',
    tint: 'green',
    glyph: [
      'M6 8h4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5v-4A.5.5 0 0 1 6 8zm1.5 1.25a.5.5 0 1 0-1 0 .5.5 0 0 0 1 0zM4.5 8.75H5v1h-.5a.5.5 0 0 1 0-1zm0 2.5H5v1h-.5a.5.5 0 0 1 0-1zM11 8.75h.5a.5.5 0 0 1 0 1H11zm0 2.5h.5a.5.5 0 0 1 0 1H11z',
    ],
    extensions: [
      'kicad_sch',
      'kicad_pcb',
      'kicad_pro',
      'kicad_prl',
      'kicad_sym',
      'kicad_mod',
      'kicad_dru',
      'kicad_wks',
    ],
  },
  {
    // PCB trace: two drilled pads joined by a 45° route
    id: 'fallout-tree-easyeda',
    tint: 'indigo',
    glyph: [
      'M5 11a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm0 .75a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1zM10.75 8a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm0 .75a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z',
      'M5.5 11.75h2.04l2.5-2.5.71.71-2.79 2.79H5.5z',
    ],
    extensions: ['epro', 'eproproject', 'esch', 'epcb'],
  },
  {
    // Layer stack: one board layer over another
    id: 'fallout-tree-gerber',
    tint: 'orange',
    glyph: ['M8 7.5l3.5 1.75L8 11 4.5 9.25zM4.5 11l1.1-.55L8 11.65l2.4-1.2 1.1.55L8 12.75z'],
    extensions: [
      'gbr',
      'ger',
      'gtl',
      'gbl',
      'gts',
      'gbs',
      'gto',
      'gbo',
      'gtp',
      'gbp',
      'gm1',
      'gm2',
      'gko',
      'drl',
      'xln',
    ],
  },
  {
    // Triangulated surface: a mesh face split into facets
    id: 'fallout-tree-mesh',
    tint: 'purple',
    glyph: ['M8 7.76 6.28 10.12h3.44zM6 10.51l-1.72 2.36h3.44zM10 10.51l-1.72 2.36h3.44z'],
    extensions: ['stl', 'obj', 'gltf', 'glb', 'ply', '3mf'],
  },
  {
    // Isometric cube: three faces separated by hairline gaps (solid-body CAD, interchange or native)
    id: 'fallout-tree-cad',
    tint: 'blue',
    glyph: [
      'M8 7.5l2.75 1.59L8 10.68 5.25 9.09zM5.25 9.67l2.45 1.41v2.42l-2.45-1.41zM10.75 9.67 8.3 11.08v2.42l2.45-1.41z',
    ],
    extensions: ['step', 'stp', 'f3d', 'f3z', 'sldprt', 'sldasm', 'ipt', 'iam', 'fcstd', 'skp', '3dm', 'blend'],
  },
]

function symbol({ id, tint, glyph }: CustomIcon) {
  const fg = [...glyph, FOLD].map((d) => `<path fill="currentColor" fill-rule="evenodd" d="${d}" class="fg"/>`).join('')
  return `<symbol id="${id}" viewBox="0 0 16 16"><g style="color: var(--trees-file-icon-color, var(--trees-icon-${tint}))">${PAGE}${fg}</g></symbol>`
}

export const REPO_TREE_ICONS: FileTreeIcons = {
  // Custom rules switch the default set to "none" unless it's named explicitly.
  set: 'complete',
  spriteSheet: `<svg aria-hidden="true" width="0" height="0">${ICONS.map(symbol).join('')}</svg>`,
  byFileExtension: Object.fromEntries(ICONS.flatMap(({ id, extensions }) => extensions.map((ext) => [ext, id]))),
}
