import { describe, expect, it } from 'vitest';
import { matrix, outputPath, SIZES, sceneUrl } from './matrix';

describe('screenshot matrix', () => {
  const shots = matrix();

  it('has 5 scenes x 2 languages x 5 devices', () => {
    expect(shots).toHaveLength(50);
  });

  it('orders scenes per UI language', () => {
    const order = (lang: 'en' | 'ar') =>
      shots.filter((s) => s.lang === lang && s.device === 'iphone69').map((s) => s.scene);
    expect(order('en')).toEqual(['search-en', 'entry-en', 'entry-ar', 'onboarding', 'library']);
    expect(order('ar')).toEqual(['search-ar', 'entry-ar', 'entry-en', 'onboarding', 'library']);
  });

  it('renders every device at its exact store size', () => {
    expect(SIZES).toEqual({
      iphone69: [1320, 2868],
      ipad13: [2064, 2752],
      phone: [1080, 1920],
      seven: [1200, 1920],
      ten: [1600, 2560],
    });
    for (const s of shots) {
      expect([s.viewport.width * s.scale, s.viewport.height * s.scale]).toEqual(SIZES[s.device]);
    }
  });

  it('keeps Play phone shots within 2:1', () => {
    const [w, h] = SIZES.phone;
    expect(h / w).toBeLessThanOrEqual(2);
  });

  it('uses WebKit for Apple devices, Chromium otherwise, and per-device fake chrome (none on iPad)', () => {
    const chrome = { iphone69: 'ios', ipad13: 'none', phone: 'android', seven: 'android', ten: 'android' };
    for (const s of shots) {
      const apple = s.device === 'iphone69' || s.device === 'ipad13';
      expect(s.engine).toBe(apple ? 'webkit' : 'chromium');
      expect(sceneUrl(s, 'http://127.0.0.1:4173')).toContain(`chrome=${chrome[s.device]}`);
    }
  });

  it('writes fastlane layouts', () => {
    const ar1 = shots.find((s) => s.lang === 'ar' && s.device === 'iphone69' && s.scene === 'search-ar')!;
    expect(outputPath(ar1)).toBe('fastlane/screenshots/ios/ar-SA/1_search-ar_iphone69.png');
    const en3 = shots.find((s) => s.lang === 'en' && s.device === 'seven' && s.scene === 'entry-ar')!;
    expect(outputPath(en3)).toBe('fastlane/metadata/android/en-US/images/sevenInchScreenshots/3_entry-ar.png');
  });

  it('builds the C8 scene URL', () => {
    const s = shots.find((x) => x.lang === 'ar' && x.device === 'phone' && x.scene === 'entry-ar')!;
    expect(sceneUrl(s, 'http://127.0.0.1:4173')).toBe(
      'http://127.0.0.1:4173/?scene=entry-ar&lang=ar&theme=light&chrome=android',
    );
  });
});
