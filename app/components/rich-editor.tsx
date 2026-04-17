"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import { useState, useEffect } from "react";

const FONTS = [
  { label: "기본서체", value: "" },
  { label: "맑은고딕", value: "Malgun Gothic, sans-serif" },
  { label: "나눔고딕", value: "Nanum Gothic, sans-serif" },
  { label: "돋움", value: "Dotum, sans-serif" },
  { label: "굴림", value: "Gulim, sans-serif" },
  { label: "바탕", value: "Batang, serif" },
  { label: "궁서", value: "Gungsuh, serif" },
];

const SIZES = [10, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32];

const TEXT_COLORS = [
  "#2A251D", "#000000", "#555555", "#888888",
  "#C0392B", "#E74C3C", "#FF6B6B", "#D35400",
  "#E67E22", "#F39C12", "#F1C40F", "#D4AC0D",
  "#27AE60", "#2ECC71", "#1ABC9C", "#16A085",
  "#2980B9", "#3498DB", "#5DADE2", "#2471A3",
  "#8E44AD", "#9B59B6", "#AF7AC5", "#7D3C98",
  "#E91E63", "#FF4081", "#EC407A", "#C2185B",
];
const BG_COLORS = [
  "transparent",
  "#FDECEA", "#F8D7DA", "#F5B7B1", "#FADBD8", "#FDEDEC",
  "#E8F4FD", "#D6EAF8", "#AED6F1", "#D4E6F1", "#EBF5FB",
  "#E8F8E8", "#D5F5E3", "#ABEBC6", "#D4EFDF", "#EAFAF1",
  "#FFF8E1", "#FEF9E7", "#F9E79F", "#FDEBD0", "#FDF2E9",
  "#F3E5F5", "#EBDEF0", "#D2B4DE", "#E8DAEF", "#F5EEF8",
  "#FFF3E0", "#FAE5D3", "#F5CBA7", "#EDBB99", "#FBEEE6",
  "#E0F7FA", "#D1F2EB", "#A3E4D7", "#D0ECE7", "#E8F6F3",
  "#F5F5F5", "#EAECEE", "#D5D8DC", "#BFC9CA", "#E5E7E9",
];

interface Props {
  content?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
}

const FontSizeExtension = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => el.style.fontSize?.replace("px", "") || null,
        renderHTML: (attrs) => {
          if (!attrs.fontSize) return {};
          return { style: `font-size: ${attrs.fontSize}px` };
        },
      },
    };
  },
});

