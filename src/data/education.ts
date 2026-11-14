import type { FacilityId } from '../game/types';

export interface EduCard {
  title: string;
  text: string;
}

/** Short science briefings, one per shift. Kept qualitative — no unverified numbers. */
export const EDU_BY_SHIFT: EduCard[] = [
  {
    title: 'Why the South Pole?',
    text: 'Near the lunar South Pole the Sun stays close to the horizon. Some high ridges receive sunlight for long periods, while deep crater floors can stay in permanent shadow — and may hold water ice.',
  },
  {
    title: 'Sunlight on a polar base',
    text: 'Because the Sun is so low, solar panels near the pole are mounted vertically and the height of the terrain matters: a small hill or crater rim can block the light entirely.',
  },
  {
    title: 'Space weather forecasts',
    text: 'The Sun can release bursts of energetic particles. Forecasters watch the Sun so astronauts get advance warning and time to reach a shielded area.',
  },
  {
    title: 'Shelter from radiation',
    text: 'The Moon has no global magnetic field and no thick atmosphere. Piling lunar soil (regolith) or water around a shelter adds mass that absorbs radiation.',
  },
  {
    title: 'Storing energy',
    text: 'When sunlight drops, the base runs on batteries. Engineers size storage so essential life support never stops during the darkest periods.',
  },
  {
    title: 'Closing the loop',
    text: 'On the International Space Station, water is recycled and split by electrolysis to make oxygen. Recycling reduces the supplies that must be launched from Earth.',
  },
  {
    title: 'Growing food in space',
    text: 'Astronauts have grown lettuce and other plants on the ISS under LED lights. Plants provide fresh food, but lights and pumps need a steady supply of power.',
  },
  {
    title: 'Why we go: science',
    text: 'Studying polar ice and lunar rocks helps us understand the history of the Moon and Earth, and could one day provide water and oxygen for explorers.',
  },
];

export const FACILITY_EDU: Record<FacilityId, EduCard> = {
  oxygen: {
    title: 'Oxygen Recycling',
    text: 'Three astronauts breathe oxygen every hour, so life support never pauses. Recycling oxygen from water and carbon dioxide costs energy, but saves heavy supplies.',
  },
  greenhouse: {
    title: 'Hydroponic Greenhouse',
    text: 'Hydroponics grows plants in nutrient-rich water instead of soil. Plants need light, water, and stable temperatures — all powered by the base.',
  },
  shelter: {
    title: 'Emergency Radiation Shelter',
    text: 'The shielding itself (thick regolith walls) needs no power, but air, heat, and lighting inside do. Turn it on before an alert so the crew is protected.',
  },
  lab: {
    title: 'Science Laboratory',
    text: 'Research is the reason for the mission, but instruments compete with survival systems for the same limited power. Plan experiments for sunlit shifts.',
  },
};
