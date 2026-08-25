export type AppMode = "home" | "guide" | "teach" | "train" | "settings" | "player" | "help";
export type GuideTab = "algs" | "legend";
export type TeachTab = "input" | "solve";
export type SettingsTab = "director" | "order" | "camera" | "control" | "appear" | "palette" | "help";

export type AppRoute = {
  mode: AppMode;
  guideTab: GuideTab;
  teachTab: TeachTab;
  settingsTab: SettingsTab;
};

export const NAV_ITEMS: { mode: Exclude<AppMode, "home" | "player" | "help">; label: string }[] = [
  { mode: "guide", label: "规则图鉴" },
  { mode: "teach", label: "教学台" },
  { mode: "train", label: "计时训练" },
  { mode: "settings", label: "设置" },
];

export const GUIDE_TABS: { id: GuideTab; label: string }[] = [
  { id: "legend", label: "图鉴" },
  { id: "algs", label: "公式" },
];

export const TEACH_TABS: { id: TeachTab; label: string }[] = [
  { id: "input", label: "录入魔方" },
  { id: "solve", label: "魔方还原" },
];

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "appear", label: "显示" },
  { id: "director", label: "动画" },
  { id: "order", label: "阶数" },
  { id: "camera", label: "镜头" },
  { id: "control", label: "控制" },
  { id: "palette", label: "配色" },
  { id: "help", label: "帮助" },
];

const LEGACY: Record<string, Partial<AppRoute> & { mode: AppMode }> = {
  playground: { mode: "train" },
  helper: { mode: "teach", teachTab: "input" },
  algs: { mode: "guide", guideTab: "algs" },
  director: { mode: "settings", settingsTab: "director" },
  player: { mode: "player" },
  help: { mode: "help" },
  train: { mode: "train" },
  guide: { mode: "guide" },
  teach: { mode: "teach" },
  settings: { mode: "settings" },
  home: { mode: "home" },
};

function defaults(): AppRoute {
  return {
    mode: "home",
    guideTab: "legend",
    teachTab: "input",
    settingsTab: "appear",
  };
}

export function readRoute(): AppRoute {
  const params = new URLSearchParams(location.search);
  const raw = params.get("mode") || "home";
  const base = { ...defaults(), ...(LEGACY[raw] || { mode: "home" as AppMode }) };
  const guideTab = (params.get("tab") as GuideTab) || base.guideTab;
  const teachTab = (params.get("tab") as TeachTab) || base.teachTab;
  const settingsTab = (params.get("tab") as SettingsTab) || base.settingsTab;

  if (base.mode === "guide" && (guideTab === "algs" || guideTab === "legend")) base.guideTab = guideTab;
  if (base.mode === "teach" && (teachTab === "input" || teachTab === "solve")) base.teachTab = teachTab;
  if (
    base.mode === "settings" &&
    ["director", "order", "camera", "control", "appear", "palette", "help"].includes(settingsTab)
  ) {
    base.settingsTab = settingsTab;
  }
  return base;
}

export function routeToUrl(route: AppRoute): string {
  if (route.mode === "home") return location.pathname;
  const params = new URLSearchParams();
  params.set("mode", route.mode);
  if (route.mode === "guide" && route.guideTab !== "legend") params.set("tab", route.guideTab);
  if (route.mode === "teach" && route.teachTab !== "input") params.set("tab", route.teachTab);
  if (route.mode === "settings" && route.settingsTab !== "appear") params.set("tab", route.settingsTab);
  // player keeps data param
  const data = new URLSearchParams(location.search).get("data");
  if (route.mode === "player" && data) params.set("data", data);
  const q = params.toString();
  return q ? `${location.pathname}?${q}` : location.pathname;
}

export function panelHeightFor(route: AppRoute, extras?: { teachHasResult?: boolean }): number {
  if (route.mode === "home") return 0;
  if (route.mode === "train") return 100;
  if (route.mode === "guide") return route.guideTab === "legend" ? 0 : 158;
  if (route.mode === "teach") {
    if (extras?.teachHasResult) return 360;
    return route.teachTab === "solve" ? 100 : 120;
  }
  if (route.mode === "settings") return route.settingsTab === "director" ? 204 : 220;
  if (route.mode === "player") return 100;
  return 0;
}
