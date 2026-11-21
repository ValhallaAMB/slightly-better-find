# Slightly Better Find

Find text on a webpage with **Ctrl+F** or **⌘+F**. The compact search bar adds three controls beside the previous and next arrows.

| Control | What it does | Default |
| --- | --- | --- |
| Highlight all matches | Mark every result. When off, keep the current result marked. | On |
| Match case | Require the query’s capitalization. | Off |
| Match whole word | Find complete words or phrases using Unicode word boundaries. | Off |

Click a notch beside the scrollbar to jump to that match. The current notch is orange. If several matches share a notch, click it again to cycle through them.

Use the chevron to expand Find and **+** to add a field. Search up to six words or phrases in yellow, blue, green, purple, pink, and cyan. The color beside each field matches its highlights and scrollbar notches.

- The top arrows and count cover all matches in page order. The top toggles apply to all six fields. A dashed toggle indicates mixed settings. Click it to turn that option on for every field.
- Each expanded row has its own arrows, position and count, and search options. Press Enter or Shift+Enter in a row to move through that term's results. The first row's × clears its query, and the other × buttons remove their rows.
- Collapsing Find shows only the yellow field. All searches, highlights, and notches stay active according to their options.

## Installation on Chromium browsers

1. Clone the repository to your directory of choice.
2. Open up `<browser-name>://extensions` within your browser.
3. Turn on **Developer mode**, click **Load unpacked**, and select the folder containing `manifest.json`.
4. Refresh any webpages that were already open, and press **Ctrl+F** (or **⌘F** on Mac).

Congrats it should be working now, yuppie

## Source 

- The interface icons are from [Lucide](https://lucide.dev/license).  
- The extension icon is [Find Outline Red from SVG Repo](https://www.svgrepo.com/svg/427713/find-outline-red), listed under CC0.

## Privacy and policy
Slightly Better Find does not save any of the data locally or remotely, it simply just uses the local text on the web page and searches everything locally.
