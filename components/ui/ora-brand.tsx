'use client';

import Link from 'next/link';

/**
 * ORALogo Props
 */
interface ORALogoProps {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  className?: string;
  href?: string;
}

/**
 * ORALogo Component - EventOS branded version
 */
export function ORALogo({
  size = 'md',
  showTagline = true,
  className = '',
  href,
}: ORALogoProps) {
  const sizeConfig = {
    sm: { logo: 'text-lg', tagline: 'text-[10px]' },
    md: { logo: 'text-xl', tagline: 'text-xs' },
    lg: { logo: 'text-3xl', tagline: 'text-sm' },
  };

  const config = sizeConfig[size];

  const content = (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 bg-ora-gold" />
        <h1 className={`${config.logo} font-light tracking-[0.15em] text-ora-charcoal`}>
          EventOS
        </h1>
      </div>
      {showTagline && (
        <p className={`${config.tagline} text-ora-muted mt-0.5 uppercase tracking-[0.15em]`}>
          Event Management
        </p>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:opacity-80 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

/**
 * ORADivider Component
 */
interface ORADividerProps {
  className?: string;
}

export function ORADivider({ className = '' }: ORADividerProps) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-ora-sand to-transparent" />
      <div className="w-1.5 h-1.5 rounded-full bg-ora-gold" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-ora-sand to-transparent" />
    </div>
  );
}

/**
 * ORAAccentLine Component
 */
interface ORAAccentLineProps {
  width?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ORAAccentLine({ width = 'md', className = '' }: ORAAccentLineProps) {
  const widthClasses = { sm: 'w-8', md: 'w-12', lg: 'w-16' };
  return <div className={`h-0.5 bg-ora-gold ${widthClasses[width]} ${className}`} />;
}

/**
 * ORAPageHeader Component
 */
interface ORAPageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ORAPageHeader({ title, subtitle, action, className = '' }: ORAPageHeaderProps) {
  return (
    <div className={`mb-8 ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <ORAAccentLine className="mb-4" />
          <h1 className="text-2xl font-light tracking-wide text-ora-charcoal">{title}</h1>
          {subtitle && <p className="text-ora-muted mt-2">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

/**
 * ORAEmptyState Component
 */
interface ORAEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function ORAEmptyState({ icon, title, description, action, className = '' }: ORAEmptyStateProps) {
  return (
    <div className={`text-center py-12 px-6 ${className}`}>
      {icon && (
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-ora-sand/50 flex items-center justify-center text-ora-muted">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-light text-ora-charcoal mb-2">{title}</h3>
      {description && <p className="text-sm text-ora-muted max-w-sm mx-auto mb-6">{description}</p>}
      {action}
    </div>
  );
}

/**
 * ORAFooter Component
 */
interface ORAFooterProps {
  className?: string;
}

export function ORAFooter({ className = '' }: ORAFooterProps) {
  const currentYear = new Date().getFullYear();
  return (
    <footer className={`py-6 border-t border-ora-sand ${className}`}>
      <div className="flex items-center justify-between text-xs text-ora-muted">
        <p>© {currentYear} EventOS. All rights reserved.</p>
        <p className="uppercase tracking-widest">ORA · UAE</p>
      </div>
    </footer>
  );
}

/**
 * ORASectionHeader Component - For landing page sections
 */
interface ORASectionHeaderProps {
  label?: string;
  title: string;
  description?: string;
  className?: string;
}

export function ORASectionHeader({ label, title, description, className = '' }: ORASectionHeaderProps) {
  return (
    <div className={`text-center mb-16 ${className}`}>
      {label && (
        <p className="text-ora-gold uppercase tracking-[0.2em] text-xs mb-4">{label}</p>
      )}
      <h2 className="text-4xl font-light tracking-wide text-ora-charcoal mb-4">{title}</h2>
      {description && (
        <p className="text-ora-muted max-w-lg mx-auto">{description}</p>
      )}
    </div>
  );
}

export default ORALogo;
