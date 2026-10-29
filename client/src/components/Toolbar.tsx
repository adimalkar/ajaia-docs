import { useEditorState, type Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { Icon } from "./ui";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

type BlockStyle = "paragraph" | "h1" | "h2" | "h3";

export function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "paragraph") as BlockStyle,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bulletList: e.isActive("bulletList"),
      orderedList: e.isActive("orderedList"),
      blockquote: e.isActive("blockquote"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();

  const setBlock = (value: BlockStyle) => {
    if (value === "paragraph") chain().setParagraph().run();
    else chain().setHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <ToolButton label="Undo" shortcut={`${mod}Z`} onClick={() => chain().undo().run()} disabled={!state.canUndo}>
        <Icon name="undo" />
      </ToolButton>
      <ToolButton label="Redo" shortcut={`${mod}Shift+Z`} onClick={() => chain().redo().run()} disabled={!state.canRedo}>
        <Icon name="redo" />
      </ToolButton>
      <Divider />
      <select className="block-select" aria-label="Text style" value={state.block} onChange={(e) => setBlock(e.target.value as BlockStyle)}>
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Divider />
      <ToolButton label="Bold" shortcut={`${mod}B`} active={state.bold} onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </ToolButton>
      <ToolButton label="Italic" shortcut={`${mod}I`} active={state.italic} onClick={() => chain().toggleItalic().run()}>
        <i className="serif">I</i>
      </ToolButton>
      <ToolButton label="Underline" shortcut={`${mod}U`} active={state.underline} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </ToolButton>
      <ToolButton label="Strikethrough" shortcut={`${mod}Shift+S`} active={state.strike} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </ToolButton>
      <Divider />
      <ToolButton label="Bulleted list" shortcut={`${mod}Shift+8`} active={state.bulletList} onClick={() => chain().toggleBulletList().run()}>
        <Icon name="bulletList" />
      </ToolButton>
      <ToolButton label="Numbered list" shortcut={`${mod}Shift+7`} active={state.orderedList} onClick={() => chain().toggleOrderedList().run()}>
        <Icon name="orderedList" />
      </ToolButton>
      <ToolButton label="Quote" shortcut={`${mod}Shift+B`} active={state.blockquote} onClick={() => chain().toggleBlockquote().run()}>
        <Icon name="quote" />
      </ToolButton>
      <Divider />
      <ToolButton label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <Icon name="clear" />
      </ToolButton>
    </div>
  );
}

function ToolButton(props: { label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  const title = props.shortcut ? `${props.label} (${props.shortcut})` : props.label;
  return (
    <button
      type="button"
      className={`tool${props.active ? " is-active" : ""}`}
      aria-label={props.label}
      aria-pressed={props.active}
      title={title}
      disabled={props.disabled}
      // keep the editor selection when clicking toolbar buttons
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

const Divider = () => <span className="tool-divider" aria-hidden="true" />;
