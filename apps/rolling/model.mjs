export const MAX_BYTES = 992;
export function allowance(text) {
  const bytes = new TextEncoder().encode(text).length;
  const characters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
  return { bytes, characters, remaining: MAX_BYTES - bytes, valid: bytes > 0 && bytes <= MAX_BYTES };
}
export function safeURL(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
// Shared presentation for published messages and composer previews. No HTML is
// interpreted, and importing this module does not require a browser document.
export function createMessageContent(value) {
  const node = document.createElement('div');
  node.className = 'post-body';
  const source = typeof value === 'string' ? value : '';
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let end = 0;
  for (const match of source.matchAll(pattern)) {
    node.append(document.createTextNode(source.slice(end, match.index)));
    const url = safeURL(match[2] || match[3]);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = match[1] || match[3];
      node.append(link);
    } else node.append(document.createTextNode(match[0]));
    end = match.index + match[0].length;
  }
  node.append(document.createTextNode(source.slice(end)));
  return node;
}
export function rankPosts(posts, mode, followedBoards, followedNames, curatedBoards) {
  const filtered = posts.filter(p => !p.parent && (mode === 'following'
    ? followedBoards.has(p.board) || followedNames.has(p.author)
    : curatedBoards.has(p.board)));
  return [...filtered].sort((a, b) => (mode === 'home' ? b.likes - a.likes : 0) || b.time - a.time || a.id.localeCompare(b.id));
}
export function searchBoards(boards, query) {
  const normalized = query.trim().toLocaleLowerCase();
  return boards.filter(b => `${b.name} ${b.description} ${b.id}`.toLocaleLowerCase().includes(normalized));
}
