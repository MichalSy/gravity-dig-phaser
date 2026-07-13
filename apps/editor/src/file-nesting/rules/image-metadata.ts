import { pairByAppendedSuffix, pairByStem } from '../rule-builders';

const imageSuffixes = ['.png', '.webp', '.jpg', '.jpeg', '.gif'] as const;

export const exactImageMetadataRule = pairByAppendedSuffix({
  id: 'exact-image-metadata',
  label: 'Image Metadata',
  priority: 90,
  order: 200,
  primarySuffixes: imageSuffixes,
  appendedSuffix: '.json',
});

export const imageStemMetadataRule = pairByStem({
  id: 'image-stem-metadata',
  label: 'Image Metadata',
  priority: 80,
  order: 200,
  primarySuffixes: imageSuffixes,
  childSuffixes: ['.json'],
});
