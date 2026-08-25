import React from "react";
import { ArrowUpRight } from "lucide-react";
import { AppRoute, NAV_ITEMS } from "./routing";

const ACCENT = "#5E0ED7";

export function BrandLogo({ onClick, title = "智能魔方教学系统" }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="cuber-logo brand-logo" onClick={onClick} aria-label="返回首页" title={title}>
      <span className="logo-letters">
        <span style={{ color: "#ef4444" }}>R</span>
        <span style={{ color: "#facc15" }}>U</span>
        <span style={{ color: "#3b82f6" }}>B</span>
        <span style={{ color: "#22c55e" }}>I</span>
        <span style={{ color: "#f97316" }}>K</span>
        <span style={{ color: "#3b82f6" }}>'</span>
        <span style={{ color: "#facc15" }}>S</span>
        <span className="logo-cube-word"> CUBE</span>
      </span>
      <span className="logo-subtext">
        <span className="sub-cube">Cube</span>
        <em className="sub-tutor">Tutor</em>
        <span className="sub-divider"> · </span>
        <span className="sub-cn">智能魔方</span>
      </span>
    </button>
  );
}

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
      <BrandLogo onClick={onHome} />

      <div className="cuber-topnav-links">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.mode}
            type="button"
            data-nav-mode={item.mode}
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
    { value: "3", label: "SOLVE\nENGINES" },
    { value: "100", label: "CFOP\nALGS" },
    { value: "∞", label: "AI\nMENTOR" },
  ];

  return (
    <div className="hero-chrome">
      <div className="hero-stats">
        {stats.map((s) => (
          <div key={s.label} className="hero-stat">
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
            AI cube tutor with live 3D — scan your cube, pick a method, and follow every move.
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
  alignTo,
  layoutKey = "",
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  /** 对齐到顶栏对应导航按钮中心 */
  alignTo?: AppRoute["mode"];
  /** 布局变化时强制重算（如 chat 开合） */
  layoutKey?: string;
}) {
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || !alignTo) return;

    const place = () => {
      const btn = document.querySelector(`.cuber-topnav-links button[data-nav-mode="${alignTo}"]`) as HTMLElement | null;
      const root = bar.offsetParent as HTMLElement | null;
      if (!btn || !root || btn.offsetParent === null) {
        // 移动端顶栏链接隐藏：居中
        bar.style.left = "50%";
        bar.style.transform = "translateX(-50%)";
        return;
      }
      const br = btn.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      const center = br.left + br.width / 2 - rr.left;
      bar.style.left = `${center}px`;
      bar.style.transform = "translateX(-50%)";
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(document.documentElement);
    const nav = document.querySelector(".cuber-topnav");
    if (nav) ro.observe(nav);
    window.addEventListener("resize", place);
    const onTransitionEnd = (e: Event) => {
      const t = e as TransitionEvent;
      if (t.propertyName === "right" || t.propertyName === "left" || t.propertyName === "transform") place();
    };
    nav?.addEventListener("transitionend", onTransitionEnd);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      nav?.removeEventListener("transitionend", onTransitionEnd);
    };
  }, [alignTo, layoutKey, tabs.length, value]);

  return (
    <div ref={barRef} className={`subtab-bar${alignTo ? ` align-${alignTo}` : ""}`}>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" className={value === tab.id ? "is-active" : ""} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
