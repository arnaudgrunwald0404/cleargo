import { HobermanSphereProps } from './HobermanSphere';
import { ViewAngle } from './hobermanUtils';

export const hobermanLogoPreset: Partial<HobermanSphereProps> = {
  size: 24,
  openness: 0.7,
  color: 'white',
  strokeWidth: 2,
  opacity: 1,
  partialView: 'full',
};

export const hobermanLargeLogoPreset: Partial<HobermanSphereProps> = {
  size: 96,
  openness: 0.75,
  color: '#2C2C2C',
  strokeWidth: 2.5,
  opacity: 1,
  partialView: 'full',
};

export const hobermanCoverBackgroundPreset: Partial<HobermanSphereProps> = {
  size: 1000,
  openness: 0.6,
  color: '#FFFFFF',
  strokeWidth: 2,
  opacity: 0.25,
  viewAngle: { x: 0, y: Math.PI / 4, z: 0 },
  partialView: 'right',
  use2DPattern: true,
};

export const hobermanBackgroundDecorationPreset: Partial<HobermanSphereProps> = {
  size: 400,
  openness: 0.4,
  color: '#FF7A52',
  strokeWidth: 1,
  opacity: 0.1,
  partialView: 'full',
};

export const hobermanMaskPreset: Partial<HobermanSphereProps> = {
  size: 300,
  openness: 0.6,
  color: '#000000',
  strokeWidth: 2,
  opacity: 1,
  partialView: 'full',
  clipPath: true,
};

export const hobermanCornerAccentPreset: Partial<HobermanSphereProps> = {
  size: 150,
  openness: 0.5,
  color: '#FF7A52',
  strokeWidth: 1.5,
  opacity: 0.3,
  partialView: 'corner',
};

export const hobermanClosedPreset: Partial<HobermanSphereProps> = {
  size: 200,
  openness: 0.1,
  color: '#000000',
  strokeWidth: 1.5,
  opacity: 1,
  viewAngle: { x: 0, y: 0, z: 0 },
  partialView: 'full',
};

export const hobermanSemiClosedPreset: Partial<HobermanSphereProps> = {
  size: 200,
  openness: 0.3,
  color: '#000000',
  strokeWidth: 1.5,
  opacity: 1,
  viewAngle: { x: 0, y: 0, z: 0 },
  partialView: 'full',
};

export const hobermanDefaultPreset: Partial<HobermanSphereProps> = {
  ...hobermanSemiClosedPreset,
};

export const hobermanSemiOpenPreset: Partial<HobermanSphereProps> = {
  size: 200,
  openness: 0.6,
  color: '#000000',
  strokeWidth: 1.5,
  opacity: 1,
  viewAngle: { x: 0, y: 0, z: 0 },
  partialView: 'full',
};

export const hobermanOpenPreset: Partial<HobermanSphereProps> = {
  size: 200,
  openness: 0.9,
  color: '#000000',
  strokeWidth: 1.5,
  opacity: 1,
  viewAngle: { x: 0, y: 0, z: 0 },
  partialView: 'full',
};

export const hobermanClearCoLogoPreset: Partial<HobermanSphereProps> = {
  size: 48,
  openness: 0.3,
  color: '#000000',
  strokeWidth: 2,
  opacity: 1,
  viewAngle: { x: 0, y: 0, z: 0 },
  partialView: 'full',
};

export function createHobermanPreset(
  basePreset: Partial<HobermanSphereProps>,
  overrides?: Partial<HobermanSphereProps>
): Partial<HobermanSphereProps> {
  return {
    ...basePreset,
    ...overrides,
  };
}