export default function RichEditor({ content = "", onChange, placeholder }: Props) {
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showBgMenu, setShowBgMenu] = useState(false);
  const [fontSize, setFontSize] = useState(15);
  const [fontLabel, setFontLabel] = useState("기본서체");
  const [, forceRender] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      FontSizeExtension,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
    onSelectionUpdate: () => {
      forceRender((n) => n + 1);
    },
    onTransaction: () => {
      forceRender((n) => n + 1);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[300px] px-4 py-5 text-[15px] leading-[1.85] text-[#2A251D] dark:text-zinc-100",
      },
    },
  });

  useEffect(() => {
    if (editor && content && !editor.getHTML().includes(content.slice(0, 20))) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  const setEditorFontSize = (size: number) => {
    setFontSize(size);
    setShowSizeMenu(false);
    editor.chain().focus().setMark("textStyle", { fontSize: String(size) }).run();
  };

  const setEditorFont = (font: typeof FONTS[0]) => {
    setFontLabel(font.label);
    setShowFontMenu(false);
    if (font.value) {
      editor.chain().focus().setFontFamily(font.value).run();
    } else {
      editor.chain().focus().unsetFontFamily().run();
    }
  };

  return (
    <div className="rounded-xl border border-[#E8E0D0] dark:border-zinc-700 bg-[#FBF7EB] dark:bg-zinc-800 relative">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-1 px-2 py-2 border-b border-[#E8E0D0] dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80">
        {/* 서체 */}
        <div className="relative">
          <button type="button" onClick={() => { setShowFontMenu(!showFontMenu); setShowSizeMenu(false); setShowColorMenu(false); setShowBgMenu(false); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-700 min-w-[80px]">
            <span className="truncate">{fontLabel}</span>
            <svg className="w-3 h-3 shrink-0 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
          {showFontMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden min-w-[140px]">
              {FONTS.map((f) => (
                <button key={f.label} type="button" onClick={() => setEditorFont(f)}
                  className={`w-full text-left px-4 py-2.5 text-[13px] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors ${fontLabel === f.label ? "text-[#6B7B3A] font-semibold bg-[#F5F0E5]/50" : "text-[#3A342A] dark:text-zinc-200"}`}
                  style={f.value ? { fontFamily: f.value } : {}}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 크기 */}
        <div className="relative">
          <button type="button" onClick={() => { setShowSizeMenu(!showSizeMenu); setShowFontMenu(false); setShowColorMenu(false); setShowBgMenu(false); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] text-[#3A342A] dark:text-zinc-200 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 border border-[#E8E0D0] dark:border-zinc-700 min-w-[50px] justify-center">
            <span>{fontSize}</span>
            <svg className="w-3 h-3 shrink-0 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
          {showSizeMenu && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
              {SIZES.map((s) => (
                <button key={s} type="button" onClick={() => setEditorFontSize(s)}
                  className={`w-full text-center px-4 py-2 text-[13px] hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors ${fontSize === s ? "text-[#6B7B3A] font-semibold bg-[#F5F0E5]/50" : "text-[#3A342A] dark:text-zinc-200"}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-[#E8E0D0] dark:bg-zinc-700 mx-0.5" />

        {/* B I U S */}
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} title="굵게"
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-[15px] font-bold transition-colors ${editor.isActive("bold") ? "bg-[#6B7B3A] text-white" : "text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"}`}>
          B
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} title="기울기"
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-[15px] italic transition-colors ${editor.isActive("italic") ? "bg-[#6B7B3A] text-white" : "text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"}`}>
          I
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} title="밑줄"
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-[15px] underline transition-colors ${editor.isActive("underline") ? "bg-[#6B7B3A] text-white" : "text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"}`}>
          U
        </button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} title="취소선"
          className={`w-8 h-8 flex items-center justify-center rounded-lg text-[15px] line-through transition-colors ${editor.isActive("strike") ? "bg-[#6B7B3A] text-white" : "text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"}`}>
          S
        </button>

        <div className="w-px h-6 bg-[#E8E0D0] dark:bg-zinc-700 mx-0.5" />

        {/* 글씨 색 T. */}
        <div className="relative">
          <button type="button" onClick={() => { setShowColorMenu(!showColorMenu); setShowBgMenu(false); setShowFontMenu(false); setShowSizeMenu(false); }} title="글씨 색"
            className="w-8 h-8 flex flex-col items-center justify-center rounded-lg text-[14px] font-bold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors">
            <span>A</span>
            <span className="w-4 h-1 rounded-full bg-[#C0392B] -mt-0.5" />
          </button>
          {showColorMenu && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl shadow-lg p-3 grid grid-cols-14 gap-1.5 min-w-[400px]">
              {TEXT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorMenu(false); }}
                  className="w-6 h-6 rounded-full border border-[#E8E0D0] dark:border-zinc-600 hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
        </div>

        {/* 배경 색 T□ */}
        <div className="relative">
          <button type="button" onClick={() => { setShowBgMenu(!showBgMenu); setShowColorMenu(false); setShowFontMenu(false); setShowSizeMenu(false); }} title="배경 색"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[13px] font-bold text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors border border-transparent">
            <span className="px-1 py-0.5 bg-[#FFF8E1] border border-[#E8E0D0] rounded text-[12px]">A</span>
          </button>
          {showBgMenu && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 bg-white dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-xl shadow-lg p-3 grid grid-cols-14 gap-1.5 min-w-[400px]">
              {BG_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => { if (c === "transparent") editor.chain().focus().unsetHighlight().run(); else editor.chain().focus().toggleHighlight({ color: c }).run(); setShowBgMenu(false); }}
                  className="w-6 h-6 rounded-full border border-[#E8E0D0] dark:border-zinc-600 hover:scale-110 transition-transform" style={{ backgroundColor: c === "transparent" ? "#fff" : c }}>
                  {c === "transparent" && <span className="text-[10px] text-[#A89B80]">✕</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-[#E8E0D0] dark:bg-zinc-700 mx-0.5" />

        {/* 정렬 */}
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} title="왼쪽 정렬"
          className={`w-8 h-8 flex flex-col items-center justify-center gap-[2px] rounded-lg transition-colors ${editor.isActive({ textAlign: "left" }) ? "bg-[#6B7B3A] text-white" : "text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"}`}>
          <span className="w-4 h-[2px] bg-current rounded" /><span className="w-3 h-[2px] bg-current rounded" /><span className="w-4 h-[2px] bg-current rounded" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} title="가운데 정렬"
          className={`w-8 h-8 flex flex-col items-center justify-center gap-[2px] rounded-lg transition-colors ${editor.isActive({ textAlign: "center" }) ? "bg-[#6B7B3A] text-white" : "text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"}`}>
          <span className="w-4 h-[2px] bg-current rounded" /><span className="w-2.5 h-[2px] bg-current rounded" /><span className="w-4 h-[2px] bg-current rounded" />
        </button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} title="오른쪽 정렬"
          className={`w-8 h-8 flex flex-col items-center justify-center gap-[2px] rounded-lg transition-colors ${editor.isActive({ textAlign: "right" }) ? "bg-[#6B7B3A] text-white" : "text-[#3A342A] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"}`}>
          <span className="w-4 h-[2px] bg-current rounded self-end" /><span className="w-3 h-[2px] bg-current rounded self-end" /><span className="w-4 h-[2px] bg-current rounded self-end" />
        </button>
      </div>

      {/* 에디터 */}
      <EditorContent editor={editor} />

      <style jsx global>{`
        .tiptap p.is-editor-empty:first-child::before {
          content: "${placeholder || "내용을 입력하세요"}";
          color: #A89B80;
          float: left;
          height: 0;
          pointer-events: none;
        }
        .tiptap { min-height: 300px; }
        .tiptap h2 { font-size: 1.25rem; font-weight: 700; margin: 0.5em 0; }
        .tiptap ul { list-style: disc; padding-left: 1.5em; }
        .tiptap ol { list-style: decimal; padding-left: 1.5em; }
        .tiptap blockquote { border-left: 3px solid #6B7B3A; padding-left: 1em; color: #6B5D47; margin: 0.5em 0; }
        .tiptap p { margin: 0; }
        .tiptap mark { border-radius: 2px; padding: 0 2px; }
      `}</style>
    </div>
  );
}
