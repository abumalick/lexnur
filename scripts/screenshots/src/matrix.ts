export type Device = 'iphone69' | 'ipad13' | 'phone' | 'seven' | 'ten';
export type Lang = 'en' | 'ar';
export type Scene = 'onboarding' | 'search-en' | 'search-ar' | 'entry-ar' | 'entry-en' | 'library';
export type Engine = 'webkit' | 'chromium';

export interface Shot {
  device: Device;
  lang: Lang;
  scene: Scene;
  index: number; // 1-based position in the store listing
  engine: Engine;
  viewport: { width: number; height: number };
  scale: number;
  platform: 'ios' | 'android';
}

export const SIZES: Record<Device, [number, number]> = {
  iphone69: [1320, 2868],
  ipad13: [2064, 2752],
  phone: [1080, 1920],
  seven: [1200, 1920],
  ten: [1600, 2560],
};

const DEVICES: Record<Device, { viewport: [number, number]; scale: number; platform: 'ios' | 'android' }> = {
  iphone69: { viewport: [440, 956], scale: 3, platform: 'ios' },
  ipad13: { viewport: [1032, 1376], scale: 2, platform: 'ios' },
  phone: { viewport: [360, 640], scale: 3, platform: 'android' },
  seven: { viewport: [600, 960], scale: 2, platform: 'android' },
  ten: { viewport: [800, 1280], scale: 2, platform: 'android' },
};

const ORDER: Record<Lang, Scene[]> = {
  en: ['search-en', 'entry-en', 'entry-ar', 'onboarding', 'library'],
  ar: ['search-ar', 'entry-ar', 'entry-en', 'onboarding', 'library'],
};

export function matrix(platform: 'ios' | 'android' | 'all' = 'all'): Shot[] {
  const shots: Shot[] = [];
  for (const device of Object.keys(DEVICES) as Device[]) {
    const d = DEVICES[device];
    if (platform !== 'all' && d.platform !== platform) continue;
    for (const lang of ['en', 'ar'] as Lang[]) {
      ORDER[lang].forEach((scene, i) => {
        shots.push({
          device,
          lang,
          scene,
          index: i + 1,
          engine: d.platform === 'ios' ? 'webkit' : 'chromium',
          viewport: { width: d.viewport[0], height: d.viewport[1] },
          scale: d.scale,
          platform: d.platform,
        });
      });
    }
  }
  return shots;
}

export function sceneUrl(shot: Shot, base: string): string {
  const chrome = shot.device === 'ipad13' ? 'none' : shot.platform;
  const q = new URLSearchParams({ scene: shot.scene, lang: shot.lang, theme: 'light', chrome });
  return `${base}/?${q.toString()}`;
}

const IOS_LOCALE: Record<Lang, string> = { en: 'en-US', ar: 'ar-SA' };
const PLAY_LOCALE: Record<Lang, string> = { en: 'en-US', ar: 'ar' };
const PLAY_FOLDER: Record<'phone' | 'seven' | 'ten', string> = {
  phone: 'phoneScreenshots',
  seven: 'sevenInchScreenshots',
  ten: 'tenInchScreenshots',
};

export function outputPath(shot: Shot): string {
  if (shot.platform === 'ios') {
    return `fastlane/screenshots/ios/${IOS_LOCALE[shot.lang]}/${shot.index}_${shot.scene}_${shot.device}.png`;
  }
  const folder = PLAY_FOLDER[shot.device as 'phone' | 'seven' | 'ten'];
  return `fastlane/metadata/android/${PLAY_LOCALE[shot.lang]}/images/${folder}/${shot.index}_${shot.scene}.png`;
}
