/* 강의록용 간단한 마크다운 표시기 (외부 라이브러리 없이)
   지원: # ## ### 제목, > 인용, - 목록, 1. 목록, | 표 |, ---, **굵게**, *기울임* */
import React from 'react';

function inline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={key + '-b' + i}>{t.slice(2, -2)}</strong>);
    else out.push(<em key={key + '-i' + i}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function MiniMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === '') { i++; continue; }
    const key = 'b' + k++;
    if (/^---+$/.test(t)) { blocks.push(<hr key={key} className="md-hr" />); i++; continue; }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const lv = h[1].length;
      const content = inline(h[2], key);
      blocks.push(lv === 1 ? <h2 key={key} className="md-h1">{content}</h2> : lv === 2 ? <h3 key={key} className="md-h2">{content}</h3> : <h4 key={key} className="md-h3">{content}</h4>);
      i++; continue;
    }
    if (t.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      blocks.push(<blockquote key={key} className="md-quote">{buf.map((b, j) => <p key={j}>{inline(b, key + j)}</p>)}</blockquote>);
      continue;
    }
    if (t.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const r = lines[i].trim();
        if (!/^\|?[\s:-]+(\|[\s:-]+)+\|?$/.test(r)) rows.push(r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key} className="md-table-wrap">
          <table className="md-table">
            {head && <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, key + 'h' + j)}</th>)}</tr></thead>}
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, key + ri + j)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: { text: string; sub: boolean }[] = [];
      while (i < lines.length && /^(\s*)([-*]|\d+\.)\s+/.test(lines[i])) {
        const sub = /^\s{2,}/.test(lines[i]);
        items.push({ text: lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''), sub });
        i++;
      }
      const lis = items.map((it, j) => <li key={j} className={it.sub ? 'md-sub' : undefined}>{inline(it.text, key + j)}</li>);
      blocks.push(ordered ? <ol key={key} className="md-list">{lis}</ol> : <ul key={key} className="md-list">{lis}</ul>);
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,3}\s|>|\||---+$)/.test(lines[i].trim()) && !/^(\s*)([-*]|\d+\.)\s+/.test(lines[i])) { buf.push(lines[i].trim()); i++; }
    blocks.push(<p key={key} className="md-p">{inline(buf.join(' '), key)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
