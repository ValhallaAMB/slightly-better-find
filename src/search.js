(() => {
  "use strict";

  const nonContent = new Set([
    "audio", "canvas", "embed", "head", "input", "noscript", "object", "option",
    "script", "select", "style", "template", "textarea", "video"
  ]);
  const whitespace = /[\t\n\f\r ]+/g;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });

  function collectText(topDocument, bar) {
    const documents = new Set();
    const runs = [];
    let pieces = [];
    let spans = [];
    let length = 0;
    let trailingSpace = false;

    function separate() {
      if (length) runs.push({ text: pieces.join(""), spans });
      pieces = [];
      spans = [];
      length = 0;
      trailingSpace = false;
    }

    function append(node, start, end, text) {
      spans.push({ node, start, end, offset: length, width: text.length });
      pieces.push(text);
      length += text.length;
    }

    function appendText(node) {
      const value = node.data;
      let cursor = 0;
      for (const space of value.matchAll(whitespace)) {
        if (space.index > cursor) {
          append(node, cursor, space.index, value.slice(cursor, space.index));
          trailingSpace = false;
        }
        cursor = space.index + space[0].length;
        if (length && !trailingSpace) {
          append(node, space.index, cursor, " ");
          trailingSpace = true;
        }
      }
      if (cursor < value.length) {
        append(node, cursor, value.length, value.slice(cursor));
        trailingSpace = false;
      }
    }

    function walk(node, view, visible) {
      if (node.nodeType === 3) {
        if (visible) appendText(node);
        return;
      }
      if (node.nodeType !== 1 || node === bar || nonContent.has(node.localName)) return;
      const style = view.getComputedStyle(node);
      if (style.display === "none" || style.contentVisibility === "hidden" || style.opacity === "0") return;

      const tag = node.localName;
      const shown = style.visibility === "visible";
      if (tag === "br" || tag === "hr") {
        separate();
        return;
      }
      if (tag === "iframe" || tag === "frame") {
        separate();
        if (shown && node.contentDocument) walkDocument(node.contentDocument);
        return;
      }

      const separates = style.display !== "contents"
        && !/^(inline|inline-block|inline-flex|inline-grid|inline flow-root|ruby)/.test(style.display);
      if (separates) separate();
      if (tag === "details" && !node.open) {
        const summary = Array.from(node.children).find((child) => child.localName === "summary");
        if (summary) walk(summary, view, shown);
      } else {
        for (let child = node.firstChild; child; child = child.nextSibling) walk(child, view, shown);
      }
      if (separates) separate();
    }

    function walkDocument(doc) {
      if (!doc.defaultView || documents.has(doc)) return;
      documents.add(doc);
      if (doc.body) walk(doc.body, doc.defaultView, true);
      separate();
    }

    walkDocument(topDocument);
    return { documents, runs };
  }

  function spanAt(spans, offset) {
    let low = 0;
    let high = spans.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (spans[middle].offset <= offset) low = middle;
      else high = middle - 1;
    }
    return spans[low];
  }

  function makeRange(spans, start, end) {
    const first = spanAt(spans, start);
    const last = spanAt(spans, end - 1);
    const range = first.node.ownerDocument.createRange();
    range.setStart(first.node, first.start + start - first.offset);
    const atEnd = end === last.offset + last.width;
    range.setEnd(last.node, atEnd ? last.end : last.start + end - last.offset);
    return range;
  }

  function findMatches(runs, query, { matchCase, wholeWord }) {
    const normalized = query.replace(whitespace, " ").trim();
    if (!normalized) return [];
    const literal = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(literal, matchCase ? "gu" : "giu");
    const matches = [];
    for (const { text, spans } of runs) {
      if (!pattern.test(text)) continue;
      pattern.lastIndex = 0;
      const segments = wholeWord ? segmenter.segment(text) : null;
      for (const match of text.matchAll(pattern)) {
        const start = match.index;
        const end = start + match[0].length;
        if (segments && (segments.containing(start)?.index !== start
          || (end < text.length && segments.containing(end)?.index !== end))) continue;
        matches.push(makeRange(spans, start, end));
      }
    }
    return matches;
  }

  function revealRange(range, topWindow) {
    const node = range.startContainer;
    const view = node.ownerDocument.defaultView;
    for (let element = node.parentElement; element; element = element.parentElement) {
      if (element === view.document.scrollingElement) continue;
      const style = view.getComputedStyle(element);
      const scrollX = /auto|scroll|hidden/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
      const scrollY = /auto|scroll|hidden/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
      if (!scrollX && !scrollY) continue;
      const rect = range.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const left = box.left + element.clientLeft;
      const top = box.top + element.clientTop;
      const x = scrollX && (rect.left < left || rect.right > left + element.clientWidth)
        ? rect.left - left - element.clientWidth / 3 : 0;
      const y = scrollY && (rect.top < top || rect.bottom > top + element.clientHeight)
        ? rect.top - top - element.clientHeight / 3 : 0;
      if (x || y) element.scrollBy({ left: x, top: y, behavior: "instant" });
    }
    const rect = range.getBoundingClientRect();
    const margin = view === topWindow ? 76 : 8;
    const x = rect.left < 0 || rect.right > view.innerWidth ? rect.left - view.innerWidth / 3 : 0;
    const y = rect.top < margin || rect.bottom > view.innerHeight ? rect.top - view.innerHeight / 3 : 0;
    if (x || y) view.scrollBy({ left: x, top: y, behavior: "instant" });
    for (let frameWindow = view; frameWindow && frameWindow !== topWindow; frameWindow = frameWindow.parent) {
      frameWindow.frameElement?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
    }
  }

  globalThis.findOptionsSearch = { collectText, findMatches, revealRange };
})();
