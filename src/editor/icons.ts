import {
  Heading2,
  Image,
  List,
  Minus,
  MoveVertical,
  Hash,
  Pilcrow,
  Puzzle,
  SeparatorHorizontal,
  Table,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  heading: Heading2,
  text: Pilcrow,
  list: List,
  table: Table,
  image: Image,
  divider: Minus,
  spacer: MoveVertical,
  "page-break": SeparatorHorizontal,
  "running-text": Hash,
};

/** Icon for an element type in menus and panels; custom components share one. */
export const elementIcon = (type: string): LucideIcon => ICONS[type] ?? Puzzle;
