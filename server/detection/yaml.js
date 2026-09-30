// Minimal YAML reader sufficient for Sigma rules: block maps/sequences, quoted and plain scalars (multi-line), block scalars (| >), flow lists/maps,
// comments, multi-document streams. Not supported: anchors/aliases, tags, complex keys. Differentially tested against PyYAML on the full SigmaHQ rule set.
export class YamlError extends Error { constructor(msg, line) { super(line ? `YAML line ${line}: ${msg}` : `YAML: ${msg}`); this.line = line; } }

function stripComment(s) {
  let q = null, last = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) { if (q === "'" && s[i + 1] === "'") { i++; continue; } q = null; last = c; } else if (q === '"' && c === '\\') i++; continue; }
    if ((c === "'" || c === '"') && (last === '' || ':-,[{'.includes(last))) { q = c; last = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
    if (c !== ' ' && c !== '\t') last = c;
  }
  return s;
}
const unsingle = (s) => s.slice(1, -1).replace(/''/g, "'");
function undouble(s, line) {
  const inner = s.slice(1, -1); let out = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]; if (c !== '\\') { out += c; continue; }
    const n = inner[++i];
    const simple = { n: '\n', t: '\t', r: '\r', '0': '\0', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0' };
    if (n in simple) out += simple[n];
    else if (n === 'x') { out += String.fromCharCode(parseInt(inner.slice(i + 1, i + 3), 16)); i += 2; }
    else if (n === 'u') { out += String.fromCharCode(parseInt(inner.slice(i + 1, i + 5), 16)); i += 4; }
    else if (n === 'U') { out += String.fromCodePoint(parseInt(inner.slice(i + 1, i + 9), 16)); i += 8; }
    else if (n === '\n' || n === undefined) { /* line continuation */ }
    else throw new YamlError(`unknown escape \\${n}`, line);
  }
  return out;
}
function splitKey(t) {
  if (t[0] === "'" || t[0] === '"') {
    const q = t[0]; let j = 1;
    while (j < t.length) { if (t[j] === q) { if (q === "'" && t[j + 1] === "'") { j += 2; continue; } break; } if (q === '"' && t[j] === '\\') j++; j++; }
    if (t[j] !== q) return null;
    let i = j + 1; while (t[i] === ' ') i++;
    if (t[i] !== ':' || (i + 1 < t.length && !/\s/.test(t[i + 1]))) return null;
    return { key: q === "'" ? unsingle(t.slice(0, j + 1)) : undouble(t.slice(0, j + 1)), rest: t.slice(i + 1) };
  }
  if (/^[\[\{&*!|>%@`#]/.test(t)) return null;
  for (let j = 0; j < t.length; j++) {
    if (t[j] === '#' && j > 0 && /\s/.test(t[j - 1])) return null;
    if (t[j] === ':' && (j + 1 === t.length || /\s/.test(t[j + 1]))) { const key = t.slice(0, j).trim(); return key ? { key, rest: t.slice(j + 1) } : null; }
  }
  return null;
}
function plain(s) {
  if (s === '' || s === '~' || /^(null|Null|NULL)$/.test(s)) return null;
  if (/^(true|True|TRUE)$/.test(s)) return true; if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?(0|[1-9]\d*)$/.test(s)) return Number(s);
  if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s) && !/^\./.test(s.replace(/^[-+]/, ''))) return Number(s);
  return s;
}
function splitFlow(s) {
  const out = []; let depth = 0, q = null, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === q) { if (q === "'" && s[i + 1] === "'") { cur += s[++i]; } else q = null; } else if (q === '"' && c === '\\') cur += s[++i]; continue; }
    if (c === "'" || c === '"') { q = c; cur += c; continue; }
    if (c === '[' || c === '{') depth++; if (c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '' || out.length) out.push(cur);
  return out;
}
function flowValue(s, line) {
  s = s.trim();
  if (s[0] === '[') { if (s.at(-1) !== ']') throw new YamlError('unterminated flow sequence', line); return splitFlow(s.slice(1, -1)).map((x) => flowValue(x, line)).filter((_, i, a) => !(i === a.length - 1 && _ === null && s.slice(1, -1).trim().endsWith(','))); }
  if (s[0] === '{') { if (s.at(-1) !== '}') throw new YamlError('unterminated flow mapping', line); const o = {}; for (const part of splitFlow(s.slice(1, -1))) { const kv = splitKey(part.trim() + (/:\s*$/.test(part) ? ' ' : '')) || splitKey(part.trim()); if (!kv) throw new YamlError(`bad flow mapping entry "${part.trim()}"`, line); o[kv.key] = flowValue(kv.rest, line); } return o; }
  if (s[0] === "'") return unsingle(s); if (s[0] === '"') return undouble(s, line);
  return plain(s);
}

class Parser {
  constructor(text) { this.lines = text.replace(/\r\n?/g, '\n').split('\n'); this.pos = 0; }
  sig() { while (this.pos < this.lines.length && /^\s*(#.*)?$/.test(this.lines[this.pos])) this.pos++; return this.pos < this.lines.length; }
  ind(l) { const m = /^ */.exec(l)[0].length; if (l[m] === '\t') throw new YamlError('tab indentation is not allowed', this.pos + 1); return m; }
  parseNode(minIndent) {
    if (!this.sig()) return null;
    const line = this.lines[this.pos], ind = this.ind(line); if (ind < minIndent) return null;
    const body = line.slice(ind);
    if (/^-(\s|$)/.test(body)) return this.parseSeq(ind);
    if (splitKey(stripComment(body).trimEnd())) return this.parseMap(ind);
    return this.scalarValue(stripComment(body).trim(), body, ind - 1, true);
  }
  /** Reads a scalar whose first line text is `first` (comment-stripped). Handles block scalars, flow collections and multi-line quoted/plain scalars. */
  scalarValue(first, rawFirst, parentIndent, isDoc = false) {
    const ln = this.pos + 1;
    if (/^[|>][-+0-9]*$/.test(first)) { this.pos++; return this.block(first, parentIndent); }
    if (first[0] === '[' || first[0] === '{') {
      let acc = first; const open = first[0], close = open === '[' ? ']' : '}'; const bal = (s) => { let d = 0, q = null; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === q) q = null; else if (q === '"' && c === '\\') i++; continue; } if (c === "'" || c === '"') q = c; else if (c === open) d++; else if (c === close) d--; } return d; };
      this.pos++; while (bal(acc) > 0 && this.pos < this.lines.length) acc += ' ' + stripComment(this.lines[this.pos++]).trim();
      return flowValue(acc, ln);
    }
    if (first[0] === "'" || first[0] === '"') {
      let acc = first; const q = first[0]; const closed = (s) => { let i = 1; while (i < s.length) { if (s[i] === q) { if (q === "'" && s[i + 1] === "'") { i += 2; continue; } return true; } if (q === '"' && s[i] === '\\') i++; i++; } return false; };
      this.pos++;
      while (!closed(acc) && this.pos < this.lines.length) { const nl = this.lines[this.pos++].trim(); acc += nl === '' ? '\n' : (acc.endsWith('\n') ? '' : ' ') + nl; }
      if (!closed(acc)) throw new YamlError('unterminated quoted scalar', ln);
      return q === "'" ? unsingle(acc.trimEnd().replace(/\s*#.*$/, (m) => (acc.trimEnd().endsWith(q) ? m : ''))) : undouble(stripQuoteTail(acc), ln);
    }
    this.pos++; let text = first;
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos];
      if (/^\s*$/.test(l)) { let k = this.pos; while (k < this.lines.length && /^\s*$/.test(this.lines[k])) k++; if (k < this.lines.length && this.ind(this.lines[k]) > parentIndent && !/^\s*#/.test(this.lines[k])) { text += '\n'.repeat(k - this.pos); this.pos = k; continue; } break; }
      if (/^\s*#/.test(l)) break;
      if (this.ind(l) <= parentIndent) break;
      const c = stripComment(l).trim(); text += (text.endsWith('\n') ? '' : ' ') + c; this.pos++;
    }
    return plain(text);
  }
  block(indicator, parentIndent) {
    const fold = indicator[0] === '>', chomp = indicator.includes('-') ? 'strip' : indicator.includes('+') ? 'keep' : 'clip';
    const explicit = Number((indicator.match(/\d/) || [])[0]) || 0; const raw = [];
    let contentIndent = explicit ? parentIndent + 1 + explicit - 1 + 1 : null;
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos];
      if (/^\s*$/.test(l)) { raw.push(''); this.pos++; continue; }
      const ind = this.ind(l); if (ind <= parentIndent) break;
      if (contentIndent === null) contentIndent = ind; if (ind < contentIndent) break;
      raw.push(l.slice(contentIndent)); this.pos++;
    }
    let trailing = 0; while (raw.length && raw.at(-1) === '') { raw.pop(); trailing++; }
    let text;
    if (!fold) text = raw.join('\n');
    else { text = ''; for (let i = 0; i < raw.length; i++) { const cur = raw[i], prev = raw[i - 1]; if (i === 0) text = cur; else if (cur === '') text += '\n'; else if (prev === '' || /^\s/.test(cur) || /^\s/.test(prev ?? '')) text += (prev === '' ? '' : '\n') + cur; else text += ' ' + cur; } }
    if (chomp === 'strip') return text; if (chomp === 'clip') return raw.length ? text + '\n' : ''; return text + '\n'.repeat(trailing + (raw.length ? 1 : 0));
  }
  parseMap(ind) {
    const obj = {};
    for (;;) {
      if (!this.sig()) break; const line = this.lines[this.pos], ci = this.ind(line);
      if (ci !== ind) { if (ci > ind) throw new YamlError('unexpected indentation', this.pos + 1); break; }
      const body = line.slice(ci); if (/^-(\s|$)/.test(body)) break;
      const kv = splitKey(stripComment(body).trimEnd()); if (!kv) throw new YamlError(`expected "key: value", got "${body.slice(0, 40)}"`, this.pos + 1);
      if (Object.prototype.hasOwnProperty.call(obj, kv.key)) throw new YamlError(`duplicate key "${kv.key}"`, this.pos + 1);
      const rest = stripComment(kv.rest).trim();
      if (rest === '') {
        this.pos++; let v = null;
        if (this.sig()) { const nl = this.lines[this.pos], ni = this.ind(nl); if (ni > ind) v = this.parseNode(ni); else if (ni === ind && /^-(\s|$)/.test(nl.slice(ni))) v = this.parseSeq(ind); }
        obj[kv.key] = v;
      } else {
        const restRaw = body.slice(body.indexOf(kv.rest.length ? kv.rest : ':') ); // unused fallback; value handled from comment-stripped text
        obj[kv.key] = this.scalarValue(rest, restRaw, ind);
      }
    }
    return obj;
  }
  parseSeq(ind) {
    const arr = [];
    for (;;) {
      if (!this.sig()) break; const line = this.lines[this.pos], ci = this.ind(line); if (ci !== ind) { if (ci > ind) throw new YamlError('unexpected indentation', this.pos + 1); break; }
      const body = line.slice(ci); if (!/^-(\s|$)/.test(body)) break;
      const after = body.slice(1), spaces = /^ */.exec(after)[0].length, restRaw = after.slice(spaces), rest = stripComment(restRaw).trim(), newInd = ci + 1 + spaces;
      if (rest === '') { this.pos++; let v = null; if (this.sig() && this.ind(this.lines[this.pos]) > ind) v = this.parseNode(this.ind(this.lines[this.pos])); arr.push(v); }
      else if (/^-(\s|$)/.test(rest)) { this.lines[this.pos] = ' '.repeat(newInd) + restRaw; arr.push(this.parseSeq(newInd)); }
      else if (splitKey(rest)) { this.lines[this.pos] = ' '.repeat(newInd) + restRaw; arr.push(this.parseMap(newInd)); }
      else arr.push(this.scalarValue(rest, restRaw, ind));
    }
    return arr;
  }
}
const stripQuoteTail = (s) => s.trimEnd();
export function parseYaml(text) {
  const p = new Parser(String(text)); const v = p.parseNode(0);
  if (p.sig()) throw new YamlError('unexpected content after document', p.pos + 1);
  return v;
}
/** Multi-document stream separated by lines of `---`. */
export function parseYamlAll(text) {
  const docs = []; let cur = [];
  for (const l of String(text).replace(/\r\n?/g, '\n').split('\n')) { if (/^---(\s|$)/.test(l)) { if (cur.join('').trim()) docs.push(cur.join('\n')); cur = []; const tail = l.slice(3).trim(); if (tail && !tail.startsWith('#')) cur.push(tail); } else if (/^\.\.\.\s*$/.test(l)) { docs.push(cur.join('\n')); cur = []; } else cur.push(l); }
  if (cur.join('').trim()) docs.push(cur.join('\n'));
  return docs.map(parseYaml);
}
