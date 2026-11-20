chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "find-options:open-from-frame" || !sender.frameId || !sender.tab?.id) {
    return;
  }

  chrome.tabs.sendMessage(sender.tab.id, { type: "find-options:open" }, { frameId: 0 })
    .then(() => sendResponse(true), () => sendResponse(false));
  return true;
});
