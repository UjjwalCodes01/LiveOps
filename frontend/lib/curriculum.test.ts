import { describe, expect, it } from 'vitest';
import {
  CONCEPT_PHASES,
  getCurriculum,
  getLesson,
  isPhaseComplete,
} from './curriculum';

describe('curriculum', () => {
  it('returns the load-balancing curriculum and falls back for unknown concepts', () => {
    expect(getCurriculum('load_balancing').concept).toBe('load_balancing');
    // Unknown concept falls back rather than throwing.
    expect(getCurriculum('does_not_exist').concept).toBe('load_balancing');
  });

  it('has a full lesson for every phase', () => {
    for (const phase of ['build', 'explore', 'break', 'diagnose', 'fix'] as const) {
      const lesson = getLesson('load_balancing', phase);
      expect(lesson.phase).toBe(phase);
      expect(lesson.concept.length).toBeGreaterThan(0);
      expect(lesson.takeaway.length).toBeGreaterThan(0);
    }
  });

  describe('isPhaseComplete', () => {
    it('locks every phase while the session is only created', () => {
      for (const phase of CONCEPT_PHASES) {
        expect(isPhaseComplete(phase, 'created')).toBe(false);
      }
    });

    it('unlocks build once the session is ready, but not later phases', () => {
      expect(isPhaseComplete('build', 'ready')).toBe(true);
      expect(isPhaseComplete('break', 'ready')).toBe(false);
      expect(isPhaseComplete('fix', 'ready')).toBe(false);
    });

    it('unlocks everything once completed', () => {
      for (const phase of CONCEPT_PHASES) {
        expect(isPhaseComplete(phase, 'completed')).toBe(true);
      }
    });

    it('unlocks diagnose only from diagnosing onward', () => {
      expect(isPhaseComplete('diagnose', 'broken')).toBe(false);
      expect(isPhaseComplete('diagnose', 'diagnosing')).toBe(true);
      expect(isPhaseComplete('diagnose', 'fixing')).toBe(true);
    });
  });
});
