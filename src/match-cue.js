(() => {
  "use strict";

  const elementName = "find-options-match-cue";
  const fontProperties = [
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant",
    "letterSpacing", "wordSpacing", "direction", "textTransform"
  ];
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

  function textForRects(slice, text, rects, style) {
    const labels = rects.map(() => "");
    if (!rects.length || style.writingMode !== "horizontal-tb") return labels;
    if (rects.length === 1) return [text];
    // Measuring each character is only needed for short matches spread across visual fragments.
    if (text.length > 256) return labels;
    const node = slice.startContainer;
    const start = slice.startOffset;
    for (const { segment, index } of graphemes.segment(text)) {
      slice.setStart(node, start + index);
      slice.setEnd(node, start + index + segment.length);
      const char = slice.getClientRects()[0];
      if (!char?.width) continue;
      const x = char.left + char.width / 2;
      const y = char.top + char.height / 2;
      const part = rects.findIndex((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
      if (part !== -1) labels[part] += segment;
    }
    return labels;
  }

  function visiblePieces(range, view) {
    const doc = range.startContainer.ownerDocument;
    const walker = doc.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    walker.currentNode = range.startContainer;
    const slice = doc.createRange();
    const pieces = [];

    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      const text = node.data.slice(start, end);
      if (text.trim() && node.parentElement) {
        const style = view.getComputedStyle(node.parentElement);
        if (style.visibility === "visible") {
          slice.setStart(node, start);
          slice.setEnd(node, end);
          const rects = Array.from(slice.getClientRects()).filter((rect) => rect.width && rect.height);
          const labels = textForRects(slice, text, rects, style);
          for (const [index, rect] of rects.entries()) {
            if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= view.innerWidth || rect.top >= view.innerHeight) {
              continue;
            }
            const label = labels[index];
            const visibleText = style.whiteSpaceCollapse === "collapse" ? label.replace(/[\t\n\f\r ]+/g, " ") : label;
            pieces.push({ rect, style, text: visibleText });
          }
        }
      }
      if (node === range.endContainer) break;
    }
    return pieces;
  }

  function play(range, highlightName) {
    const doc = range.startContainer.ownerDocument;
    const view = doc.defaultView;
    if (!view) return;
    const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    let host;
    let animation;
    const frame = view.requestAnimationFrame(() => {
      if (range.collapsed || !range.startContainer.isConnected || reducedMotion.matches) return;
      const pieces = visiblePieces(range, view);
      if (!pieces.length) return;

      const left = Math.min(...pieces.map(({ rect }) => rect.left));
      const top = Math.min(...pieces.map(({ rect }) => rect.top));
      const right = Math.max(...pieces.map(({ rect }) => rect.right));
      const bottom = Math.max(...pieces.map(({ rect }) => rect.bottom));
      const colors = view.getComputedStyle(range.startContainer.parentElement, `::highlight(${highlightName})`);
      host = doc.createElement(elementName);
      host.inert = true;
      host.setAttribute("aria-hidden", "true");
      Object.assign(host.style, {
        all: "initial",
        position: "fixed",
        left: `${left}px`,
        top: `${top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
        zIndex: "2147483647",
        pointerEvents: "none"
      });
      const root = host.attachShadow({ mode: "closed" });
      for (const { rect, style, text } of pieces) {
        const piece = doc.createElement("span");
        piece.textContent = text;
        Object.assign(piece.style, {
          position: "absolute",
          left: `${rect.left - left}px`,
          top: `${rect.top - top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          lineHeight: `${rect.height}px`,
          whiteSpace: "pre",
          textAlign: "start",
          borderRadius: "2px",
          boxShadow: `0 0 0 1px ${colors.backgroundColor}`,
          backgroundColor: text ? colors.backgroundColor : "transparent",
          color: colors.color
        });
        if (text) {
          for (const property of fontProperties) piece.style[property] = style[property];
        }
        root.append(piece);
      }
      doc.documentElement.append(host);
      animation = host.animate([
        { transform: "scale(1)", opacity: 0.9, easing: "ease-out" },
        { transform: "scale(1.18)", opacity: 1, offset: 0.34, easing: "ease-in-out" },
        { transform: "scale(1)", opacity: 1, offset: 0.82 },
        { transform: "scale(1)", opacity: 0 }
      ], { duration: 340 });
      animation.addEventListener("finish", stop, { once: true });
      view.addEventListener("scroll", stop, true);
      view.addEventListener("resize", stop);
      reducedMotion.addEventListener("change", stop);
    });

    function stop() {
      view.cancelAnimationFrame(frame);
      view.removeEventListener("scroll", stop, true);
      view.removeEventListener("resize", stop);
      reducedMotion.removeEventListener("change", stop);
      animation?.cancel();
      host?.remove();
      animation = undefined;
      host = undefined;
    }
    return stop;
  }

  globalThis.findOptionsMatchCue = { elementName, play };
})();
