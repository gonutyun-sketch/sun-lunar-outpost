import raw from '../data/mission.json';
import site from '../data/site.json';
import type { MissionConfig } from './types';

/** Mission rules (team GDD) + NASA-derived site data, kept in separate files so their origins stay distinct. */
export const MISSION: MissionConfig = { ...(raw as Omit<MissionConfig, 'site'>), site } as MissionConfig;
