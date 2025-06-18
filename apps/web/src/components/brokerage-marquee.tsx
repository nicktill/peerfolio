"use client";

import { Marquee } from "./magicui/marquee";

const brokerages = [
  {
    name: "Fidelity",
    logo: "https://logo.clearbit.com/fidelity.com",
  },
  {
    name: "Charles Schwab", 
    logo: "https://logo.clearbit.com/schwab.com",
  },
  {
    name: "TD Ameritrade",
    logo: "https://logo.clearbit.com/tdameritrade.com",
  },
  {
    name: "E*TRADE",
    logo: "https://logo.clearbit.com/etrade.com",
  },
  {
    name: "Robinhood",
    logo: "https://logo.clearbit.com/robinhood.com",
  },
  {
    name: "Vanguard",
    logo: "https://logo.clearbit.com/vanguard.com",
  },
  {
    name: "Merrill Lynch",
    logo: "https://logo.clearbit.com/ml.com",
  },

    {
        name: "Ally Invest",
        logo: "https://logo.clearbit.com/ally.com",
    },
    {
        name: "Webull",
        logo: "https://logo.clearbit.com/webull.com",
    },
    {
        name: "SoFi Invest",
        logo: "https://logo.clearbit.com/sofi.com",
    },
    {
        name: "Acorns",
        logo: "https://logo.clearbit.com/acorns.com",
    },

];

function ReviewCard({ img, name }: { img: string; name: string }) {
  return (
    <figure className="relative w-36 cursor-pointer overflow-hidden rounded-lg border p-3 border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all duration-300 shadow-sm hover:shadow-md mx-2">
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-gray-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
          <img 
            className="w-6 h-6 object-contain" 
            alt={`${name} logo`} 
            src={img}
            loading="eager"
            decoding="async"
            onError={(e) => {
              // Fallback to a generic icon if image fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          />
          <div className="hidden w-4 h-4 rounded bg-gray-300 flex items-center justify-center text-xs text-gray-600 font-bold">
            {name.charAt(0)}
          </div>
        </div>
        <figcaption className="text-xs font-medium text-gray-700 text-center truncate w-full">
          {name}
        </figcaption>
      </div>
    </figure>
  );
}

export function BrokerageMarquee() {
  return (
    <section className="relative py-16 bg-white overflow-hidden z-10">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Connect Your Favorite Platforms
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Securely link your investment accounts from any of these trusted brokerages
          </p>
        </div>
        
        <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
          <Marquee 
            pauseOnHover 
            className="[--duration:20s]"
            style={{
              '--duration': '20s',
              '--gap': '1rem'
            } as React.CSSProperties}
          >
            {brokerages.map((brokerage) => (
              <ReviewCard key={brokerage.name} img={brokerage.logo} name={brokerage.name} />
            ))}
          </Marquee>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-white dark:from-background"></div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white dark:from-background"></div>
        </div>
      </div>
    </section>
  );
}
