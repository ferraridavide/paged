import { X } from "lucide-react";
import { useRef, useState } from "react";
import { CLASS_NAME } from "../../model/css";

interface Suggestion {
  name: string;
  uses: number;
  inCss: boolean;
}

interface Props {
  classes: string[];
  onChange: (classes: string[]) => void;
  /** Class names known to the document, for autocomplete. */
  known: Suggestion[];
}

/**
 * Class names as pills. Type and press space, Enter, Tab or comma to add
 * (pasting "a b c" adds three), Backspace on an empty field removes the last
 * one, × removes any. Suggests class names already used in the document.
 */
export function ClassInput({ classes, onChange, known }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Enter takes the highlighted suggestion only after arrowing to it; Tab always does.
  const [navigated, setNavigated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = text.trim().toLowerCase();
  const suggestions = known
    .filter((k) => !classes.includes(k.name) && (!query || k.name.toLowerCase().includes(query)))
    // Names that start with what you typed come first.
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(query)) - Number(a.name.toLowerCase().startsWith(query)))
    .slice(0, 8);

  /** Adds every whitespace/comma-separated token; invalid ones stay in the field with a message. */
  const add = (raw: string, rest = "") => {
    const tokens = raw.split(/[\s,]+/).filter(Boolean);
    if (!tokens.length) return setText(rest);
    const bad = tokens.filter((t) => !CLASS_NAME.test(t));
    const good = tokens.filter((t) => CLASS_NAME.test(t) && !classes.includes(t));
    const unique = [...new Set(good)];
    if (unique.length) onChange([...classes, ...unique]);
    setText([...bad, rest].filter(Boolean).join(" "));
    setNavigated(false);
    setError(bad.length ? `“${bad[0]}” isn't a valid class name (letters, digits, - and _, not starting with a digit).` : null);
    setActive(0);
  };

  const remove = (name: string) => onChange(classes.filter((c) => c !== name));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const showing = open && suggestions.length > 0;
    if (e.key === "ArrowDown" && showing) {
      e.preventDefault();
      setNavigated(true);
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp" && showing) {
      e.preventDefault();
      setNavigated(true);
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (showing && ((e.key === "Tab" && query) || (e.key === "Enter" && navigated))) {
      // Accept the highlighted suggestion.
      e.preventDefault();
      add(suggestions[active].name);
    } else if (e.key === "Enter" || e.key === " " || e.key === ",") {
      if (!text.trim()) return;
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && classes.length) {
      e.preventDefault();
      remove(classes[classes.length - 1]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="class-input-wrap">
      <div className={`class-input${error ? " is-invalid" : ""}`} onMouseDown={(e) => {
        // Clicking the box (not a pill's ×) focuses the text field.
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}>
        {classes.map((c) => (
          <span key={c} className="class-pill">
            <span className="class-pill-name">{c}</span>
            <button type="button" aria-label={`Remove ${c}`} title={`Remove ${c}`} onClick={() => remove(c)}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          placeholder={classes.length ? "" : "Add classes…"}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Add class"
          onChange={(e) => {
            const value = e.target.value;
            // A separator typed or inserted any way (keyboard, IME, autofill):
            // everything before the last one becomes pills.
            const cut = Math.max(value.lastIndexOf(" "), value.lastIndexOf(","), value.lastIndexOf("\t"), value.lastIndexOf("\n"));
            if (cut >= 0) {
              add(value.slice(0, cut), value.slice(cut + 1));
              setOpen(true);
              return;
            }
            setText(value);
            setNavigated(false);
            setError(null);
            setOpen(true);
            setActive(0);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text/plain");
            if (/[\s,]/.test(pasted)) {
              e.preventDefault();
              add(text + pasted);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (text.trim()) add(text);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="class-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.name}
              role="option"
              aria-selected={i === active}
              className={i === active ? "is-active" : ""}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click: the field must keep focus.
              onMouseDown={(e) => {
                e.preventDefault();
                add(s.name);
              }}
            >
              <span className="class-suggestion-name">.{s.name}</span>
              <span className="class-suggestion-meta">
                {s.uses > 0 ? `${s.uses} element${s.uses === 1 ? "" : "s"}` : ""}
                {s.uses > 0 && s.inCss ? " · " : ""}
                {s.inCss ? "styled" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="class-error">{error}</p>}
    </div>
  );
}
