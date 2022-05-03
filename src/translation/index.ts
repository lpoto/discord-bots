import { musicBotEn } from '../music-bot/utils/translation';
import { utilityBotEn } from '../utility-bot/utils/translation';
import en from './common.en.json';

export { musicBotEn } from '../music-bot/utils/translation';
export { utilityBotEn } from '../utility-bot/utils/translation';

export { Translator } from './translator';
export const commonEn: typeof en = en;

export const text = {
    music: musicBotEn,
    utility: utilityBotEn,
    common: commonEn,
};
export type Language = typeof text;
type Path<T> = PathTree<T>[keyof PathTree<T>];
type PathTree<T> = {
    [P in keyof T]-?: T[P] extends object ? [P] | [P, ...Path<T[P]>] : [P];
};
export type LanguageKeyPath = Path<Language>;
