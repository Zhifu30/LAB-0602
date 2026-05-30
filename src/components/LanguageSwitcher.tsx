import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/hooks/useLanguage';

const LanguageSwitcher = () => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
      className="flex items-center gap-2"
    >
      <Languages className="h-4 w-4" />
      {language === 'zh' ? 'EN' : '中文'}
    </Button>
  );
};

export default LanguageSwitcher;