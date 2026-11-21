(() => {
  "use strict";

  const elementName = "find-options-scroll-markers";
  const trackWidth = 10;
  const svgNamespace = "http://www.w3.org/2000/svg";
  const styles = `
    :host {
      all: initial;
      position: fixed;
      width: ${trackWidth}px;
      pointer-events: none;
      z-index: 2147483646;
      --match: #ffec6b;
      --current: #ff9a3d;
    }
    :host([hidden]) { display: none; }
    svg { display: block; width: 100%; height: 100%; overflow: hidden; }
    path { fill: none; stroke-linecap: round; }
    .hit-area { stroke: transparent; stroke-width: 8; pointer-events: stroke; cursor: pointer; }
    .matches { stroke: var(--match); stroke-width: 2.5; filter: drop-shadow(0 0 0.7px #3a2d16); }
    .current { stroke: var(--current); stroke-width: 3.5; filter: drop-shadow(0 0 0.8px #3a2d16); }
    @media (prefers-color-scheme: dark) {
      :host { --match: #f3d755; --current: #ffa34d; }
    }
    @media (forced-colors: active) {
      svg { forced-color-adjust: none; }
      .hit-area { stroke: transparent; }
      .matches { stroke: Mark; filter: none; }
      .current { stroke: Highlight; filter: none; }
    }
  `;

  function create(topDocument, onSelect) {
    const topView = topDocument.defaultView;
    const tracks = new Map();
    const observed = new Set();
    const views = new Set();
    const resizeObserver = new ResizeObserver(invalidate);
    let ranges;
    let active = -1;
    let pending;
    let dirty = false;

    function invalidate() {
      dirty = true;
      queue();
    }

    function queue() {
      if (pending === undefined) pending = topView.requestAnimationFrame(paint);
    }

    function update(nextRanges, nextActive) {
      if (!nextRanges.length) {
        clear();
        return;
      }
      if (ranges !== nextRanges) dirty = true;
      ranges = nextRanges;
      active = nextActive;
      queue();
    }

    function clear() {
      if (pending !== undefined) topView.cancelAnimationFrame(pending);
      pending = undefined;
      ranges = undefined;
      dirty = false;
      for (const { host } of tracks.values()) host.remove();
      tracks.clear();
      resizeObserver.disconnect();
      observed.clear();
      for (const view of views) {
        view.removeEventListener("scroll", queue, true);
        view.removeEventListener("resize", invalidate);
      }
      views.clear();
    }

    function createTrack(doc) {
      const host = doc.createElement(elementName);
      host.setAttribute("aria-hidden", "true");
      const shadow = host.attachShadow({ mode: "open" });
      const sheet = new doc.defaultView.CSSStyleSheet();
      sheet.replaceSync(styles);
      shadow.adoptedStyleSheets = [sheet];
      const svg = doc.createElementNS(svgNamespace, "svg");
      svg.setAttribute("preserveAspectRatio", "none");
      const matches = doc.createElementNS(svgNamespace, "path");
      matches.setAttribute("class", "matches");
      const current = doc.createElementNS(svgNamespace, "path");
      current.setAttribute("class", "current");
      const hitArea = doc.createElementNS(svgNamespace, "path");
      hitArea.setAttribute("class", "hit-area");
      svg.append(matches, current, hitArea);
      shadow.append(svg);
      doc.documentElement.append(host);
      const track = { host, svg, matches, current, hitArea };

      hitArea.addEventListener("mousedown", (event) => {
        if (!event.isTrusted || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
      });
      hitArea.addEventListener("click", (event) => {
        if (!event.isTrusted || event.button !== 0) return;
        event.stopPropagation();
        selectTick(track, event.clientY);
      });
      return track;
    }

    function selectTick(track, clientY) {
      const bounds = track.svg.getBoundingClientRect();
      if (!bounds.height) return;
      const y = (clientY - bounds.top) * track.height / bounds.height;
      let nearest;
      let distance = Infinity;
      for (const [center, indexes] of track.ticks) {
        const gap = Math.abs(center - y);
        if (gap >= distance) continue;
        nearest = indexes;
        distance = gap;
      }
      if (!nearest) return;
      // If several results share one tick, clicking again advances within that group.
      const previous = ranges === track.ranges ? active : track.active;
      const index = nearest[(nearest.indexOf(previous) + 1) % nearest.length];
      onSelect(track.ranges[index]);
    }

    function updateTracks() {
      const owners = new Map();
      const groups = new Map();
      const geometry = new Map();
      const neededObservers = new Set();
      const neededViews = new Set();

      function owner(lineage) {
        if (!lineage) return;
        if (owners.has(lineage)) return owners.get(lineage);
        const doc = lineage.ownerDocument;
        const viewport = doc.scrollingElement;
        const canScroll = lineage.scrollHeight > lineage.clientHeight + 1
          && /^(auto|overlay|scroll)$/.test(doc.defaultView.getComputedStyle(lineage).overflowY);
        const found = lineage === viewport || canScroll ? lineage : owner(lineage.parentElement) ?? viewport;
        owners.set(lineage, found);
        return found;
      }

      function measure(element) {
        if (geometry.has(element)) return geometry.get(element);
        const doc = element.ownerDocument;
        const viewport = doc.scrollingElement === element;
        const view = doc.defaultView;
        const rect = element.getBoundingClientRect();
        const scale = viewport || !element.offsetHeight ? 1 : rect.height / element.offsetHeight || 1;
        const top = viewport ? 0 : rect.top + element.clientTop * scale;
        const height = viewport ? doc.documentElement.clientHeight : element.clientHeight;
        const result = { view, viewport, scale, top, height, total: Math.max(height, element.scrollHeight, 1) };
        geometry.set(element, result);
        return result;
      }

      for (const [index, range] of ranges.entries()) {
        if (!range.startContainer.isConnected || !range.startContainer.ownerDocument.defaultView) continue;
        const rect = range.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        let y = rect.top + Math.min(rect.height / 2, 10);
        for (let source = range.startContainer.parentElement; source;) {
          const element = owner(source);
          if (!element) break;
          const { view, viewport, scale, top, height, total } = measure(element);
          const offset = element.scrollTop + (y - top) / scale;
          const position = Math.max(0, Math.min(1, offset / total));
          if (height > 4 && total > height + 1) {
            if (!groups.has(element)) groups.set(element, []);
            groups.get(element).push({ index, position });
          }
          if (viewport) {
            const frame = view.frameElement;
            if (!frame) break;
            const frameRect = frame.getBoundingClientRect();
            const frameScale = frame.offsetHeight ? frameRect.height / frame.offsetHeight : 1;
            y = frameRect.top + (frame.clientTop + position * frame.clientHeight) * frameScale;
            source = frame;
          } else {
            y = top + position * height * scale;
            source = element.parentElement;
          }
        }
      }

      for (const [element, track] of tracks) {
        if (groups.has(element)) continue;
        track.host.remove();
        tracks.delete(element);
      }
      for (const [element, points] of groups) {
        const doc = element.ownerDocument;
        if (!tracks.has(element)) tracks.set(element, createTrack(doc));
        const track = tracks.get(element);
        track.points = points;
        track.ranges = ranges;
        track.dirty = true;
        track.clips = [];
        if (element !== doc.scrollingElement) {
          for (let parent = owner(element.parentElement); parent && parent !== doc.scrollingElement;
            parent = owner(parent.parentElement)) {
            track.clips.push(parent);
          }
        }
        neededViews.add(doc.defaultView);
        neededObservers.add(element);
        if (doc.body) neededObservers.add(doc.body);
      }
      for (const view of views) {
        if (neededViews.has(view)) continue;
        view.removeEventListener("scroll", queue, true);
        view.removeEventListener("resize", invalidate);
        views.delete(view);
      }
      for (const view of neededViews) {
        if (views.has(view)) continue;
        view.addEventListener("scroll", queue, true);
        view.addEventListener("resize", invalidate);
        views.add(view);
      }
      for (const element of observed) {
        if (neededObservers.has(element)) continue;
        resizeObserver.unobserve(element);
        observed.delete(element);
      }
      for (const element of neededObservers) {
        if (observed.has(element)) continue;
        resizeObserver.observe(element);
        observed.add(element);
      }
    }

    function paint() {
      pending = undefined;
      if (!ranges) return;
      if (dirty) {
        dirty = false;
        updateTracks();
      }
      for (const [element, track] of tracks) {
        const doc = element.ownerDocument;
        const view = doc.defaultView;
        if (!view || !track.host.isConnected) continue;
        const viewport = element === doc.scrollingElement;
        const bounds = element.getBoundingClientRect();
        const scaleX = viewport || !element.offsetWidth ? 1 : bounds.width / element.offsetWidth;
        const scaleY = viewport || !element.offsetHeight ? 1 : bounds.height / element.offsetHeight;
        const top = viewport ? 0 : bounds.top + element.clientTop * scaleY;
        const height = viewport ? doc.documentElement.clientHeight : element.clientHeight * scaleY;
        const style = view.getComputedStyle(element);
        const scrollbarLeft = element.clientLeft - (parseFloat(style.borderLeftWidth) || 0) > 1;
        const start = viewport ? (scrollbarLeft ? element.clientLeft : 0) : bounds.left + element.clientLeft * scaleX;
        const width = viewport ? doc.documentElement.clientWidth : element.clientWidth * scaleX;
        const left = scrollbarLeft ? start + 1 : start + width - trackWidth - 1;
        let visibleTop = 0;
        let visibleBottom = view.innerHeight;
        for (const parent of track.clips) {
          const rect = parent.getBoundingClientRect();
          const scale = parent.offsetHeight ? rect.height / parent.offsetHeight : 1;
          const clipTop = rect.top + parent.clientTop * scale;
          visibleTop = Math.max(visibleTop, clipTop);
          visibleBottom = Math.min(visibleBottom, clipTop + parent.clientHeight * scale);
        }
        const clipTop = Math.max(0, visibleTop - top);
        const clipBottom = Math.max(0, top + height - visibleBottom);
        const hidden = height < 5 || clipTop + clipBottom >= height
          || left >= view.innerWidth || left + trackWidth <= 0;
        if (track.host.hidden !== hidden) track.host.hidden = hidden;
        if (hidden) continue;
        if (track.left !== left) track.host.style.left = `${left}px`;
        if (track.top !== top) track.host.style.top = `${top}px`;
        if (track.height !== height) track.host.style.height = `${height}px`;
        const clip = clipTop || clipBottom ? `inset(${clipTop}px 0 ${clipBottom}px)` : "";
        if (track.clip !== clip) track.host.style.clipPath = clip;
        track.clip = clip;
        track.left = left;
        track.top = top;
        if (!track.dirty && track.height === height && track.active === active) continue;
        track.height = height;
        track.active = active;
        track.dirty = false;
        track.svg.setAttribute("viewBox", `0 0 ${trackWidth} ${height}`);
        const ticks = new Map();
        const others = new Set();
        let current;
        for (const { index, position } of track.points) {
          const y = Math.min(height - 2, 2 + Math.round(position * (height - 4) / 2) * 2);
          if (!ticks.has(y)) ticks.set(y, []);
          ticks.get(y).push(index);
          if (index === active) current = y;
          else others.add(y);
        }
        others.delete(current);
        track.ticks = ticks;
        track.matches.setAttribute("d", Array.from(others, (y) => `M3 ${y}h4.5`).join(" "));
        track.current.setAttribute("d", current === undefined ? "" : `M2 ${current}h6`);
        track.hitArea.setAttribute("d", Array.from(ticks.keys(), (y) => `M0 ${y}h${trackWidth}`).join(" "));
      }
    }

    return { update, clear };
  }

  globalThis.findOptionsScrollMarkers = { elementName, create };
})();
