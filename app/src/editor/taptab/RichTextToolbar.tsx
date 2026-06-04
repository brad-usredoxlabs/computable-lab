/**
 * RichTextToolbar — pure presentation. Given a TipTap `Editor` instance,
 * renders the bold / italic / underline / code / headings / lists /
 * blockquote / link / hr buttons. Each button reads its active state from
 * the editor so it stays in sync when the cursor moves; each click runs a
 * chain on the editor.
 *
 * The toolbar owns NO state — that includes the `editor` itself. Mounting
 * concerns (useEditor lifecycle, extensions list, debounced save) live in
 * `DocumentEditorContext`. This separation lets the same toolbar render
 * inside AppShell's `viewerToolbar` slot OR inline above an embedded
 * editor (e.g. a future record-edit pane in `/browser`) without dragging
 * its own state along.
 */

import type { Editor } from '@tiptap/react'

export interface RichTextToolbarProps {
  /** The Editor instance to drive. `null` when the editor isn't ready yet
   *  (TipTap's useEditor returns null on the first render). The toolbar
   *  renders disabled buttons in that case so the layout doesn't shift. */
  editor: Editor | null
}

export function RichTextToolbar({ editor }: RichTextToolbarProps) {
  const ready = editor !== null
  return (
    <div
      className="viewer-toolbar viewer-toolbar--document rich-text-toolbar"
      role="toolbar"
      aria-label="Rich text formatting"
      data-testid="rich-text-toolbar"
    >
      <ToolbarGroup>
        <MarkButton
          editor={editor}
          mark="bold"
          label="Bold"
          shortcut="⌘B"
          icon={<strong>B</strong>}
          testId="rt-bold"
        />
        <MarkButton
          editor={editor}
          mark="italic"
          label="Italic"
          shortcut="⌘I"
          icon={<em>I</em>}
          testId="rt-italic"
        />
        <MarkButton
          editor={editor}
          mark="underline"
          label="Underline"
          shortcut="⌘U"
          icon={<span style={{ textDecoration: 'underline' }}>U</span>}
          testId="rt-underline"
        />
        <MarkButton
          editor={editor}
          mark="code"
          label="Inline code"
          shortcut="⌘E"
          icon={<code>{'</>'}</code>}
          testId="rt-code"
        />
      </ToolbarGroup>
      <Divider />
      <ToolbarGroup>
        <HeadingButton editor={editor} level={1} testId="rt-h1" />
        <HeadingButton editor={editor} level={2} testId="rt-h2" />
        <HeadingButton editor={editor} level={3} testId="rt-h3" />
      </ToolbarGroup>
      <Divider />
      <ToolbarGroup>
        <NodeButton
          editor={editor}
          predicate={(e) => e.isActive('bulletList')}
          run={(e) => e.chain().focus().toggleBulletList().run()}
          label="Bulleted list"
          icon="•"
          testId="rt-ul"
          disabled={!ready}
        />
        <NodeButton
          editor={editor}
          predicate={(e) => e.isActive('orderedList')}
          run={(e) => e.chain().focus().toggleOrderedList().run()}
          label="Numbered list"
          icon="1."
          testId="rt-ol"
          disabled={!ready}
        />
        <NodeButton
          editor={editor}
          predicate={(e) => e.isActive('blockquote')}
          run={(e) => e.chain().focus().toggleBlockquote().run()}
          label="Block quote"
          icon="“ ”"
          testId="rt-blockquote"
          disabled={!ready}
        />
      </ToolbarGroup>
      <Divider />
      <ToolbarGroup>
        <LinkButton editor={editor} />
        <NodeButton
          editor={editor}
          predicate={() => false}
          run={(e) => e.chain().focus().setHorizontalRule().run()}
          label="Horizontal rule"
          icon="—"
          testId="rt-hr"
          disabled={!ready}
        />
      </ToolbarGroup>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="rich-text-toolbar__group">{children}</div>
}

function Divider() {
  return <span className="rich-text-toolbar__divider" aria-hidden />
}

interface MarkButtonProps {
  editor: Editor | null
  mark: 'bold' | 'italic' | 'underline' | 'code'
  label: string
  shortcut?: string
  icon: React.ReactNode
  testId: string
}

function MarkButton({ editor, mark, label, shortcut, icon, testId }: MarkButtonProps) {
  const active = editor?.isActive(mark) ?? false
  const disabled = editor === null
  return (
    <button
      type="button"
      className={
        active
          ? 'rich-text-toolbar__btn rich-text-toolbar__btn--active'
          : 'rich-text-toolbar__btn'
      }
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        if (!editor) return
        // Generic toggle dispatch — each mark has a typed chain method
        // named `toggle<Capitalized>`. Using the runtime lookup keeps the
        // four buttons sharing this one code path without ts-grumbling.
        const chain = editor.chain().focus() as unknown as Record<
          string,
          () => { run: () => boolean }
        >
        const fn = chain[`toggle${capitalize(mark)}`]
        if (typeof fn === 'function') fn.call(chain).run()
      }}
    >
      {icon}
    </button>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function HeadingButton({
  editor,
  level,
  testId,
}: {
  editor: Editor | null
  level: 1 | 2 | 3
  testId: string
}) {
  const active = editor?.isActive('heading', { level }) ?? false
  const disabled = editor === null
  return (
    <button
      type="button"
      className={
        active
          ? 'rich-text-toolbar__btn rich-text-toolbar__btn--active'
          : 'rich-text-toolbar__btn'
      }
      aria-label={`Heading ${level}`}
      aria-pressed={active}
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        if (!editor) return
        editor.chain().focus().toggleHeading({ level }).run()
      }}
    >
      H{level}
    </button>
  )
}

interface NodeButtonProps {
  editor: Editor | null
  predicate: (editor: Editor) => boolean
  run: (editor: Editor) => void
  label: string
  icon: React.ReactNode
  testId: string
  disabled: boolean
}

function NodeButton({
  editor,
  predicate,
  run,
  label,
  icon,
  testId,
  disabled,
}: NodeButtonProps) {
  const active = editor ? predicate(editor) : false
  return (
    <button
      type="button"
      className={
        active
          ? 'rich-text-toolbar__btn rich-text-toolbar__btn--active'
          : 'rich-text-toolbar__btn'
      }
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        if (editor) run(editor)
      }}
    >
      {icon}
    </button>
  )
}

function LinkButton({ editor }: { editor: Editor | null }) {
  const active = editor?.isActive('link') ?? false
  const disabled = editor === null
  return (
    <button
      type="button"
      className={
        active
          ? 'rich-text-toolbar__btn rich-text-toolbar__btn--active'
          : 'rich-text-toolbar__btn'
      }
      aria-label={active ? 'Edit link' : 'Insert link'}
      aria-pressed={active}
      disabled={disabled}
      data-testid="rt-link"
      onClick={() => {
        if (!editor) return
        // Crude prompt-driven UX for the first cut; can swap for an
        // inline popover later. If the URL is empty, unset the link.
        const previous = (editor.getAttributes('link').href as string | undefined) ?? ''
        const next = window.prompt('Link URL', previous)
        if (next === null) return // user cancelled
        if (next === '') {
          editor.chain().focus().extendMarkRange('link').unsetLink().run()
          return
        }
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href: next })
          .run()
      }}
    >
      🔗
    </button>
  )
}
