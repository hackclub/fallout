import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { DirectUpload } from '@rails/activestorage'
import { EditorView } from '@codemirror/view'
import CodeMirrorEditor, { type CodeMirrorHandle } from './CodeMirrorEditor'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  onBlobsChange: (signedIds: string[]) => void
  placeholder?: string
  directUploadUrl: string
  previewUrl: string
  minChars?: number
  minImages?: number
  draftStatus?: string | null
  onFullscreen?: () => void
  onShrink?: () => void
}

// --- Helpers ---

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return '1 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isInsideWord(value: string, pos: number): boolean {
  return pos > 0 && pos < value.length && /\w/.test(value[pos - 1]) && /\w/.test(value[pos])
}

function expandToWordBoundaries(value: string, pos: number): [number, number] {
  let start = pos
  let end = pos
  while (start > 0 && /\w/.test(value[start - 1])) start--
  while (end < value.length && /\w/.test(value[end])) end++
  return [start, end]
}

type InsertResult = { newValue: string; cursorStart: number; cursorEnd: number }

function wrapSelection(value: string, start: number, end: number, prefix: string, suffix: string): InsertResult {
  if (start !== end) {
    // Check if selection is exactly the content between markers → unwrap
    if (
      start >= prefix.length &&
      value.slice(start - prefix.length, start) === prefix &&
      value.slice(end, end + suffix.length) === suffix
    ) {
      const newValue =
        value.slice(0, start - prefix.length) + value.slice(start, end) + value.slice(end + suffix.length)
      return { newValue, cursorStart: start - prefix.length, cursorEnd: end - prefix.length }
    }
    const selected = value.slice(start, end)
    const newValue = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    return { newValue, cursorStart: start + prefix.length, cursorEnd: end + prefix.length }
  }

  // Cursor between empty markers → unwrap
  if (
    start >= prefix.length &&
    value.slice(start - prefix.length, start) === prefix &&
    value.slice(start, start + suffix.length) === suffix
  ) {
    const newValue = value.slice(0, start - prefix.length) + value.slice(start + suffix.length)
    const cursorPos = start - prefix.length
    return { newValue, cursorStart: cursorPos, cursorEnd: cursorPos }
  }

  if (isInsideWord(value, start)) {
    const [wordStart, wordEnd] = expandToWordBoundaries(value, start)
    const word = value.slice(wordStart, wordEnd)
    // Check if word is wrapped with markers outside → unwrap
    if (
      wordStart >= prefix.length &&
      value.slice(wordStart - prefix.length, wordStart) === prefix &&
      value.slice(wordEnd, wordEnd + suffix.length) === suffix
    ) {
      const newValue = value.slice(0, wordStart - prefix.length) + word + value.slice(wordEnd + suffix.length)
      const cursorPos = start - prefix.length
      return { newValue, cursorStart: cursorPos, cursorEnd: cursorPos }
    }
    // Check if markers are embedded in word (e.g. _hello_ where _ is \w)
    if (word.length > prefix.length + suffix.length && word.startsWith(prefix) && word.endsWith(suffix)) {
      const inner = word.slice(prefix.length, word.length - suffix.length)
      const newValue = value.slice(0, wordStart) + inner + value.slice(wordEnd)
      const cursorPos = start - prefix.length
      return { newValue, cursorStart: cursorPos, cursorEnd: cursorPos }
    }
    const newValue = value.slice(0, wordStart) + prefix + word + suffix + value.slice(wordEnd)
    const cursorPos = start + prefix.length
    return { newValue, cursorStart: cursorPos, cursorEnd: cursorPos }
  }

  const newValue = value.slice(0, start) + prefix + suffix + value.slice(end)
  const cursorPos = start + prefix.length
  return { newValue, cursorStart: cursorPos, cursorEnd: cursorPos }
}

