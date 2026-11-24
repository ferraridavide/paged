/**
 * One menu system for the whole app: menu bar dropdowns and right-click
 * context menus. Supports icons, shortcuts, checkmarks, submenus, separators
 * and keyboard navigation.
 */
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type MenuItem =
  | {
      type?: "item";
      label: string;
      icon?: LucideIcon;
      shortcut?: string;
      onSelect?: () => void;
      disabled?: boolean;
      checked?: boolean;
      danger?: boolean;
      submenu?: MenuItem[];
    }
  | { type: "separator" }
  | { type: "header"; label: string };

export type ActionItem = Extract<MenuItem, { label: string; type?: "item" }>;

const isAction = (item: MenuItem): item is ActionItem => item.type === undefined || item.type === "item";
const isEnabled = (item: MenuItem) => isAction(item) && !item.disabled;

/** Drops leading, trailing and doubled separators (handy when items are conditional). */
export function tidy(items: (MenuItem | false | null | undefined)[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const item of items) {
    if (!item) continue;
    if (item.type === "separator" && (out.length === 0 || out[out.length - 1].type === "separator")) continue;
    out.push(item);
  }
  while (out.length && out[out.length - 1].type === "separator") out.pop();
  return out;
}

interface OpenMenu {
  items: MenuItem[];
  x: number;
  y: number;
  /** Identifies who opened it (e.g. a menu bar title), so it can highlight itself. */
  source?: string;
}

interface MenuApi {
  open: (menu: OpenMenu) => void;
  close: () => void;
  current: OpenMenu | null;
}

const MenuContext = createContext<MenuApi | null>(null);

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu must be used inside <MenuProvider>");
  return ctx;
}

/** Opens a context menu at the pointer: `onContextMenu={(e) => contextMenu(e, items)}`. */
export function useContextMenu() {
  const { open } = useMenu();
  return useCallback(
    (e: React.MouseEvent, items: MenuItem[]) => {
      e.preventDefault();
      e.stopPropagation();
      if (items.length) open({ items, x: e.clientX, y: e.clientY });
    },
    [open],
  );
}

export function MenuProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<OpenMenu | null>(null);
  const close = useCallback(() => setCurrent(null), []);
  const open = useCallback((menu: OpenMenu) => setCurrent(menu), []);

  // Close on any press outside the menus (the menu bar handles its own titles),
  // and when the window loses focus or resizes.
  useEffect(() => {
    if (!current) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(".menu")) return;
      if (current.source?.startsWith("menubar:") && t?.closest(".menubar")) return;
      close();
    };
    // Escape closes the menu even if focus stayed elsewhere.
    const onKey = (e: KeyboardEvent) => {
      // Inside a menu, its own handler steps back one submenu level at a time.
      if (e.key !== "Escape" || document.activeElement?.closest(".menu")) return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [current, close]);

  return (
    <MenuContext.Provider value={{ open, close, current }}>
      {children}
      {current &&
        createPortal(
          <MenuList key={`${current.x},${current.y},${current.source}`} items={current.items} x={current.x} y={current.y} onClose={close} root />,
          document.body,
        )}
    </MenuContext.Provider>
  );
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/** "mod+shift+z" → "⇧⌘Z" on macOS, "Ctrl+Shift+Z" elsewhere. */
export function formatShortcut(keys: string) {
  // "mod++" means the "+" key itself.
  const plusKey = keys.endsWith("++");
  const parts = (plusKey ? keys.slice(0, -2) : keys).split("+");
  const key = plusKey ? "+" : parts.pop()!;
  const names: Record<string, string> = {
    arrowup: "↑",
    arrowdown: "↓",
    backspace: isMac ? "⌫" : "Backspace",
    delete: "Del",
    escape: "Esc",
    "=": "+",
    enter: "↩",
  };
  const label = names[key.toLowerCase()] ?? key.toUpperCase();
  if (isMac) {
    const order = ["ctrl", "alt", "shift", "mod"];
    const sym: Record<string, string> = { ctrl: "⌃", alt: "⌥", shift: "⇧", mod: "⌘" };
    return order.filter((m) => parts.includes(m)).map((m) => sym[m]).join("") + label;
  }
  const word: Record<string, string> = { mod: "Ctrl", ctrl: "Ctrl", alt: "Alt", shift: "Shift" };
  return [...parts.map((m) => word[m]), label].join("+");
}

interface ListProps {
  items: MenuItem[];
  x: number;
  y: number;
  onClose: () => void;
  /** For submenus: the left edge of the parent item, to flip to if there's no room on the right. */
  flipX?: number;
  root?: boolean;
  onBack?: () => void;
  /** Called when the pointer enters this (sub)menu. */
  onEnter?: () => void;
}

