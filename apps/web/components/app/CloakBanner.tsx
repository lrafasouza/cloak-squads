"use client";

import { cn } from "@/lib/utils";
import { ExternalLink, Shield } from "lucide-react";
import Link from "next/link";

function CloakLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1738.627 473.465"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-5 w-auto", className)}
      aria-label="Cloak"
    >
      <defs>
        <style>{`
          .cloak-logo-1 { fill: #ede6ff; }
          .cloak-logo-2 { fill: #3b21af; }
          .cloak-logo-3 { fill: #8b5aef; }
        `}</style>
      </defs>
      <path
        className="cloak-logo-1"
        d="M58.418,240.752c0,17.681,3.047,33.534,9.158,47.55,6.104,14.023,14.52,25.912,25.247,35.664,10.72,9.756,23.516,17.143,38.369,22.173,14.849,5.029,31.018,7.545,48.514,7.545,24.753,0,44.802-3.501,60.148-10.515,15.346-7.008,28.297-16.462,38.863-28.347l36.635,39.319c-5.943,6.709-13.045,13.189-21.289,19.431-8.254,6.252-17.822,11.738-28.714,16.462-10.891,4.727-23.268,8.459-37.129,11.201-13.861,2.745-29.379,4.115-46.536,4.115-26.731,0-51.236-3.816-73.516-11.429-22.277-7.616-41.423-18.591-57.424-32.92-16.015-14.325-28.468-31.62-37.378-51.897C4.455,288.84,0,266.056,0,240.752s4.455-48.081,13.367-68.356c8.909-20.268,21.363-37.562,37.378-51.894,16.001-14.322,35.147-25.297,57.424-32.92,22.28-7.616,46.784-11.429,73.516-11.429,17.157,0,32.674,1.371,46.536,4.115,13.861,2.741,26.238,6.477,37.129,11.201,10.891,4.73,20.459,10.139,28.714,16.233,8.244,6.101,15.346,12.652,21.289,19.66l-36.635,39.319c-10.566-11.886-23.516-21.41-38.863-28.576-15.346-7.159-35.396-10.744-60.148-10.744-17.496,0-33.665,2.513-48.514,7.542-14.852,5.029-27.649,12.423-38.369,22.176-10.727,9.759-19.142,21.645-25.247,35.664-6.111,14.023-9.158,30.024-9.158,48.007Z"
      />
      <path
        className="cloak-logo-1"
        d="M540.637,395.482l3.447-20.577,3.875-23.04h-130.635V80.724h-58.412v320.048h190.953l-9.229-5.289Z"
      />
      <path
        className="cloak-logo-1"
        d="M1208.438,80.724h-67.834l-92.864,173.052,15.438,91.945,19.014-35.481h184.166l48.52,90.531h65.328l-171.768-320.048ZM1109.429,259.965l64.836-121.171,65.35,121.171h-130.186Z"
      />
      <path
        className="cloak-logo-1"
        d="M1412.387,80.726h58.418v171.912l147.525-171.912h71.782l-121.288,140.823,169.802,179.229h-76.731l-129.707-136.251-61.385,71.782v64.469h-58.418V80.726Z"
      />
      <path
        className="cloak-logo-1"
        d="M690.802,267.186c24.342-9.606,53.128-8.186,71.468,11.247,6.79,6.888,12.6,15.507,17.552,24.479-7.721,8.358-18.873,13.089-29.747,14.351-30.448,3.525-58.114-20.198-59.273-50.077h0Z"
      />
      <path
        className="cloak-logo-2"
        d="M806.083,149.051V0l-90.595,64.494-95.584-60.34,6.338,123.869-11.67,8.309-40.919,243.541,15.824,9.057,142.626,81.58,5.182,2.955-5.075-3.897-106.525-82.244-12.034-9.272,12.076-102.692,180.354-126.31ZM704.033,72.652l18.714,11.82-80.381,51.496-1.627-18.264-7.965-90.08,71.26,45.029Z"
      />
      <polyline
        className="cloak-logo-3"
        points="619.905 4.154 746.371 50.442 735.016 76.829"
      />
      <path
        className="cloak-logo-1"
        d="M921.366,267.186c-1.162,29.882-28.823,53.601-59.274,50.077-10.876-1.265-22.021-5.992-29.747-14.351,4.941-8.964,10.764-17.599,17.551-24.48,18.338-19.432,47.13-20.853,71.469-11.246h0Z"
      />
      <path
        className="cloak-logo-3"
        d="M997.593,136.332l-11.67-8.309,6.338-123.869-95.584,60.34L806.083,0v149.051l180.354,126.31,12.077,102.692-12.034,9.272-106.525,82.244-5.075,3.897,5.182-2.955,142.626-81.58,15.824-9.057-40.919-243.541ZM971.427,117.703l-1.627,18.264-80.381-51.496,18.714-11.82,71.259-45.029-7.965,90.08Z"
      />
      <polyline
        className="cloak-logo-2"
        points="992.261 4.154 865.808 50.46 877.163 76.847"
      />
    </svg>
  );
}

export function CloakBanner() {
  return (
    <Link
      href="https://cloak.ag"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group relative flex flex-col gap-2.5 overflow-hidden rounded-xl border border-white/[0.06] p-3.5",
        "bg-gradient-to-br from-[#3b21af]/20 via-[#1a1035]/40 to-[#0f0a1e]/60",
        "transition-all duration-300 hover:from-[#3b21af]/30 hover:via-[#1a1035]/50 hover:to-[#0f0a1e]/70",
        "hover:border-[#8b5aef]/30 hover:shadow-[0_0_20px_rgba(139,90,239,0.15)]",
        "hover:-translate-y-0.5"
      )}
    >
      {/* Background glow effect */}
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[#8b5aef]/10 blur-2xl transition-all duration-500 group-hover:bg-[#8b5aef]/20" />
      
      {/* Top row: Logo + badge */}
      <div className="relative flex items-center justify-between">
        <CloakLogo />
        <span className="flex items-center gap-1 rounded-full bg-[#8b5aef]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#ede6ff]/80">
          <Shield className="h-2.5 w-2.5" />
          Privacy
        </span>
      </div>

      {/* Description */}
      <p className="relative text-[11px] leading-relaxed text-[#ede6ff]/60">
        Private transfers powered by zero-knowledge proofs
      </p>

      {/* CTA */}
      <div className="relative flex items-center gap-1 text-[11px] font-medium text-[#8b5aef] transition-colors group-hover:text-[#a67cf7]">
        <span>Learn more</span>
        <ExternalLink className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </div>
    </Link>
  );
}
