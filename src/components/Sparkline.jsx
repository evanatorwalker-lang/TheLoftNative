import { useState } from 'react';
import { View } from 'react-native';

// Tiny inline mood-trend line. No external deps — uses absolute-positioned
// thin Views to draw line segments between data points.
// Props:
//   values  number[]  mood values (1–10), oldest first
//   height  number    default 28
//   color   string    line/dot color
export default function Sparkline({ values = [], height = 28, color = '#888' }) {
  const [width, setWidth] = useState(0);

  if (!values || values.length < 2 || width === 0) {
    return (
      <View
        style={{ height, width: '100%' }}
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
      />
    );
  }

  const PAD = 2;
  const max = 10;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;

  const pts = values.map((v, i) => ({
    x: PAD + (i / (values.length - 1)) * innerW,
    y: PAD + (1 - Math.min(Math.max(v, 1), max) / max) * innerH,
  }));

  const segments = pts.slice(0, -1).map((a, i) => {
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { x: a.x, y: a.y, len, angle };
  });

  const last = pts[pts.length - 1];

  return (
    <View
      style={{ height, width: '100%', position: 'relative' }}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
    >
      {segments.map((seg, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: seg.x,
            top: seg.y - 0.75,
            width: seg.len,
            height: 1.5,
            backgroundColor: color,
            transform: [{ rotate: `${seg.angle}deg` }],
            transformOrigin: 'left center',
          }}
        />
      ))}
      {/* dot at latest value */}
      <View
        style={{
          position: 'absolute',
          left: last.x - 3,
          top: last.y - 3,
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