function insertCodeBlock(value: string, start: number, end: number): InsertResult {
  let content = ''
  let selStart = start
  let selEnd = end

  if (start !== end) {
    content = value.slice(start, end).trim()
  } else if (isInsideWord(value, start)) {
    ;[selStart, selEnd] = expandToWordBoundaries(value, start)
    content = value.slice(selStart, selEnd).trim()
  }

  const before = value.slice(0, selStart).replace(/[^\S\n]+$/, '')
  const after = value.slice(selEnd).replace(/^[^\S\n]+/, '')
  const needNewlineBefore = before.length > 0 && !before.endsWith('\n\n')
  const needNewlineAfter = after.length > 0 && !after.startsWith('\n\n')

  const prefix = needNewlineBefore ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
  const suffix = needNewlineAfter ? (after.startsWith('\n') ? '\n' : '\n\n') : ''

  const block = `${prefix}\`\`\`\n${content}\n\`\`\`${suffix}`
  const newValue = before + block + after

  const cursorPos = before.length + prefix.length + 4 + (content.length > 0 ? 0 : 0)
  const cursorOffset =
    content.length > 0 ? before.length + prefix.length + 4 + content.length : before.length + prefix.length + 4

  return { newValue, cursorStart: cursorOffset, cursorEnd: cursorOffset }
}

function prefixLines(value: string, start: number, end: number, prefixStr: string, ordered: boolean): InsertResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEnd =
    end === value.length
      ? end
      : value.indexOf('\n', end - 1) === -1
        ? value.length
        : end > start && value[end - 1] === '\n'
          ? end - 1
          : value.indexOf('\n', end) === -1
            ? value.length
            : value.indexOf('\n', end)

  const actualLineEnd = value.indexOf('\n', Math.max(end - 1, lineStart))
  const sliceEnd = actualLineEnd === -1 ? value.length : actualLineEnd

  const lines = value.slice(lineStart, sliceEnd).split('\n')

  const allWereNumbered = ordered && lines.every((line) => /^\d+\. /.test(line))
  const prefixed = lines.map((line) => {
    if (ordered) {
      const olMatch = line.match(/^(\d+)\. /)
      if (olMatch) return line.slice(olMatch[0].length)
      return line
    }
    if (line.startsWith(prefixStr)) {
      return line.slice(prefixStr.length)
    }
    return prefixStr + line
  })

  if (ordered) {
    if (!allWereNumbered) {
      for (let i = 0; i < prefixed.length; i++) {
        prefixed[i] = `${i + 1}. ${prefixed[i].replace(/^\d+\. /, '')}`
      }
    }
  }

  const joined = prefixed.join('\n')
  let newValue = value.slice(0, lineStart) + joined + value.slice(sliceEnd)

  // Renumber subsequent ordered list items after a toggle-off
  if (ordered && allWereNumbered) {
    const afterPos = lineStart + joined.length
    const afterText = newValue.slice(afterPos)
    const afterLines = afterText.split('\n')
    let num = 1
    let started = false
    let changed = false
    for (let i = 0; i < afterLines.length; i++) {
      if (i === 0 && afterLines[i] === '') continue
      const m = afterLines[i].match(/^(\d+)\. /)
      if (m) {
        afterLines[i] = `${num}. ${afterLines[i].slice(m[0].length)}`
        num++
        started = true
        changed = true
      } else if (started) {
        break
      }
    }
    if (changed) {
      newValue = newValue.slice(0, afterPos) + afterLines.join('\n')
    }
  }

  const cursorPos = lineStart + joined.length
  return { newValue, cursorStart: cursorPos, cursorEnd: cursorPos }
}

function insertLink(value: string, start: number, end: number): InsertResult {
  if (start !== end) {
    const selected = value.slice(start, end)
    const newValue = value.slice(0, start) + `[${selected}](url)` + value.slice(end)
    const urlStart = start + selected.length + 3
    return { newValue, cursorStart: urlStart, cursorEnd: urlStart + 3 }
  }
  const newValue = value.slice(0, start) + '[](url)' + value.slice(end)
  const cursorPos = start + 1
  return { newValue, cursorStart: cursorPos, cursorEnd: cursorPos }
}

