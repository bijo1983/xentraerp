import Image from 'next/image';
import { cn } from '@/lib/utils';

interface XentraLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: { icon: 28, text: 'text-lg' },
  md: { icon: 36, text: 'text-xl' },
  lg: { icon: 48, text: 'text-2xl' },
};

export function XentraLogo({ size = 'md', showText = true, className }: XentraLogoProps) {
  const s = sizes[size];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Image src="/logo.svg" alt="XentraERP" width={s.icon} height={s.icon} priority />
      {showText && (
        <span className={cn('font-bold tracking-tight', s.text)}>
          <span className="text-primary">Xentra</span>
          <span>ERP</span>
        </span>
      )}
    </div>
  );
}
