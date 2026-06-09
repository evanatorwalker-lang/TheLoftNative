export const getLabelColor = (label) => {
  if (!label) return 'normal';
  const lower = label.toLowerCase();
  if (lower.includes('suicid') || lower.includes('crisis') || lower.includes('danger')) return 'critical';
  if (lower.includes('high') || lower.includes('severe') || lower.includes('urgent')) return 'high';
  if (lower.includes('moderate') || lower.includes('watch')) return 'medium';
  return 'normal';
};

export const ACTIVITY_LABELS = {
  exercise: 'Exercise',
  socializing: 'Socializing',
  meditation: 'Meditation',
  reading: 'Reading',
  nature: 'Nature',
  creative: 'Creative',
  cooking: 'Cooking',
  music: 'Music',
  gaming: 'Gaming',
  work: 'Work',
  selfCare: 'Self-care',
  family: 'Family',
  sports: 'Sports',
  tvMovies: 'TV / Movies',
  therapy: 'Therapy',
  volunteering: 'Volunteering',
  pets: 'Pets',
  studying: 'Studying',
  school: 'School',
  walk: 'Walk',
  shopping: 'Shopping',
  journaling: 'Journaling',
  cleaning: 'Cleaning',
  travel: 'Travel',
  swimming: 'Swimming',
  spirituality: 'Spirituality',
  other: 'Other',
};

export const formatActivity = (id) =>
  ACTIVITY_LABELS[id] ?? (id ? id.charAt(0).toUpperCase() + id.slice(1) : '');
