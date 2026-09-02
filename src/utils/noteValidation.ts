export const MAX_NOTE_TITLE_CHARS = 60;
export const MAX_NOTE_TITLE_WORDS = 10;
export const MAX_NOTE_BODY_WORDS = 100;
export const MAX_NOTE_BODY_CHARS = 500;

export function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isNoteTitleValid(title: string): boolean {
  return title.length <= MAX_NOTE_TITLE_CHARS && getWordCount(title) <= MAX_NOTE_TITLE_WORDS;
}

export function isNoteBodyValid(body: string): boolean {
  return body.length <= MAX_NOTE_BODY_CHARS && getWordCount(body) <= MAX_NOTE_BODY_WORDS;
}