function MenuList({ items, x, y, onClose, flipX, root, onBack, onEnter }: ListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, visible: false });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; x: number; y: number; flipX: number } | null>(null);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    if (left + width > vw - 8) left = flipX !== undefined ? flipX - width : vw - width - 8;
    let top = y;
    if (top + height > vh - 8) top = Math.max(8, vh - height - 8);
    setPos({ left: Math.max(8, left), top, visible: true });
  }, [x, y, flipX, root]);

  // Take keyboard focus once visible (hidden elements can't be focused).
  useEffect(() => {
    if (root && pos.visible) ref.current?.focus({ preventScroll: true });
  }, [root, pos.visible]);

  // Hover intent: moving diagonally towards an open submenu crosses sibling
  // items, so changes to the open submenu wait a moment and are cancelled if
  // the pointer reaches the submenu.
  const intent = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = (fn: () => void) => {
    clearTimeout(intent.current);
    intent.current = setTimeout(fn, sub ? 220 : 0);
  };
  useEffect(() => () => clearTimeout(intent.current), []);

  const openSub = (index: number, target: HTMLElement) => {
    clearTimeout(intent.current);
    const r = target.getBoundingClientRect();
    setSub({ index, x: r.right - 4, y: r.top - 5, flipX: r.left + 4 });
  };

  const choose = (item: MenuItem, index: number, target: HTMLElement) => {
    if (!isAction(item) || item.disabled) return;
    if (item.submenu) return openSub(index, target);
    onClose();
    item.onSelect?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const step = (dir: number) => {
      for (let i = 1; i <= items.length; i++) {
        const next = (active + dir * i + items.length) % items.length;
        if (isEnabled(items[next])) return setActive(next);
      }
    };
    const row = () => ref.current?.querySelectorAll<HTMLElement>(":scope > .menu-item")[active];
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        break;
      case "ArrowRight": {
        const item = items[active];
        const el = row();
        if (item && isAction(item) && item.submenu && el) openSub(active, el);
        break;
      }
      case "ArrowLeft":
        if (!root) onBack?.();
        break;
      case "Enter":
      case " ": {
        e.preventDefault();
        const el = row();
        if (active >= 0 && el) choose(items[active], active, el);
        break;
      }
      case "Escape":
        e.preventDefault();
        if (root) onClose();
        else onBack?.();
        break;
    }
  };

  const subItem = sub ? items[sub.index] : undefined;

  return (
    <>
      <div
        ref={ref}
        className="menu"
        role="menu"
        tabIndex={-1}
        style={{ left: pos.left, top: pos.top, visibility: pos.visible ? "visible" : "hidden" }}
        onKeyDown={onKeyDown}
        onMouseEnter={onEnter}
        onMouseDown={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => {
          if (item.type === "separator") return <div key={i} className="menu-separator" role="separator" />;
          if (item.type === "header") return <div key={i} className="menu-header">{item.label}</div>;
          const Icon = item.icon;
          return (
            <div
              key={i}
              role="menuitem"
              aria-disabled={item.disabled}
              className={`menu-item${i === active ? " is-active" : ""}${item.disabled ? " is-disabled" : ""}${item.danger ? " is-danger" : ""}`}
              onMouseEnter={(e) => {
                const target = e.currentTarget;
                if (sub && sub.index === i) return clearTimeout(intent.current);
                later(() => {
                  setActive(i);
                  if (item.submenu && !item.disabled) openSub(i, target);
                  else setSub(null);
                });
                if (!sub) setActive(i);
              }}
              onClick={(e) => choose(item, i, e.currentTarget)}
            >
              <span className="menu-icon">{item.checked ? <Check size={14} /> : Icon ? <Icon size={14} /> : null}</span>
              <span className="menu-label">{item.label}</span>
              {item.shortcut && <span className="menu-shortcut">{formatShortcut(item.shortcut)}</span>}
              {item.submenu && <ChevronRight size={14} className="menu-chevron" />}
            </div>
          );
        })}
      </div>
      {sub && subItem && isAction(subItem) && subItem.submenu && (
        <MenuList
          key={sub.index}
          onEnter={() => {
            clearTimeout(intent.current);
            setActive(sub.index);
          }}
          items={subItem.submenu}
          x={sub.x}
          y={sub.y}
          flipX={sub.flipX}
          onClose={onClose}
          onBack={() => {
            setSub(null);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** Application menu bar: click a title to open its menu; hover switches while one is open. */
export function MenuBar({ menus }: { menus: { title: string; items: () => MenuItem[] }[] }) {
  const { open, close, current } = useMenu();
  const openMenu = (title: string, items: () => MenuItem[], el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    open({ items: items(), x: r.left, y: r.bottom + 2, source: `menubar:${title}` });
  };
  const activeTitle = current?.source?.startsWith("menubar:") ? current.source.slice(8) : null;

  return (
    <nav className="menubar" role="menubar">
      {menus.map((m) => (
        <button
          key={m.title}
          role="menuitem"
          className={`menubar-item${activeTitle === m.title ? " is-open" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            if (activeTitle === m.title) close();
            else openMenu(m.title, m.items, e.currentTarget);
          }}
          onMouseEnter={(e) => {
            if (activeTitle && activeTitle !== m.title) openMenu(m.title, m.items, e.currentTarget);
          }}
        >
          {m.title}
        </button>
      ))}
    </nav>
  );
}
