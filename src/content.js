(() => {
  "use strict";

  const inTopFrame = window === window.top;
  const inMac = /mac/i.test(navigator.userAgentData?.platform ?? navigator.platform);
  const { collectText, findMatches, revealRange } = globalThis.findOptionsSearch;
  const matchCue = globalThis.findOptionsMatchCue;
  const scrollMarkers = globalThis.findOptionsScrollMarkers;
  const defaults = { highlightAll: true, matchCase: false, wholeWord: false };
  const globalSettings = { ...defaults };
  const termSettings = new Map();
  const frames = new Set();
  const highlightSheets = new Map();
  const colors = globalThis.findOptionsColors;
  const allName = (term) => term ? `find-options-59c1-all-${term}` : "find-options-59c1-all";
  const activeName = (term) => term ? `find-options-59c1-active-${term}` : "find-options-59c1-active";
  const highlightRule = (name, color, ink = "#25210c") =>
    `::highlight(${name}) { background-color: ${color}; color: ${ink}; }`;
  const highlightRules = colors.map(([light, activeLight, dark, activeDark], term) => `
    ${highlightRule(allName(term), light)}
    ${highlightRule(activeName(term), activeLight)}
    @media (prefers-color-scheme: dark) {
      ${highlightRule(allName(term), dark)}
      ${highlightRule(activeName(term), activeDark)}
    }
    @media (forced-colors: active) {
      ${highlightRule(allName(term), "Mark", "MarkText")}
      ${highlightRule(activeName(term), "Highlight", "HighlightText")}
    }
  `).join("");


  let bar;
  let markers;
  let previousFocus;
  let index;
  let matches = [];
  let matchesByTerm = new Map();
  let termPositions = new Map();
  let active = -1;
  let observer;
  let timer;
  let queryPending = false;
  let editedTerm;
  let stopMatchCue;
  const keysPressedInFind = new Set();

  function isOpen() {
    return bar?.host.matches(":popover-open");
  }

  function eligibleContext() {
    try {
      for (let frame = window; frame !== window.top; frame = frame.parent) {
        if (!frame.frameElement) return false;
      }
      return /^https?:$/.test(window.top.location.protocol)
        && window.top.document.documentElement
        && window.top.document.contentType !== "application/pdf"
        && document.contentType !== "application/pdf"
        && typeof CSS.highlights !== "undefined"
        && typeof HTMLElement.prototype.showPopover === "function";
    } catch {
      return false;
    }
  }

  function isFindInputEvent(event) {
    return bar && event.target === bar.host && bar.termOf(event.composedPath()[0]) !== undefined;
  }

  function isFindShortcut(event) {
    return !event.defaultPrevented && event.cancelable && !event.isComposing
      && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f"
      && (event.ctrlKey && !event.metaKey || inMac && event.metaKey && !event.ctrlKey);
  }

  window.addEventListener("keydown", (event) => {
    if (!event.isTrusted) return;
    const inFind = isFindInputEvent(event);
    const key = event.code || event.key;
    if (inFind) {
      // Stop page shortcut listeners, while preserving the input's native editing actions.
      keysPressedInFind.add(key);
      event.stopImmediatePropagation();
    } else {
      keysPressedInFind.delete(key);
    }

    if (isFindShortcut(event) && eligibleContext()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (inTopFrame) {
        open();
      } else {
        chrome.runtime.sendMessage({ type: "find-options:open-from-frame" }).catch(() => {});
      }
      return;
    }

    if (!inFind || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const term = bar.isExpanded() ? bar.termOf(event.composedPath()[0]) : undefined;
      onNavigate(event.shiftKey ? -1 : 1, term);
    }
  }, true);

  if (!inTopFrame) return;

  window.addEventListener("keypress", (event) => {
    if (isFindInputEvent(event)) event.stopImmediatePropagation();
  }, true);
  window.addEventListener("keyup", (event) => {
    const startedInFind = keysPressedInFind.delete(event.code || event.key);
    if (startedInFind || isFindInputEvent(event)) event.stopImmediatePropagation();
  }, true);
  window.addEventListener("blur", () => keysPressedInFind.clear());

  function onFindEdit(event) {
    if (!isFindInputEvent(event)) return;
    event.stopImmediatePropagation();
    if (event.type === "compositionend" || event.type === "input" && !event.isComposing) {
      onTermsChanged(bar.termOf(event.composedPath()[0]));
    }
  }

  function onTermsChanged(term) {
    stopMatchCue?.();
    editedTerm = term;
    queryPending = true;
    scheduleSearch(false, true);
  }

  for (const type of ["beforeinput", "input", "compositionstart", "compositionupdate", "compositionend",
    "copy", "cut", "paste"]) {
    window.addEventListener(type, onFindEdit, true);
  }

  window.addEventListener("pagehide", pageHidden);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === "find-options:open" && sender.id === chrome.runtime.id && eligibleContext()) {
      open();
      respond(true);
    }
  });

  function focusedElement(doc) {
    let element = doc.activeElement;
    while (element) {
      const inner = element.shadowRoot?.activeElement ?? element.contentDocument?.activeElement;
      if (!inner) break;
      element = inner;
    }
    return element;
  }

  function open() {
    if (!bar) {
      bar = globalThis.createFindOptionsBar({ onNavigate, onOption, onClose: close, onTermsChanged, onFieldChange });
      markers = scrollMarkers.create(document, onMarkerSelect);
    }
    if (!isOpen()) {
      previousFocus = focusedElement(document);
      if (!bar.host.isConnected) document.documentElement.append(bar.host);
      bar.host.showPopover();
      observer = new MutationObserver((records) => {
        if (records.some((record) => {
          if (record.target === bar.host || record.target.localName === scrollMarkers.elementName) return false;
          if (record.type !== "childList") return true;
          return [...record.addedNodes, ...record.removedNodes].some((node) =>
            node.localName !== matchCue.elementName && node.localName !== scrollMarkers.elementName);
        })) documentChanged();
      });
      observeDocuments(new Set([document]));
      window.addEventListener("resize", documentChanged);
      search({ rebuild: true, reveal: false });
    }
    bar.input.focus({ preventScroll: true });
    bar.input.select();
  }

  function observeDocuments(nextFrames) {
    if (frames.size === nextFrames.size && [...frames].every((doc) => nextFrames.has(doc))) return;
    observer.disconnect();
    for (const doc of frames) {
      doc.removeEventListener("load", documentChanged, true);
    }
    frames.clear();
    for (const doc of nextFrames) {
      frames.add(doc);
      observer.observe(doc, { subtree: true, childList: true, characterData: true, attributes: true });
      doc.addEventListener("load", documentChanged, true);
    }
  }

  function close() {
    if (!isOpen() && !observer) return;
    clearTimeout(timer);
    timer = undefined;
    queryPending = false;
    editedTerm = undefined;
    stopMatchCue?.();
    stopMatchCue = undefined;
    markers?.clear();
    observer?.disconnect();
    observer = undefined;
    for (const doc of frames) doc.removeEventListener("load", documentChanged, true);
    frames.clear();
    window.removeEventListener("resize", documentChanged);
    clearHighlights(new Set());
    matches = [];
    matchesByTerm.clear();
    termPositions.clear();
    index = undefined;
    active = -1;
    if (isOpen()) bar.host.hidePopover();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = undefined;
  }

  function pageHidden() {
    if (!bar) return;
    previousFocus = undefined;
    close();
    bar.resetQueries();
    Object.assign(globalSettings, defaults);
    termSettings.clear();
  }

  function documentChanged() {
    if (!isOpen()) {
      close();
      return;
    }
    index = undefined;
    if (bar.queries().length && timer === undefined) scheduleSearch(true, false);
  }

  function scheduleSearch(preserve, reveal) {
    clearTimeout(timer);
    timer = setTimeout(() => search({ preserve, reveal }), 55);
  }

  function settingsFor(term) {
    if (!termSettings.has(term)) termSettings.set(term, { ...globalSettings });
    return termSettings.get(term);
  }

  function onFieldChange(removed, hadQuery) {
    if (removed !== undefined) {
      termSettings.delete(removed);
      termPositions.delete(removed);
    }
    if (hadQuery) {
      stopMatchCue?.();
      search({ preserve: true, reveal: false });
    } else {
      render(false);
    }
  }

  function onOption(name, term) {
    if (term === undefined) {
      const rows = Array.from(bar.terms(), settingsFor);
      const value = rows.some((row) => !row[name]);
      globalSettings[name] = value;
      for (const row of rows) row[name] = value;
    } else {
      const settings = settingsFor(term);
      settings[name] = !settings[name];
    }
    if (name !== "highlightAll" || timer !== undefined) search({ preserve: !queryPending, reveal: true });
    else render(false);
  }

  function onNavigate(direction, term) {
    if (queryPending && direction > 0 && (term === undefined || term === editedTerm)) {
      search();
      return;
    }
    if (timer !== undefined) search({ preserve: !queryPending, reveal: false });
    if (term === undefined) {
      if (!matches.length) return;
      active = (active + direction + matches.length) % matches.length;
    } else {
      const indexes = matchesByTerm.get(term);
      if (!indexes?.length) return;
      const position = (termPositions.get(term) + direction + indexes.length) % indexes.length;
      active = indexes[position];
    }
    render(true);
  }

  function sameMatch(first, second) {
    return first.term === second.term
      && first.range.startContainer === second.range.startContainer
      && first.range.startOffset === second.range.startOffset
      && first.range.endContainer === second.range.endContainer
      && first.range.endOffset === second.range.endOffset;
  }

  function setMatches(next) {
    const groups = new Map();
    next.forEach(({ term }, index) => {
      if (!groups.has(term)) groups.set(term, []);
      groups.get(term).push(index);
    });
    const positions = new Map();
    for (const [term, indexes] of groups) {
      const previous = termPositions.get(term) ?? 0;
      const match = matches[matchesByTerm.get(term)?.[previous]];
      const same = match ? indexes.findIndex((index) => sameMatch(next[index], match)) : -1;
      positions.set(term, same >= 0 ? same : Math.min(previous, indexes.length - 1));
    }
    matches = next;
    matchesByTerm = groups;
    termPositions = positions;
  }

  function onMarkerSelect(match) {
    if (!isOpen() || queryPending || !match || match.range.collapsed || !match.range.startContainer.isConnected) return;
    if (timer !== undefined) search({ preserve: true, reveal: false });
    const selected = matches.findIndex((candidate) => sameMatch(candidate, match));
    if (selected === -1) return;
    active = selected;
    render(true);
  }

  function search({ rebuild = false, preserve = false, reveal = true } = {}) {
    clearTimeout(timer);
    timer = undefined;
    queryPending = false;
    const preferredTerm = editedTerm;
    editedTerm = undefined;
    if (rebuild) index = undefined;
    if (!isOpen()) return;
    const previousMatch = preserve ? matches[active] : undefined;
    const previousIndex = active;
    const queries = bar.queries();
    if (queries.length) {
      if (!index) {
        index = collectText(document, bar.host);
        observeDocuments(index.documents);
      }
      const scoped = queries.map((query) => ({ ...query, ...settingsFor(query.term) }));
      setMatches(findMatches(index.runs, scoped));
    } else {
      setMatches([]);
      index = undefined;
      observeDocuments(new Set([document]));
    }
    const intended = matches.findIndex((match) => match.term === preferredTerm);
    active = matches.length ? Math.max(0, intended) : -1;
    if (previousMatch && matches.length) {
      const same = matches.findIndex((match) => sameMatch(match, previousMatch));
      active = same >= 0 ? same : Math.min(previousIndex, matches.length - 1);
    }
    render(reveal);
  }

  function clearHighlights(keep) {
    for (const [doc, { sheet, registry, names }] of highlightSheets) {
      for (const name of names) registry.delete(name);
      names.clear();
      if (keep.has(doc)) continue;
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((item) => item !== sheet);
      highlightSheets.delete(doc);
    }
  }

  function render(reveal) {
    const current = matches[active];
    if (current) termPositions.set(current.term, matchesByTerm.get(current.term).indexOf(active));
    const visible = matches.filter((match) => match === current || settingsFor(match.term).highlightAll);
    const documents = new Map();
    for (const match of visible) {
      const doc = match.range.startContainer.ownerDocument;
      if (!documents.has(doc)) documents.set(doc, new Map());
      const terms = documents.get(doc);
      const name = match === current ? activeName(match.term) : allName(match.term);
      if (!terms.has(name)) terms.set(name, { priority: match === current ? colors.length : match.term, ranges: [] });
      terms.get(name).ranges.push(match.range);
    }
    clearHighlights(documents);
    for (const [doc, terms] of documents) {
      const view = doc.defaultView;
      if (!view?.CSS.highlights) continue;
      if (!highlightSheets.has(doc)) {
        const sheet = new view.CSSStyleSheet();
        sheet.replaceSync(highlightRules);
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
        highlightSheets.set(doc, { sheet, registry: view.CSS.highlights, names: new Set() });
      }
      const { registry, names } = highlightSheets.get(doc);
      for (const [name, { priority, ranges }] of terms) {
        const highlight = new view.Highlight();
        for (const range of ranges) highlight.add(range);
        highlight.priority = priority;
        registry.set(name, highlight);
        names.add(name);
      }
    }
    const locals = new Map();
    for (const term of bar.terms()) {
      locals.set(term, {
        position: (termPositions.get(term) ?? -1) + 1,
        total: matchesByTerm.get(term)?.length ?? 0,
        current: current?.term === term,
        settings: settingsFor(term)
      });
    }
    const rows = Array.from(locals.values(), ({ settings }) => settings);
    const combined = Object.fromEntries(Object.keys(defaults).map((key) => {
      const on = rows.filter((row) => row[key]).length;
      return [key, on === rows.length ? true : on === 0 ? false : "mixed"];
    }));
    bar.update({
      position: active + 1,
      total: matches.length,
      settings: combined,
      hasQuery: Boolean(bar.queries().length)
    }, locals);
    markers.update(matches, active);
    if (reveal && current) {
      stopMatchCue?.();
      revealRange(current.range, window, bar.host.getBoundingClientRect());
      stopMatchCue = matchCue.play(current.range, activeName(current.term));
    }
  }
})();
