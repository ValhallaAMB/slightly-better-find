(() => {
  "use strict";

  const inTopFrame = window === window.top;
  const inMac = /mac/i.test(navigator.userAgentData?.platform ?? navigator.platform);
  const { collectText, findMatches, revealRange } = globalThis.findOptionsSearch;
  const matchCue = globalThis.findOptionsMatchCue;
  const scrollMarkers = globalThis.findOptionsScrollMarkers;
  const settings = { highlightAll: true, matchCase: false, wholeWord: false };
  const frames = new Set();
  const highlightSheets = new Map();
  const allName = "find-options-59c1-all";
  const activeName = "find-options-59c1-active";
  const highlightRules = `
    ::highlight(${allName}) { background-color: #ffec6b; color: #25210c; }
    ::highlight(${activeName}) { background-color: #ff9a3d; color: #271607; }
    @media (prefers-color-scheme: dark) {
      ::highlight(${allName}) { background-color: #f3d755; color: #211b08; }
      ::highlight(${activeName}) { background-color: #ffa34d; color: #271607; }
    }
    @media (forced-colors: active) {
      ::highlight(${allName}) { background-color: Mark; color: MarkText; }
      ::highlight(${activeName}) { background-color: Highlight; color: HighlightText; }
    }
  `;

  let bar;
  let markers;
  let previousFocus;
  let index;
  let matches = [];
  let active = -1;
  let observer;
  let timer;
  let queryPending = false;
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
    return bar && event.target === bar.host && event.composedPath()[0] === bar.input;
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
      onNavigate(event.shiftKey ? -1 : 1);
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
      stopMatchCue?.();
      queryPending = true;
      scheduleSearch(false, true);
    }
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
      bar = globalThis.createFindOptionsBar({ onNavigate, onOption, onClose: close });
      markers = scrollMarkers.create(document);
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
    bar.input.value = "";
    Object.assign(settings, { highlightAll: true, matchCase: false, wholeWord: false });
  }

  function documentChanged() {
    if (!isOpen()) {
      close();
      return;
    }
    index = undefined;
    if (bar.input.value.trim() && timer === undefined) scheduleSearch(true, false);
  }

  function scheduleSearch(preserve, reveal) {
    clearTimeout(timer);
    timer = setTimeout(() => search({ preserve, reveal }), 55);
  }

  function onOption(name) {
    settings[name] = !settings[name];
    if (name !== "highlightAll" || timer !== undefined) search({ preserve: true, reveal: true });
    else render(false);
  }

  function onNavigate(direction) {
    if (queryPending && direction > 0) {
      search();
      return;
    }
    if (timer !== undefined) search({ preserve: !queryPending, reveal: false });
    if (!matches.length) return;
    active = (active + direction + matches.length) % matches.length;
    render(true);
  }

  function search({ rebuild = false, preserve = false, reveal = true } = {}) {
    clearTimeout(timer);
    timer = undefined;
    queryPending = false;
    if (rebuild) index = undefined;
    if (!isOpen()) return;
    const previousRange = preserve ? matches[active] : undefined;
    const previousIndex = active;
    const query = bar.input.value;
    if (query.trim()) {
      if (!index) {
        index = collectText(document, bar.host);
        observeDocuments(index.documents);
      }
      matches = findMatches(index.runs, query, settings);
    } else {
      matches = [];
      index = undefined;
      observeDocuments(new Set([document]));
    }
    active = matches.length ? 0 : -1;
    if (previousRange && matches.length) {
      const same = matches.findIndex((range) => range.startContainer === previousRange.startContainer
        && range.startOffset === previousRange.startOffset);
      active = same >= 0 ? same : Math.min(previousIndex, matches.length - 1);
    }
    render(reveal);
  }

  function clearHighlights(keep) {
    for (const [doc, { sheet, registry }] of highlightSheets) {
      registry.delete(allName);
      registry.delete(activeName);
      if (keep.has(doc)) continue;
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((item) => item !== sheet);
      highlightSheets.delete(doc);
    }
  }

  function render(reveal) {
    const current = matches[active];
    const visibleMatches = settings.highlightAll ? matches : current ? [current] : [];
    const byDocument = new Map();
    for (const range of visibleMatches) {
      const doc = range.startContainer.ownerDocument;
      if (!byDocument.has(doc)) byDocument.set(doc, []);
      if (range !== current) byDocument.get(doc).push(range);
    }
    clearHighlights(byDocument);
    for (const [doc, ranges] of byDocument) {
      const view = doc.defaultView;
      if (!view?.CSS.highlights) continue;
      if (!highlightSheets.has(doc)) {
        const sheet = new view.CSSStyleSheet();
        sheet.replaceSync(highlightRules);
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
        highlightSheets.set(doc, { sheet, registry: view.CSS.highlights });
      }
      const { registry } = highlightSheets.get(doc);
      if (ranges.length) {
        const highlight = new view.Highlight();
        for (const range of ranges) highlight.add(range);
        registry.set(allName, highlight);
      }
      if (current.startContainer.ownerDocument === doc) {
        const selected = new view.Highlight(current);
        selected.priority = 1;
        registry.set(activeName, selected);
      }
    }
    bar.update(active, matches.length, settings, Boolean(bar.input.value.trim()));
    markers.update(matches, active);
    if (reveal && current) {
      stopMatchCue?.();
      revealRange(current, window);
      stopMatchCue = matchCue.play(current, activeName);
    }
  }
})();
