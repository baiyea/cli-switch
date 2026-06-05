import { I18nProvider } from '../i18n/I18nProvider';
import { HomePage } from '../pages/home/HomePage';

export function AppShell() {
  return (
    <I18nProvider initialLocale="zh-CN">
      <HomePage />
    </I18nProvider>
  );
}
