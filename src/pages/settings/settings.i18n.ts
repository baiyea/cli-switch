import { registerMessages } from '../../i18n/renderer';
import { aboutMessages } from './about/locales';
import { appearanceMessages } from './appearance/locales';
import { archiveMessages } from './archive/locales';
import { imChannelMessages } from './im-channel/locales';
import { providersMessages } from './providers/locales';
import { tokenUsageMessages } from './token-usage/locales';

export function registerSettingsI18n() {
  registerMessages('settings.appearance', appearanceMessages);
  registerMessages('settings.providers', providersMessages);
  registerMessages('settings.archive', archiveMessages);
  registerMessages('settings.about', aboutMessages);
  registerMessages('settings.tokenUsage', tokenUsageMessages);
  registerMessages('settings.imChannel', imChannelMessages);
}
