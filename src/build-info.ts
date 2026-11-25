/** Full hash of the commit this build came from (see vite.config.ts); empty when unknown. */
declare const __COMMIT_HASH__: string;

export const REPO_URL = "https://github.com/ferraridavide/paged";
export const COMMIT_HASH = __COMMIT_HASH__;
export const COMMIT_URL = COMMIT_HASH ? `${REPO_URL}/commit/${COMMIT_HASH}` : "";
