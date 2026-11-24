import { createContext, useContext } from "react";
import type { DocumentModel } from "../model/types";

/** Gives element components read access to the whole document (title, page settings). */
export const DocContext = createContext<DocumentModel | null>(null);

export function useDocument() {
  const doc = useContext(DocContext);
  if (!doc) throw new Error("useDocument must be used inside <DocContext.Provider>");
  return doc;
}
