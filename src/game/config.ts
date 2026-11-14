import { missionFor } from './difficulty';
import type { MissionConfig } from './types';

/**
 * Mission rules (team GDD, src/data/mission.json) + NASA-derived site data (src/data/site.json), kept in
 * separate files so their origins stay distinct. This is the original rule set (= Hard); the UI uses
 * missionFor(state.difficulty) from ./difficulty.
 */
export const MISSION: MissionConfig = missionFor('hard');