function handleTab(value: string, start: number, end: number, shift: boolean): InsertResult {
  if (shift) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineContent = value.slice(lineStart)
    const spacesToRemove = lineContent.startsWith('  ') ? 2 : lineContent.startsWith(' ') ? 1 : 0
    if (spacesToRemove === 0) return { newValue: value, cursorStart: start, cursorEnd: end }
    const newValue = value.slice(0, lineStart) + value.slice(lineStart + spacesToRemove)
    return {
      newValue,
      cursorStart: Math.max(lineStart, start - spacesToRemove),
      cursorEnd: Math.max(lineStart, end - spacesToRemove),
    }
  }
  const newValue = value.slice(0, start) + '  ' + value.slice(end)
  return { newValue, cursorStart: start + 2, cursorEnd: start + 2 }
}

// --- Toolbar Icon Components (from marksmith gem) ---

function BoldIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinejoin="round"
        d="M6.75 3.744h-.753v8.25h7.125a4.125 4.125 0 0 0 0-8.25H6.75Zm0 0v.38m0 16.122h6.747a4.5 4.5 0 0 0 0-9.001h-7.5v9h.753Zm0 0v-.37m0-15.751h6a3.75 3.75 0 1 1 0 7.5h-6m0-7.5v7.5m0 0v8.25m0-8.25h6.375a4.125 4.125 0 0 1 0 8.25H6.75m.747-15.38h4.875a3.375 3.375 0 0 1 0 6.75H7.497v-6.75Zm0 7.5h5.25a3.75 3.75 0 0 1 0 7.5h-5.25v-7.5Z"
      />
    </svg>
  )
}

function HeadingIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 12h12" />
      <path d="M6 20V4" />
      <path d="M18 20V4" />
    </svg>
  )
}

function ItalicIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.248 20.246H9.05m0 0h3.696m-3.696 0 5.893-16.502m0 0h-3.697m3.697 0h3.803" />
    </svg>
  )
}

function QuoteIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 6H3" />
      <path d="M21 12H8" />
      <path d="M21 18H8" />
      <path d="M3 12v6" />
    </svg>
  )
}

function CodeIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  )
}

function LinkIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  )
}

function UnorderedListIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  )
}

function OrderedListIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.242 5.992h12m-12 6.003H20.24m-12 5.999h12M4.117 7.495v-3.75H2.99m1.125 3.75H2.99m1.125 0H5.24m-1.92 2.577a1.125 1.125 0 1 1 1.591 1.59l-1.83 1.83h2.16M2.99 15.745h1.125a1.125 1.125 0 0 1 0 2.25H3.74m0-.002h.375a1.125 1.125 0 0 1 0 2.25H2.99" />
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
    </svg>
  )
}

function MarkdownBadge() {
  return (
    <a
      href="https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax"
      target="_blank"
      rel="noopener noreferrer"
      className="text-dark-brown/50 hover:text-dark-brown transition-colors"
      title="Markdown is supported"
    >
      <svg className="w-6 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.269 19.385H1.731a1.73 1.73 0 0 1-1.73-1.73V6.345a1.73 1.73 0 0 1 1.73-1.73h20.538a1.73 1.73 0 0 1 1.73 1.73v11.308a1.73 1.73 0 0 1-1.73 1.731zm-16.5-3.462v-4.5l2.308 2.885 2.307-2.885v4.5h2.308V8.078h-2.308l-2.307 2.885-2.308-2.885H3.461v7.847zM21.231 12h-2.308V8.077h-2.307V12h-2.308l3.461 4.039z" />
      </svg>
    </a>
  )
}

// --- Toolbar Button ---

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-1.5 rounded text-dark-brown/70 hover:text-dark-brown hover:bg-dark-brown/10 transition-colors cursor-pointer"
    >
      {children}
    </button>
  )
}

// --- Apply helper for CodeMirror ---

