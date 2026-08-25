import React from "react";
import { ArrowUpRight } from "lucide-react";
import { AppRoute, NAV_ITEMS } from "./routing";

const ACCENT = "#5E0ED7";

export function AppTopNav({
  route,
  onNavigate,
  onHome,
  onOpenMenu,
  variant = "app",
}: {
  route: AppRoute;
  onNavigate: (mode: AppRoute["mode"]) => void;
  onHome: () => void;
  onOpenMenu?: () => void;
  variant?: "home" | "app";
}) {
  return (
    <nav className={`cuber-topnav ${variant === "home" ? "is-home" : "is-app"}`}>
      <button type="button" className="cuber-logo" onClick={onHome} aria-label="返回首页" title="首页">
        <span className="cuber-logo-dot" />
      </button>

      <div className="cuber-topnav-links">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.mode}
            type="button"
            className={route.mode === item.mode ? "is-active" : ""}
            onClick={() => onNavigate(item.mode)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <button type="button" className="cuber-menu-btn" aria-label="打开菜单" onClick={onOpenMenu}>
        <span />
        <span />
        <span />
      </button>
    </nav>
  );
}

export function HeroChrome({
  onNavigate,
  onStart,
}: {
  onNavigate: (mode: AppRoute["mode"]) => void;
  onStart: () => void;
}) {
  const stats = [
    { value: "432", label: "MS BEST\nTIME" },
    { value: "100", label: "ALGORITHMS" },
    { value: "50", label: "PRACTICE\nRUNS" },
  ];

  return (
    <div className="hero-chrome">
      <div className="hero-stats">
        {stats.map((s) => (
          <div key={s.value} className="hero-stat">
            <div className="hero-stat-num">
              <span className="plus" style={{ color: ACCENT }}>
                +
              </span>
              <span>{s.value}</span>
            </div>
            <p>{s.label}</p>
          </div>
        ))}
      </div>

      <section className="hero-bottom">
        <div className="hero-row-a">
          <p className="hero-tagline">
            Rotate Your Mind
            <br />
            Solve The Chaos
            <br />
            Master The Cube
          </p>
          <button type="button" className="hero-cta" style={{ color: ACCENT }} onClick={onStart}>
            Start Solving
            <ArrowUpRight size={22} strokeWidth={2.5} />
          </button>
        </div>
        <div className="hero-row-b">
          <p className="hero-desc">
            Intelligent Cube Solver — From Scrambled To Solved, Every Move Precise &amp; Controlled
          </p>
          <h1 className="hero-title">
            <span>Scramble</span>
            <span>Solve</span>
            <span>Master</span>
          </h1>
        </div>
      </section>

      <div className="hero-quick">
        {NAV_ITEMS.map((item) => (
          <button key={item.mode} type="button" onClick={() => onNavigate(item.mode)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SubTabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="subtab-bar">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" className={value === tab.id ? "is-active" : ""} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
