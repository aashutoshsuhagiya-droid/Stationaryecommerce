import type { Category } from "./types";

export const MAX_MENU_ITEMS = 8;

export function truncateMenuItems(items: Category[], limit = MAX_MENU_ITEMS): { visible: Category[]; moreCount: number } {
  return {
    visible: items.slice(0, limit),
    moreCount: Math.max(0, items.length - limit),
  };
}
