export type Locale = 'zh-CN' | 'en-US';

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

export type LocaleMessages = Record<string, string>;

export type MessageBundle = Record<Locale, LocaleMessages>;
