import { Image } from 'react-native';

const MOOD_IMAGES = [
  require('../../assets/faces/mood-1.png'), // 0-2 very sad
  require('../../assets/faces/mood-2.png'), // 3-4 sad
  require('../../assets/faces/mood-3.png'), // 5-6 neutral
  require('../../assets/faces/mood-4.png'), // 7-8 happy
  require('../../assets/faces/mood-5.png'), // 9-10 very happy
];

function getMoodImage(mood) {
  if (mood >= 9) return MOOD_IMAGES[4];
  if (mood >= 7) return MOOD_IMAGES[3];
  if (mood >= 5) return MOOD_IMAGES[2];
  if (mood >= 3) return MOOD_IMAGES[1];
  return MOOD_IMAGES[0];
}

export function MoodFace({ mood = 5, size = 40 }) {
  return (
    <Image
      source={getMoodImage(mood)}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
