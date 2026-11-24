export function newId() {
  return "el_" + Math.random().toString(36).slice(2, 10);
}
