import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
  ViewUpdate,
  Decoration,
  DecorationSet,
  ViewPlugin,
} from '@codemirror/view'
import { EditorState, RangeSetBuilder } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'

const boldMark = Decoration.mark({ class: 'cm-md-bold' })
const italicMark = Decoration.mark({ class: 'cm-md-italic' })
const markerMark = Decoration.mark({ class: 'cm-md-marker' })
const h1Mark = Decoration.mark({ class: 'cm-md-h1' })
const h2Mark = Decoration.mark({ class: 'cm-md-h2' })
const h3Mark = Decoration.mark({ class: 'cm-md-h3' })
const h4Mark = Decoration.mark({ class: 'cm-md-h4' })
const codeMark = Decoration.mark({ class: 'cm-md-code' })
const linkMark = Decoration.mark({ class: 'cm-md-link' })
const imageMark = Decoration.mark({ class: 'cm-md-image' })
const blockquoteMark = Decoration.mark({ class: 'cm-md-blockquote' })
const hrMark = Decoration.mark({ class: 'cm-md-hr' })
const strikethroughMark = Decoration.mark({ class: 'cm-md-strikethrough' })

function headingMarkForLevel(level: number) {
  switch (level) {
    case 1:
      return h1Mark
    case 2:
      return h2Mark
    case 3:
      return h3Mark
    default:
      return h4Mark
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tree = syntaxTree(view.state)

  tree.iterate({
    enter(node) {
      const { from, to, name } = node
      const doc = view.state.doc

      if (name.startsWith('ATXHeading')) {
        const level = parseInt(name.replace('ATXHeading', ''), 10) || 1
        const line = doc.lineAt(from)
        const text = doc.sliceString(line.from, line.to)
        const hashMatch = text.match(/^(#{1,6})\s/)
        if (hashMatch) {
          const hashEnd = line.from + hashMatch[1].length
          if (line.from < hashEnd) builder.add(line.from, hashEnd, markerMark)
          if (hashEnd < line.to) builder.add(hashEnd, line.to, headingMarkForLevel(level))
        }
        return false
      }

      if (name === 'StrongEmphasis') {
        const text = doc.sliceString(from, to)
        const mLen = text.startsWith('**') ? 2 : 1
        builder.add(from, from + mLen, markerMark)
        if (from + mLen < to - mLen) builder.add(from + mLen, to - mLen, boldMark)
        builder.add(to - mLen, to, markerMark)
        return false
      }

      if (name === 'Emphasis') {
        builder.add(from, from + 1, markerMark)
        if (from + 1 < to - 1) builder.add(from + 1, to - 1, italicMark)
        builder.add(to - 1, to, markerMark)
        return false
      }

      if (name === 'InlineCode' || name === 'FencedCode') {
        builder.add(from, to, codeMark)
        return false
      }

      if (name === 'Link') {
        builder.add(from, to, linkMark)
        return false
      }

      if (name === 'Image') {
        builder.add(from, to, imageMark)
        return false
      }

      if (name === 'Blockquote') {
        builder.add(from, to, blockquoteMark)
        return false
      }

      if (name === 'HorizontalRule') {
        builder.add(from, to, hrMark)
        return false
      }

      if (name === 'Strikethrough') {
        builder.add(from, from + 2, markerMark)
        if (from + 2 < to - 2) builder.add(from + 2, to - 2, strikethroughMark)
        builder.add(to - 2, to, markerMark)
        return false
      }
    },
  })

  return builder.finish()
}

const markdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.state) !== syntaxTree(update.startState)) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

export type CodeMirrorHandle = {
  getView: () => EditorView | null
}

type CodeMirrorEditorProps = {
  value: string
  onChange: (value: string) => void
  onPaste?: (e: ClipboardEvent, view: EditorView) => boolean
  onDrop?: (e: DragEvent, view: EditorView) => boolean
  placeholderText?: string
  className?: string
  extraKeys?: { key: string; run: (view: EditorView) => boolean }[]
}

const CodeMirrorEditor = forwardRef<CodeMirrorHandle, CodeMirrorEditorProps>(function CodeMirrorEditor(
  { value, onChange, onPaste, onDrop, placeholderText, className, extraKeys },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onPasteRef = useRef(onPaste)
  onPasteRef.current = onPaste
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  useImperativeHandle(ref, () => ({ getView: () => viewRef.current }), [])

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString())
      }
    })

    const domHandlers = EditorView.domEventHandlers({
      paste(e, view) {
        return onPasteRef.current?.(e, view) ?? false
      },
      drop(e, view) {
        return onDropRef.current?.(e, view) ?? false
      },
    })

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...(extraKeys ?? []), ...defaultKeymap, ...historyKeymap]),
        markdown(),
        markdownDecorations,
        updateListener,
        domHandlers,
        EditorView.lineWrapping,
        ...(placeholderText ? [cmPlaceholder(placeholderText)] : []),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit' },
          '.cm-content': { padding: '16px', caretColor: '#61453a' },
          '.cm-line': { padding: '0' },
          '&.cm-focused': { outline: 'none' },
          '.cm-placeholder': {
            color: 'rgba(97, 69, 58, 0.3)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            position: 'absolute',
            pointerEvents: 'none',
          },
          '.cm-md-marker': { opacity: '0.35' },
          '.cm-md-bold': { fontWeight: 'bold' },
          '.cm-md-italic': { fontStyle: 'italic' },
          '.cm-md-h1': { fontSize: '1.75em', fontWeight: 'bold', lineHeight: '1.3' },
          '.cm-md-h2': { fontSize: '1.45em', fontWeight: 'bold', lineHeight: '1.3' },
          '.cm-md-h3': { fontSize: '1.2em', fontWeight: 'bold', lineHeight: '1.3' },
          '.cm-md-h4': { fontSize: '1.05em', fontWeight: 'bold', lineHeight: '1.3' },
          '.cm-md-code': {
            fontFamily: 'monospace',
            backgroundColor: 'rgba(97, 69, 58, 0.08)',
            borderRadius: '3px',
            padding: '1px 3px',
          },
          '.cm-md-link': { color: '#007BDA', textDecoration: 'underline' },
          '.cm-md-image': { color: '#37B576' },
          '.cm-md-blockquote': {
            borderLeft: '3px solid rgba(97, 69, 58, 0.3)',
            paddingLeft: '8px',
            color: 'rgba(97, 69, 58, 0.7)',
          },
          '.cm-md-hr': { opacity: '0.4' },
          '.cm-md-strikethrough': { textDecoration: 'line-through' },
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      })
    }
  }, [value])

  return <div ref={containerRef} className={`overflow-hidden ${className ?? ''}`} data-cm-editor />
})

export default CodeMirrorEditor
