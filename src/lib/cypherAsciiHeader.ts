/**
 * Браузерный/Node fetch не допускает не-Latin-1 в значении заголовка CYPHER-QUERY.
 * Кодируем символы вне ASCII внутри строковых литералов '...' как \\uXXXX (и суррогатные пары для >U+FFFF).
 */
export function cypherQueryAsciiForHeader(src: string): string {
  let out = "";
  let i = 0;
  let inString = false;

  while (i < src.length) {
    const c = src[i];

    if (!inString) {
      if (c === "'") {
        inString = true;
        out += c;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }

    if (c === "\\" && i + 1 < src.length) {
      out += c + src[i + 1];
      i += 2;
      continue;
    }

    if (c === "'") {
      if (i + 1 < src.length && src[i + 1] === "'") {
        out += "''";
        i += 2;
        continue;
      }
      inString = false;
      out += c;
      i++;
      continue;
    }

    const cp = src.codePointAt(i)!;
    if (cp < 128) {
      out += String.fromCodePoint(cp);
      i += cp > 0xffff ? 2 : 1;
    } else if (cp <= 0xffff) {
      out += "\\u" + cp.toString(16).padStart(4, "0");
      i++;
    } else {
      const h = Math.floor((cp - 0x10000) / 0x400) + 0xd800;
      const l = ((cp - 0x10000) % 0x400) + 0xdc00;
      out +=
        "\\u" +
        h.toString(16).padStart(4, "0") +
        "\\u" +
        l.toString(16).padStart(4, "0");
      i += 2;
    }
  }

  return out;
}
