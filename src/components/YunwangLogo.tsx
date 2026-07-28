import React from "react";

interface YunwangLogoProps {
  className?: string;
  iconOnly?: boolean;
}

export const YunwangLogo: React.FC<YunwangLogoProps> = ({
  className = "w-8 h-8",
  iconOnly = true,
}) => {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="yunwang-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D5FF" />
            <stop offset="50%" stopColor="#0084FF" />
            <stop offset="100%" stopColor="#004AD7" />
          </linearGradient>

          <linearGradient id="yunwang-bright-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#0084FF" />
          </linearGradient>
        </defs>

        {/* Top-center Inner Arc Accent */}
        <path
          d="M 50 33 C 54 28, 62 28, 66 33"
          stroke="url(#yunwang-bright-grad)"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* Cloud Main Outline */}
        <path
          d="M 28 72 
             C 15 72, 8 60, 8 47 
             C 8 34, 18 25, 30 24 
             C 33 12, 47 6, 61 9 
             C 74 12, 84 22, 85 36 
             C 93 40, 96 50, 93 61 
             C 89 71, 79 72, 70 72 
             L 53 72"
          stroke="url(#yunwang-brand-grad)"
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Network Mesh Lines */}
        <g stroke="url(#yunwang-brand-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
          <line x1="41" y1="52" x2="52" y2="61" />
          <line x1="41" y1="52" x2="55" y2="44" />
          <line x1="52" y1="61" x2="62" y2="52" />
          <line x1="52" y1="61" x2="69" y2="61" />
          <line x1="55" y1="44" x2="62" y2="52" />
          <line x1="55" y1="44" x2="71" y2="38" />
          <line x1="62" y1="52" x2="71" y2="38" />
          <line x1="62" y1="52" x2="80" y2="49" />
          <line x1="62" y1="52" x2="69" y2="61" />
          <line x1="71" y1="38" x2="80" y2="49" />
          <line x1="69" y1="61" x2="80" y2="49" />
        </g>

        {/* Network Node Circles */}
        <circle cx="41" cy="52" r="4.5" fill="url(#yunwang-brand-grad)" />
        <circle cx="52" cy="61" r="4.5" fill="url(#yunwang-brand-grad)" />
        <circle cx="55" cy="44" r="3.8" fill="url(#yunwang-brand-grad)" />
        <circle cx="62" cy="52" r="5" fill="#00E5FF" />
        <circle cx="71" cy="38" r="4" fill="url(#yunwang-brand-grad)" />
        <circle cx="69" cy="61" r="4" fill="url(#yunwang-brand-grad)" />
        <circle cx="80" cy="49" r="4.5" fill="url(#yunwang-brand-grad)" />
      </svg>

      {!iconOnly && (
        <span className="font-fustat font-extrabold text-xl sm:text-2xl tracking-tight text-slate-900 dark:text-white">
          云往<span className="text-[#0084FF]">AI</span>
        </span>
      )}
    </div>
  );
};
