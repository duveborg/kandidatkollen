/* Pushes labels apart when they would otherwise overwrite each other. Parties
   with identical agreement — M, KD and L all sit at 100 % — land on the same
   y, and the text becomes unreadable.

   Only labels that are also close in x get nudged; otherwise two labels in
   opposite corners of a scatter plot would move each other without ever
   having overlapped. `xThreshold` is set to the chart width when every label
   sits in the same column, as in the timeline. */
export function avoidCollisions(labels, minGap = 14, xThreshold = 44) {
  const sorted = labels.slice().sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      if (Math.abs(sorted[i].x - sorted[j].x) > xThreshold) continue;
      if (sorted[i].y - sorted[j].y < minGap) sorted[i].y = sorted[j].y + minGap;
      break;
    }
  }
  return sorted;
}
