'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Heading from '@tiptap/extension-heading'
import { toPlainDoc } from '@/lib/content/article-schema'
import type { PMDocument } from '@/lib/content/article-schema'

interface Props {
  initialContent: PMDocument | null
  editable?: boolean
  placeholder?: string
  onUpdate?: (doc: PMDocument) => void
  onSave?: (doc: PMDocument) => void
}

const SAVE_DEBOUNCE_MS = 2000

// ── Toolbar button ──────────────────────────────────────────────────────────

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={[
        'flex h-7 w-7 items-center justify-center rounded-md text-caption transition-colors',
        active
          ? 'bg-accent/10 text-accent-text'
          : 'text-text-muted hover:bg-surface-raised hover:text-text',
        disabled ? 'cursor-not-allowed opacity-40' : '',
      ].join(' ')}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return <span className="h-5 w-px bg-border" />
}

// ── Main editor ─────────────────────────────────────────────────────────────

export function TiptapEditor({ initialContent, editable = true, placeholder, onUpdate, onSave }: Props) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSaveRef = useRef(onSave)
  const onUpdateRef = useRef(onUpdate)

  // Keep the latest callbacks in refs so the Tiptap instance (created once)
  // always calls the current handlers. Writing a ref during render is not
  // allowed in React 19 — do it in an effect instead.
  useEffect(() => {
    onSaveRef.current = onSave
    onUpdateRef.current = onUpdate
  }, [onSave, onUpdate])

  /**
   * True while we are pushing server content into the editor. Programmatic
   * setContent fires onUpdate exactly like typing does, and autosaving that
   * echo is how a stale tab overwrites a freshly generated article.
   */
  const applyingRemoteRef = useRef(false)

  /** Set once the user actually types. Nothing is persisted before that. */
  const userHasEditedRef = useRef(false)

  const scheduleSave = useCallback((doc: PMDocument) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      onSaveRef.current?.(doc)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable heading from StarterKit — we configure it separately
        heading: false,
        // Disable unwanted extensions
        codeBlock: false,
        horizontalRule: false,
      }),
      // Constrained heading: H1 only at doc root (set by pipeline), H2-H4 for body
      Heading.configure({ levels: [1, 2, 3, 4] }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          class: 'rounded-lg max-w-full h-auto my-6',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-accent-text underline underline-offset-2',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? 'Write here…',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: initialContent ?? undefined,
    editable,
    editorProps: {
      attributes: {
        class: 'compass-prose focus:outline-none',
        'data-testid': 'tiptap-editor',
      },
    },
    onUpdate({ editor }) {
      const doc = toPlainDoc(editor.getJSON()) as PMDocument
      onUpdateRef.current?.(doc)

      // Echo of our own setContent, not a human edit — never persist it.
      if (applyingRemoteRef.current) return

      userHasEditedRef.current = true
      scheduleSave(doc)
    },
  })

  // Adopt server content when it arrives — typically the generated draft
  // landing while this tab was already open.
  //
  // The previous condition was `editor.isEmpty`, which sounds equivalent but
  // is not: a tab opened during generation holds an empty editor, and once
  // Tiptap inserts its default empty paragraph the editor is no longer
  // "empty", so the real draft was never adopted. The stale view then saved
  // itself over the generated article.
  //
  // Anything the user has actually typed wins — we never clobber their work.
  useEffect(() => {
    if (!editor || !initialContent) return
    if (userHasEditedRef.current) return

    const incoming = JSON.stringify(initialContent)
    if (incoming === JSON.stringify(editor.getJSON())) return

    applyingRemoteRef.current = true
    try {
      editor.commands.setContent(initialContent)
    } finally {
      applyingRemoteRef.current = false
    }
  }, [editor, initialContent])

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  // Flush save on unmount
  useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return
      clearTimeout(saveTimerRef.current)
      // A pending timer means a real edit is in flight; flush it. Without the
      // userHasEdited guard an untouched tab could still flush on unmount.
      if (userHasEditedRef.current && editor && !editor.isEmpty) {
        onSaveRef.current?.(toPlainDoc(editor.getJSON()) as PMDocument)
      }
    }
  }, [editor])

  if (!editor) {
    return (
      <div className="compass-prose animate-pulse">
        <div className="mb-4 h-8 w-2/3 rounded-lg bg-surface-raised" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-4 rounded bg-surface-raised" style={{ width: `${85 + (i % 3) * 5}%` }} />
          ))}
        </div>
      </div>
    )
  }

  const setLink = () => {
    const url = window.prompt('Link URL:')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    } else if (url === '') {
      editor.chain().focus().unsetLink().run()
    }
  }

  const addImage = () => {
    const url = window.prompt('Image URL:')
    if (url) {
      editor.chain().focus().setImage({ src: url, alt: '' }).run()
    }
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Toolbar */}
      {editable && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-surface/90 backdrop-blur-sm px-2 py-1.5 mb-6 rounded-t-lg">
          {/* Text format */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive('bold')}
            title="Bold (⌘B)"
          >
            <svg width="13" height="14" viewBox="0 0 13 14" fill="currentColor">
              <path d="M3 2h4.5a3 3 0 010 6H3V2zm0 6h5a3 3 0 010 6H3V8z" />
            </svg>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive('italic')}
            title="Italic (⌘I)"
          >
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 2h5M2 12h5M7 2L5 12" strokeLinecap="round" />
            </svg>
          </ToolbarButton>

          <ToolbarDivider />

          {/* Headings */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor.isActive('heading', { level: 2 })}
            title="Heading H2"
          >
            <span className="text-caption font-bold leading-none">H2</span>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            active={editor.isActive('heading', { level: 3 })}
            title="Heading H3"
          >
            <span className="text-caption font-bold leading-none">H3</span>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}
            active={editor.isActive('heading', { level: 4 })}
            title="Heading H4"
          >
            <span className="text-caption font-bold leading-none">H4</span>
          </ToolbarButton>

          <ToolbarDivider />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive('bulletList')}
            title="Bullet list"
          >
            <svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="2" cy="2" r="1" fill="currentColor" />
              <circle cx="2" cy="6" r="1" fill="currentColor" />
              <circle cx="2" cy="10" r="1" fill="currentColor" />
              <path d="M5 2h8M5 6h8M5 10h8" strokeLinecap="round" />
            </svg>
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive('orderedList')}
            title="Numbered list"
          >
            <svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1h1.5v3.5M1 4.5h2.5" strokeLinecap="round" />
              <path d="M5 2h8M5 6h8M5 10h8" strokeLinecap="round" />
              <path d="M1 7.5c0-.8.7-1 1.2-1 .5 0 1.3.2 1.3 1s-1 1-1 1 1.5.3 1.5 1.3S2.8 11 2 11s-1-.5-1-1" strokeLinecap="round" />
            </svg>
          </ToolbarButton>

          <ToolbarDivider />

          {/* Link */}
          <ToolbarButton
            onClick={setLink}
            active={editor.isActive('link')}
            title="Insert link (⌘K)"
          >
            <svg width="15" height="8" viewBox="0 0 15 8" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 4H2a2 2 0 010-4h3" strokeLinecap="round" />
              <path d="M9 4h4a2 2 0 000-4h-3" strokeLinecap="round" />
              <path d="M5 2h5" strokeLinecap="round" />
            </svg>
          </ToolbarButton>

          {/* Image */}
          <ToolbarButton
            onClick={addImage}
            title="Insert image"
          >
            <svg width="14" height="13" viewBox="0 0 14 13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="1" width="12" height="11" rx="1.5" />
              <circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
              <path d="M1 9l3-3 2.5 2.5L9 6l4 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </ToolbarButton>
        </div>
      )}

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Compass prose styles */}
      <style>{`
        .compass-prose h1 {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 2rem;
          line-height: 2.5rem;
          font-weight: 400;
          color: var(--text);
          margin-bottom: 1.5rem;
          margin-top: 0;
        }
        .compass-prose h2 {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 1.5rem;
          line-height: 2rem;
          font-weight: 400;
          color: var(--text);
          margin-top: 2.5rem;
          margin-bottom: 0.75rem;
        }
        .compass-prose h3 {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 1.25rem;
          line-height: 1.75rem;
          font-weight: 400;
          color: var(--text);
          margin-top: 2rem;
          margin-bottom: 0.5rem;
        }
        .compass-prose h4 {
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 1rem;
          line-height: 1.5rem;
          font-weight: 500;
          color: var(--text);
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .compass-prose p {
          font-size: 1rem;
          line-height: 1.75rem;
          color: var(--text);
          margin-bottom: 1rem;
        }
        .compass-prose a {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .compass-prose ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .compass-prose ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 1rem;
        }
        .compass-prose li {
          margin-bottom: 0.375rem;
          line-height: 1.75rem;
          color: var(--text);
        }
        .compass-prose blockquote {
          border-left: 3px solid var(--accent);
          padding-left: 1rem;
          margin-left: 0;
          margin-bottom: 1rem;
          color: var(--text-muted);
          font-style: italic;
        }
        .compass-prose code {
          background: var(--surface-raised);
          border-radius: 0.25rem;
          padding: 0.125rem 0.375rem;
          font-size: 0.875rem;
          color: var(--text);
        }
        .compass-prose .is-editor-empty::before {
          content: attr(data-placeholder);
          float: left;
          color: var(--input-placeholder);
          pointer-events: none;
          height: 0;
        }
        .compass-prose .ProseMirror-focused {
          outline: none;
        }
      `}</style>
    </div>
  )
}