function applyToEditor(
  cmRef: React.RefObject<CodeMirrorHandle | null>,
  fn: (value: string, start: number, end: number) => InsertResult,
) {
  const view = cmRef.current?.getView()
  if (!view) return
  const { from, to } = view.state.selection.main
  const value = view.state.doc.toString()
  const result = fn(value, from, to)
  view.dispatch({
    changes: { from: 0, to: value.length, insert: result.newValue },
    selection: { anchor: result.cursorStart, head: result.cursorEnd },
  })
  view.focus()
}

// --- Main Component ---

export default function MarkdownEditor({
  value,
  onChange,
  onBlobsChange,
  placeholder,
  directUploadUrl,
  previewUrl,
  minChars,
  minImages,
  draftStatus,
  onFullscreen,
  onShrink,
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [blobSignedIds, setBlobSignedIds] = useState<string[]>([])
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const cmRef = useRef<CodeMirrorHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  // Fetch server-rendered preview when switching to preview tab
  useEffect(() => {
    if (tab !== 'preview') return
    if (!value.trim()) {
      setPreviewHtml('')
      return
    }

    setPreviewLoading(true)
    const controller = new AbortController()
    const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content

    fetch(previewUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: JSON.stringify({ content: value }),
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        setPreviewHtml(data.html)
        setPreviewLoading(false)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setPreviewLoading(false)
      })

    return () => controller.abort()
  }, [tab, value, previewUrl])

  const updateBlobs = useCallback(
    (newId: string) => {
      setBlobSignedIds((prev) => {
        const next = [...prev, newId]
        onBlobsChange(next)
        return next
      })
    },
    [onBlobsChange],
  )

  const replaceInValue = useCallback(
    (prefix: string, replacement: string) => {
      const pattern = new RegExp(escapeRegex(prefix) + '.*?-->')
      const newValue = valueRef.current.replace(pattern, replacement)
      onChange(newValue)
    },
    [onChange],
  )

  const uploadFiles = useCallback(
    (files: File[]) => {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue

        const sizeStr = formatFileSize(file.size)
        const placeholderPrefix = `<!-- Uploading ${file.name} (${sizeStr})...`
        const placeholderFull = `${placeholderPrefix} -->\n`

        const sep = valueRef.current.length > 0 && !valueRef.current.endsWith('\n') ? '\n' : ''
        const newVal = valueRef.current + sep + placeholderFull
        onChange(newVal)

        const upload = new DirectUpload(file, directUploadUrl, {
          directUploadWillStoreFileWithXHR(request: XMLHttpRequest) {
            request.upload.addEventListener('progress', (event: ProgressEvent) => {
              if (!event.lengthComputable) return
              const percent = Math.round((event.loaded / event.total) * 100)
              const status = percent >= 100 ? 'Processing...' : `${percent}%`
              replaceInValue(placeholderPrefix, `${placeholderPrefix} ${status} -->`)
            })
          },
        })

        upload.create((error: Error, blob: { signed_id: string; filename: string }) => {
          if (error) {
            replaceInValue(placeholderPrefix, `<!-- Upload failed: ${file.name} -->`)
            return
          }
          const imgMarkdown = `![${blob.filename}](/user-attachments/blobs/redirect/${blob.signed_id}/${blob.filename})`
          replaceInValue(placeholderPrefix, imgMarkdown)
          updateBlobs(blob.signed_id)
        })
      }
    },
    [directUploadUrl, onChange, replaceInValue, updateBlobs],
  )

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const apply = useCallback((fn: (value: string, start: number, end: number) => InsertResult) => {
    applyToEditor(cmRef, fn)
  }, [])

  const extraKeys = useMemo(
    () => [
      {
        key: 'Mod-b',
        run: (view: EditorView) => {
          applyToEditor(cmRef, (v, s, e) => wrapSelection(v, s, e, '**', '**'))
          return true
        },
      },
      {
        key: 'Mod-i',
        run: (view: EditorView) => {
          applyToEditor(cmRef, (v, s, e) => wrapSelection(v, s, e, '_', '_'))
          return true
        },
      },
      {
        key: 'Mod-e',
        run: (view: EditorView) => {
          applyToEditor(cmRef, insertCodeBlock)
          return true
        },
      },
      {
        key: 'Mod-k',
        run: (view: EditorView) => {
          applyToEditor(cmRef, insertLink)
          return true
        },
      },
      {
        key: 'Tab',
        run: (view: EditorView) => {
          applyToEditor(cmRef, (v, s, e) => handleTab(v, s, e, false))
          return true
        },
      },
      {
        key: 'Shift-Tab',
        run: (view: EditorView) => {
          applyToEditor(cmRef, (v, s, e) => handleTab(v, s, e, true))
          return true
        },
      },
    ],
    [],
  )

  const handlePaste = useCallback(
    (e: ClipboardEvent, view: EditorView): boolean => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imageFiles = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null)

      if (imageFiles.length > 0) {
        e.preventDefault()
        uploadFiles(imageFiles)
        return true
      }

      const text = e.clipboardData?.getData('text/plain') ?? ''
      const { from, to } = view.state.selection.main
      if (from !== to && /^https?:\/\//.test(text)) {
        e.preventDefault()
        const selected = view.state.sliceDoc(from, to)
        const replacement = `[${selected}](${text})`
        view.dispatch({
          changes: { from, to, insert: replacement },
          selection: { anchor: from + 1, head: from + 1 + selected.length },
        })
        return true
      }

      return false
    },
    [uploadFiles],
  )

  const handleDrop = useCallback(
    (e: DragEvent, view: EditorView): boolean => {
      e.preventDefault()
      const allFiles = Array.from(e.dataTransfer?.files ?? [])
      const imageFiles = allFiles.filter((f) => f.type.startsWith('image/'))
      const unsupportedFiles = allFiles.filter((f) => !f.type.startsWith('image/'))

      if (imageFiles.length > 0) uploadFiles(imageFiles)

      if (unsupportedFiles.length > 0) {
        const comments = unsupportedFiles.map((f) => `<!-- ${f.name} is not a supported file -->`).join('\n')
        const pos = view.state.selection.main.head
        view.dispatch({ changes: { from: pos, insert: comments } })
      }

      return true
    },
    [uploadFiles],
  )

  const charCount = value.length
  const imageCount = (value.match(/!\[[^\]]*\]\([^)]*\)/g) || []).length

  return (
    <>
      <div className="border-2 border-dark-brown rounded overflow-hidden bg-white h-full flex flex-col">
        {/* Tabs */}
        <div className="flex items-center border-b border-dark-brown/20 bg-light-brown/30 px-3 py-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTab('write')}
              className={`px-3 py-1 text-sm font-bold rounded cursor-pointer transition-colors ${
                tab === 'write' ? 'text-dark-brown bg-white' : 'text-dark-brown/50 hover:text-dark-brown'
              }`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setTab('preview')}
              className={`px-3 py-1 text-sm font-bold rounded cursor-pointer transition-colors ${
                tab === 'preview' ? 'text-dark-brown bg-white' : 'text-dark-brown/50 hover:text-dark-brown'
              }`}
            >
              Preview
            </button>
          </div>
        </div>

        {/* Toolbar */}
        {tab === 'write' && (
          <div className="flex items-center gap-0.5 border-b-2 border-dark-brown bg-light-brown/30 px-3 py-1">
            <ToolbarButton onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '**', '**'))} title="Bold (Cmd+B)">
              <BoldIcon />
            </ToolbarButton>
            <ToolbarButton onClick={() => apply((v, s, e) => prefixLines(v, s, e, '### ', false))} title="Heading">
              <HeadingIcon />
            </ToolbarButton>
            <ToolbarButton onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '_', '_'))} title="Italic (Cmd+I)">
              <ItalicIcon />
            </ToolbarButton>
            <div className="w-px h-4 bg-dark-brown/20 mx-1" />
            <ToolbarButton onClick={() => apply((v, s, e) => prefixLines(v, s, e, '> ', false))} title="Quote">
              <QuoteIcon />
            </ToolbarButton>
            <ToolbarButton onClick={() => apply(insertCodeBlock)} title="Code block (Cmd+E)">
              <CodeIcon />
            </ToolbarButton>
            <ToolbarButton onClick={() => apply(insertLink)} title="Link (Cmd+K)">
              <LinkIcon />
            </ToolbarButton>
            <div className="w-px h-4 bg-dark-brown/20 mx-1" />
            <ToolbarButton onClick={openFilePicker} title="Upload image">
              <ImageIcon />
            </ToolbarButton>
            <ToolbarButton onClick={() => apply((v, s, e) => prefixLines(v, s, e, '- ', false))} title="Unordered list">
              <UnorderedListIcon />
            </ToolbarButton>
            <ToolbarButton onClick={() => apply((v, s, e) => prefixLines(v, s, e, '', true))} title="Ordered list">
              <OrderedListIcon />
            </ToolbarButton>
          </div>
        )}

        {/* Editor / Preview area */}
        <div className="flex-1 min-h-0 flex flex-col">
          {tab === 'write' ? (
            <CodeMirrorEditor
              ref={cmRef}
              value={value}
              onChange={onChange}
              onPaste={handlePaste}
              onDrop={handleDrop}
              extraKeys={extraKeys}
              placeholderText={
                placeholder ??
                'Write a few sentences about what you did...\nHow you did it...\nWhat went well, etc...\n\nInclude some images of your work!\n\nTip: Markdown is supported and you can drag and drop images.'
              }
              className="flex-1 min-h-32 text-dark-brown"
            />
          ) : (
            <div className="p-4 flex-1 min-h-0 overflow-y-auto">
              {previewLoading ? (
                <p className="text-dark-brown/30 italic">Loading preview...</p>
              ) : value ? (
                /* Server-sanitized HTML via sanitize_user_html — safe to render */
                <div
                  className="markdown-content"
                  style={{ margin: 0, padding: 0 }}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              ) : (
                <p className="text-dark-brown/30 italic">Nothing to preview</p>
              )}
            </div>
          )}
        </div>

        {/* Bottom bar: Upload zone + Markdown badge */}
        <div className="flex items-center justify-between border-t-2 border-dark-brown bg-light-brown/30 px-3 py-2">
          <button
            type="button"
            onClick={openFilePicker}
            className="flex items-center gap-2 text-sm text-dark-brown/50 hover:text-dark-brown transition-colors cursor-pointer"
          >
            <PaperclipIcon />
            <span>Paste, click, or drop to add images</span>
          </button>
          {onFullscreen ? (
            <button
              type="button"
              onClick={onFullscreen}
              className="text-dark-brown/50 hover:text-dark-brown transition-colors cursor-pointer"
              title="Fullscreen editor"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                />
              </svg>
            </button>
          ) : onShrink ? (
            <button
              type="button"
              onClick={onShrink}
              className="text-dark-brown/50 hover:text-dark-brown transition-colors cursor-pointer"
              title="Exit fullscreen"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25"
                />
              </svg>
            </button>
          ) : (
            <MarkdownBadge />
          )}
        </div>

        {/* Validation counters */}
        {(minChars != null || minImages != null) && (
          <div className="flex items-center justify-end gap-4 px-3 py-1 text-xs border-t border-dark-brown/10">
            {minChars != null && (
              <span className={charCount >= minChars ? 'text-dark-brown/50' : 'text-red-500'}>
                Min characters: {charCount}/{minChars}
              </span>
            )}
            {minImages != null && (
              <span className={imageCount >= minImages ? 'text-dark-brown/50' : 'text-red-500'}>
                Min images: {imageCount}/{minImages}
              </span>
            )}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) uploadFiles(files)
            e.target.value = ''
          }}
        />
      </div>
      {draftStatus && <p className="text-xs text-dark-brown mt-1.5">{draftStatus}</p>}
    </>
  )
}
