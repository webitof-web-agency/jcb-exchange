export type InteractiveRegion = {
  contains: (target: never) => boolean;
};

export const isOutsideInteractiveRegion = (region: InteractiveRegion | null, target: unknown) =>
  !region || !region.contains(target as never);

export type DropdownDismissEventType = 'pointerdown' | 'click' | 'touchstart';

export const shouldDismissDropdown = (
  region: InteractiveRegion | null,
  target: unknown,
  eventType: string,
) =>
  ['pointerdown', 'click', 'touchstart'].includes(eventType)
  && isOutsideInteractiveRegion(region, target);
