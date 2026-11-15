import { useEffect, useRef } from 'react';
import { dot, face, line } from '../art/pixels';

export type GuideMood = 'ready' | 'happy' | 'caution' | 'thinking';

// Original 32 × 32 pixel sprite. Each face and gesture is drawn on the same grid as the outpost art.
export function AstronautGuide({ mood }: { mood: GuideMood }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, 32, 32);
    const ink = '#1a253b', white = '#f7ead2', light = '#d7e1da', shade = '#8899ae', warm = '#e7ad59', ice = '#d5f4ef';
    face(g, [[3, 29], [8, 26], [25, 26], [29, 29], [26, 31], [6, 31]], '#101724');
    face(g, [[5, 26], [6, 21], [11, 18], [22, 18], [27, 21], [28, 28], [24, 30], [8, 30]], ink);
    face(g, [[8, 23], [12, 19], [22, 20], [25, 22], [26, 27], [23, 29], [9, 29], [7, 27]], shade);
    face(g, [[10, 23], [13, 21], [21, 21], [23, 25], [22, 28], [10, 28]], white);
    dot(g, 13, 22, '#4b6377', 7, 5);
    dot(g, 14, 23, warm, 3, 2);
    dot(g, 18, 23, '#b5e9d1', 1, 2);
    dot(g, 8, 26, '#4d6881', 3, 3);
    dot(g, 22, 27, '#546779', 3, 2);

    face(g, [[6, 7], [9, 3], [13, 1], [21, 1], [26, 4], [29, 9], [29, 16], [27, 20], [22, 23], [12, 23], [7, 20], [4, 16], [4, 10]], ink);
    face(g, [[7, 8], [10, 4], [14, 2], [21, 2], [25, 5], [27, 9], [27, 16], [25, 19], [21, 21], [12, 21], [8, 19], [6, 15]], shade);
    face(g, [[8, 7], [11, 4], [15, 3], [21, 3], [25, 6], [27, 11], [26, 16], [23, 19], [14, 20], [8, 17], [6, 12]], white);
    face(g, [[7, 10], [10, 7], [23, 7], [26, 10], [25, 16], [22, 19], [12, 19], [8, 17]], '#2e4662');
    face(g, [[8, 10], [11, 8], [22, 8], [24, 10], [24, 14], [21, 17], [12, 17], [9, 15]], '#456681');
    line(g, [10, 10], [13, 9], '#8bc6d7');
    dot(g, 10, 12, '#7596ac');
    dot(g, 24, 7, light, 3, 3);
    dot(g, 27, 10, warm, 3, 5);
    dot(g, 28, 11, '#f4cb7b', 2, 2);
    dot(g, 26, 15, '#5e7688', 2, 2);
    dot(g, 11, 15, '#d29ca0', 2);
    dot(g, 21, 15, '#d29ca0', 2);

    if (mood === 'happy') {
      for (const x of [12, 19]) {
        dot(g, x, 13, ice); dot(g, x + 1, 12, ice, 2); dot(g, x + 3, 13, ice);
      }
      dot(g, 15, 15, ice, 4); dot(g, 16, 16, ice, 2);
      face(g, [[3, 19], [5, 18], [8, 20], [8, 25], [5, 27], [2, 24]], ink);
      dot(g, 4, 20, white, 3, 3); dot(g, 4, 23, warm, 3, 2);
      dot(g, 2, 8, '#9de7c7', 2); dot(g, 3, 7, '#9de7c7', 1, 4);
    } else if (mood === 'caution') {
      dot(g, 13, 11, ice, 2, 3); dot(g, 19, 11, ice, 2, 3);
      dot(g, 16, 15, ice, 2, 2); dot(g, 17, 15, '#617f96');
      dot(g, 2, 6, '#ffac8c', 2, 4); dot(g, 2, 11, '#ffac8c', 2);
    } else {
      const think = mood === 'thinking';
      dot(g, 13, 12, ice, 2, think ? 1 : 3); dot(g, 19, think ? 11 : 12, ice, 2, think ? 2 : 3);
      dot(g, 15, 16, ice, think ? 3 : 4);
      if (think) {
        dot(g, 21, 21, ink, 5, 5); dot(g, 22, 21, white, 3, 4);
        dot(g, 1, 9, '#9abed5', 2); dot(g, 2, 5, '#9abed5', 2); dot(g, 5, 3, ice, 2);
      }
    }
  }, [mood]);
  return <canvas ref={ref} className="tutorial-astronaut" width={32} height={32} data-mood={mood} aria-hidden />;
}
