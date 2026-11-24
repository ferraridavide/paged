import { createElement, useLayoutEffect, useRef, type HTMLAttributes, type KeyboardEvent } from "react";
import { getCaretOffset, readText, recordCaret, setCaretOffset } from "../layout/caret";

type Props = Omit<HTMLAttributes<HTMLElement>, "onChange"> & {
  as?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  /** Called on Enter when not multiline. */
  onEnter?: () => void;
  /** Called on Backspace when the text is already empty. */
  onDeleteEmpty?: () => void;
  /** Identifies the field (node + prop path) so the caret survives re-layouts. */
  caretKey?: string;
  /** Offset of this fragment inside the whole field, for split paragraphs. */
  caretBase?: number;
};

/**
 * A plain-text contentEditable that stays uncontrolled while you type: the DOM
 * is only rewritten when `value` changes from outside (undo, sidebar edits, a
 * re-layout moving text between pages), and then the caret is kept in place.
 */
export function EditableText({
  as = "span",
  value,
  onChange,
  multiline,
  placeholder,
  onEnter,
  onDeleteEmpty,
  caretKey,
  caretBase,
  onKeyDown,
  ...rest
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const composing = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || composing.current || readText(el) === value) return;
    const caret = document.activeElement === el ? getCaretOffset(el) : null;
    el.textContent = value;
    if (caret !== null) setCaretOffset(el, Math.min(caret, value.length));
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || composing.current) return;
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      onEnter?.();
    } else if (e.key === "Backspace" && readText(e.currentTarget).length === 0 && onDeleteEmpty) {
      e.preventDefault();
      onDeleteEmpty();
    }
  };

  const emit = (el: HTMLElement) => {
    recordCaret(el);
    onChange(readText(el));
  };

  return createElement(as, {
    ...rest,
    ref,
    contentEditable: "plaintext-only",
    suppressContentEditableWarning: true,
    spellCheck: true,
    "data-placeholder": placeholder,
    "data-editable": "",
    "data-caret-key": caretKey,
    "data-caret-base": caretBase ?? 0,
    onInput: (e: React.FormEvent<HTMLElement>) => {
      if (!composing.current) emit(e.currentTarget);
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLElement>) => {
      composing.current = false;
      emit(e.currentTarget);
    },
    onKeyDown: handleKeyDown,
  });
}
