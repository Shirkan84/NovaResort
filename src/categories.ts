export type WellnessCategory = {
  slug: string
  name: string
  icon: string
  color: string
  description: string
}

export const CATEGORIES: WellnessCategory[] = [
  { slug: 'meditation', name: 'Meditation', icon: '🧘', color: '#557567', description: 'Guided and silent meditation practices' },
  { slug: 'mindfulness', name: 'Mindfulness', icon: '🌿', color: '#6b8f71', description: 'Present-moment awareness techniques' },
  { slug: 'stress-management', name: 'Stress Management', icon: '💆', color: '#8b6f47', description: 'Tools to manage and reduce stress' },
  { slug: 'self-growth', name: 'Self Growth', icon: '🌱', color: '#5a7b87', description: 'Personal development and transformation' },
  { slug: 'breathwork', name: 'Breathwork', icon: '🌬️', color: '#7c8f6e', description: 'Breathing techniques for healing' },
  { slug: 'relationships', name: 'Relationships', icon: '💛', color: '#a67a45', description: 'Building healthy connections' },
  { slug: 'sleep', name: 'Sleep', icon: '🌙', color: '#5b6e8a', description: 'Better sleep and rest practices' },
  { slug: 'yoga', name: 'Yoga', icon: '🧘‍♀️', color: '#6a8a7a', description: 'Movement and body practices' },
  { slug: 'emotional-healing', name: 'Emotional Healing', icon: '💗', color: '#b07070', description: 'Processing and healing emotions' },
  { slug: 'nutrition', name: 'Nutrition', icon: '🥗', color: '#6a9a5a', description: 'Nourishing body and mind' },
  { slug: 'spiritual-growth', name: 'Spiritual Growth', icon: '✨', color: '#8a7aaa', description: 'Spiritual exploration and awakening' },
  { slug: 'wellness-education', name: 'Wellness Education', icon: '📚', color: '#557567', description: 'Learning about health and wellbeing' },
]

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.name.toLowerCase(), c]))

export function getCategoryByName(name: string): WellnessCategory | undefined {
  return CATEGORIES.find(c => c.name.toLowerCase() === name.toLowerCase())
}

export function getCategoryBySlug(slug: string): WellnessCategory | undefined {
  return CATEGORIES.find(c => c.slug === slug)
}

export function slugToCategoryName(slug: string): string {
  return getCategoryBySlug(slug)?.name || slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
