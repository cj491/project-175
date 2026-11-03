import {
  Beef,
  Calendar,
  Camera,
  Crown,
  Droplet,
  Dumbbell,
  Flame,
  Footprints,
  Medal,
  Scale,
  Target,
  Trophy,
  Utensils,
  Zap,
  Coffee,
  Sandwich,
  UtensilsCrossed,
  HeartPulse,
  type LucideIcon,
} from "lucide-react";
import type { AchievementIcon } from "@/lib/gamification/achievements";
import type { MissionIcon } from "@/lib/gamification/missions";

export const ACHIEVEMENT_ICONS: Record<AchievementIcon, LucideIcon> = {
  dumbbell: Dumbbell,
  flame: Flame,
  calendar: Calendar,
  zap: Zap,
  trophy: Trophy,
  footprints: Footprints,
  scale: Scale,
  target: Target,
  crown: Crown,
  utensils: Utensils,
  camera: Camera,
  droplet: Droplet,
  beef: Beef,
  medal: Medal,
};

export const MISSION_ICONS: Record<MissionIcon, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sandwich,
  dinner: UtensilsCrossed,
  protein: Beef,
  calories: Flame,
  workout: Dumbbell,
  walk: Footprints,
  steps: Footprints,
  water: Droplet,
  checkin: HeartPulse,
  weight: Scale,
};

export const TIER_STYLE = {
  bronze: { ring: "#d39b6a", bg: "from-[#d39b6a]/25 to-[#d39b6a]/5", text: "text-[#e8b88f]" },
  silver: { ring: "#c9d1dc", bg: "from-[#c9d1dc]/25 to-[#c9d1dc]/5", text: "text-[#dfe5ee]" },
  gold: { ring: "#ffd84a", bg: "from-[#ffd84a]/25 to-[#ffd84a]/5", text: "text-xp" },
};
