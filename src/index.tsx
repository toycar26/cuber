import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import {
  ArrowUpRight,
  BookOpen,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clipboard,
  Code2,
  Compass,
  Layers,
  FastForward,
  HelpCircle,
  Home,
  Info,
  Keyboard,
  ListChecks,
  Map as MapIcon,
  Menu,
  Palette,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ScanLine,
  Settings,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import * as THREE from "three";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/outfit/800.css";
import "./index.css";
import World from "./cuber/world";
import Cubelet from "./cuber/cubelet";
import { COLORS, FACE } from "./cuber/define";
import { PaletteData, PreferanceData } from "./data";
import { TwistAction, TwistNode } from "./cuber/twister";
import tweener from "./cuber/tweener";
import Toucher from "./vue/Viewport/toucher";
import Solver, { SolveMethod, SolvePhaseInfo, SolveResult, SolveStep } from "./solver/Solver";
import {
  FACE_COLORS,
  FACE_ENUM,
  FACE_KEYS,
  FACE_ORIENTATION_HINTS,
  FACELET_INDICES,
  FaceKey,
  ON_TOP_FACE,
  Region,
  contrastColor,
  identifyFace,
  mirrorGrid,
  rotateGrid,
  startCamera,
  stopCamera,
  validateState,
} from "./cv/scanner";
import { configureRenderer } from "./cuber/three-compat";
import Util from "./common/util";
import GIF from "./common/gif";
import ZIP from "./common/zip";
import algsJson from "./vue/Algs/algs.json";
import {
  AppMode,
  AppRoute,
  GUIDE_TABS,
  GuideTab,
  NAV_ITEMS,
  SETTINGS_TABS,
  SettingsTab,
  TEACH_TABS,
  TeachTab,
  panelHeightFor,
  readRoute,
  routeToUrl,
} from "./shell/routing";
import { AppTopNav, BrandLogo, HeroChrome, SubTabBar } from "./shell/HeroHome";
import { ChatPanel, HomeAgentPeek } from "./components/ChatPanel";

/** @deprecated legacy mode ids still appear in a few share / help strings */
type Mode = "playground" | "helper" | "algs" | "director" | "player" | "help" | AppMode;
type StickerMap = { [face: string]: { [index: number]: string } | undefined };

type AppContext = {
  world: World;
  preferance: PreferanceData;
  palette: PaletteData;
};

const modeLabels: Record<string, string> = {
  playground: "练习",
  helper: "求解",
  algs: "公式",
  director: "动画",
  player: "播放",
  help: "帮助",
  home: "首页",
  guide: "规则图鉴",
  teach: "教学台",
  train: "计时训练",
  settings: "设置",
};

type NavigateFn = (next: Partial<AppRoute> & { mode?: AppMode }) => void;

let navigateRef: NavigateFn = () => undefined;

function openMode(mode: Mode): void {
  const map: Record<string, AppMode> = {
    playground: "train",
    helper: "teach",
    algs: "guide",
    director: "settings",
    player: "player",
    help: "help",
    home: "home",
    guide: "guide",
    teach: "teach",
    train: "train",
    settings: "settings",
  };
  const next = map[mode] || "home";
  if (next === "settings" && mode === "director") navigateRef({ mode: "settings", settingsTab: "director" });
  else if (next === "guide" && mode === "algs") navigateRef({ mode: "guide", guideTab: "algs" });
  else if (next === "guide") navigateRef({ mode: "guide", guideTab: "legend" });
  else if (next === "settings") navigateRef({ mode: "settings", settingsTab: "appear" });
  else navigateRef({ mode: next });
}

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    resize();
    return () => window.removeEventListener("resize", resize);
  }, []);
  return size;
}

function useAppContext(): AppContext {
  return useMemo(() => {
    const world = new World();
    return {
      world,
      preferance: new PreferanceData(world),
      palette: new PaletteData(world),
    };
  }, []);
}

function useAnimation(callback: () => void): void {
  const cb = useRef(callback);
  cb.current = callback;
  useEffect(() => {
    let live = true;
    const loop = () => {
      if (!live) return;
      cb.current();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => {
      live = false;
    };
  }, []);
}

type ViewportHandle = {
  resize: (width: number, height: number) => void;
  draw: () => boolean;
};

const Viewport = forwardRef<ViewportHandle, { ctx: AppContext }>(({ ctx }, ref) => {
  const host = useRef<HTMLDivElement>(null);
  const renderer = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.style.outline = "none";
    const instance = configureRenderer(new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    instance.autoClear = false;
    instance.setClearColor(COLORS.White, 0);
    instance.setPixelRatio(window.devicePixelRatio);
    return instance;
  }, []);
  const toucher = useMemo(() => new Toucher(), []);

  const draw = useCallback(() => {
    renderer.clear();
    renderer.render(ctx.world.scene, ctx.world.camera);
    ctx.world.dirty = false;
    ctx.world.cube.dirty = false;
    return true;
  }, [ctx.world, renderer]);

  useImperativeHandle(ref, () => ({
    resize(width, height) {
      const w = Math.max(1, Math.floor(width));
      const h = Math.max(1, Math.floor(height));
      if (w === ctx.world.width && h === ctx.world.height) {
        ctx.world.dirty = true;
        draw();
        return;
      }
      ctx.world.width = w;
      ctx.world.height = h;
      ctx.world.resize();
      // false：不改 canvas 行内样式，由 CSS 负责显示尺寸，避免过渡时闪烁
      renderer.setSize(w, h, false);
      ctx.world.dirty = true;
      draw();
    },
    draw,
  }));

  useEffect(() => {
    host.current?.appendChild(renderer.domElement);
    toucher.init(renderer.domElement, ctx.world.controller.touch);
    const wheel = (e: WheelEvent) => {
      if (e.target !== renderer.domElement) return;
      const next = Math.max(0, Math.min(100, ctx.preferance.scale + (e.deltaY > 0 ? -10 : 10)));
      ctx.preferance.scale = next;
      ctx.preferance.save();
    };
    document.addEventListener("wheel", wheel, false);
    return () => document.removeEventListener("wheel", wheel);
  }, [ctx, renderer, toucher]);

  return <div className="viewport" ref={host} />;
});

function IconButton({
  title,
  onClick,
  disabled = false,
  active = false,
  children,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button className={`icon-button ${active ? "active" : ""}`} title={title} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Modal({
  title,
  open,
  onClose,
  children,
  className = "",
  backdropClassName = "",
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  backdropClassName?: string;
}) {
  if (!open) return null;
  return createPortal(
    <div className={`modal-backdrop ${backdropClassName}`} role="dialog" aria-modal="true">
      <div className={`modal ${className}`}>
        <header>
          <strong>{title}</strong>
          <IconButton title="关闭" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        {children}
      </div>
    </div>,
    document.body
  );
}

function SettingsPanel({
  ctx,
  mode,
  onOrder,
  lockOrder = false,
  variant = "overlay",
  activeTab,
  onTabChange,
  hideModeNav = false,
}: {
  ctx: AppContext;
  mode: Mode;
  onOrder?: () => void;
  lockOrder?: boolean;
  /** overlay = classic modal; inline = settings page text tabs */
  variant?: "overlay" | "inline";
  activeTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
  hideModeNav?: boolean;
}) {
  const [, force] = useState(0);
  const [open, setOpen] = useState(variant === "inline");
  const [resetOpen, setResetOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [scrubbingCamera, setScrubbingCamera] = useState(false);
  const [tab, setTab] = useState<"order" | "camera" | "control" | "appear" | "palette">(
    activeTab && activeTab !== "director" && activeTab !== "help" ? activeTab : "order"
  );
  useEffect(() => {
    if (activeTab && activeTab !== "director" && activeTab !== "help") setTab(activeTab);
    if (activeTab === "help") setHelpOpen(true);
  }, [activeTab]);
  const update = () => {
    ctx.preferance.save();
    force((i) => i + 1);
  };
  const setPref = (key: keyof PreferanceData, value: number | boolean) => {
    (ctx.preferance as unknown as Record<string, number | boolean>)[key] = value;
    update();
  };
  const setColor = (key: string, value: string) => {
    ctx.palette.color(key, value);
    ctx.palette.save();
    force((i) => i + 1);
  };
  const resetConfig = () => {
    ctx.palette.reset();
    ctx.preferance.reset();
    force((i) => i + 1);
  };
  useEffect(() => {
    if (!scrubbingCamera) return;
    const finish = () => setScrubbingCamera(false);
    window.addEventListener("pointerup", finish);
    window.addEventListener("mouseup", finish);
    window.addEventListener("touchend", finish);
    window.addEventListener("touchcancel", finish);
    window.addEventListener("blur", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("touchend", finish);
      window.removeEventListener("touchcancel", finish);
      window.removeEventListener("blur", finish);
    };
  }, [scrubbingCamera]);

  const pickTab = (key: string) => {
    if (key === "help") {
      setHelpOpen(true);
      onTabChange?.("help");
      return;
    }
    if (key === "director") {
      onTabChange?.("director");
      return;
    }
    setTab(key as typeof tab);
    onTabChange?.(key as SettingsTab);
  };

  const settingsBody = (
    <>
      <div className={`settings-chrome ${variant === "inline" ? "inline-chrome" : ""}`}>
        {!hideModeNav && (
          <nav className="mode-nav text-nav">
            {NAV_ITEMS.map((item) => (
              <button key={item.mode} className={mode === item.mode ? "selected" : ""} onClick={() => openMode(item.mode)}>
                {item.label}
              </button>
            ))}
          </nav>
        )}
        <div className="settings-tabs-row">
          <div className={`settings-tabs ${variant === "inline" ? "text-tabs" : ""}`}>
            {(variant === "inline"
              ? SETTINGS_TABS.map(({ id, label }) => [id, label, null] as const)
              : ([
                  ["order", "阶数", <Settings key="o" />],
                  ["camera", "镜头", <Camera key="c" />],
                  ["control", "控制", <SlidersHorizontal key="s" />],
                  ["appear", "显示", <Sparkles key="a" />],
                  ["palette", "配色", <Palette key="p" />],
                  ["help", "帮助", <HelpCircle key="h" />],
                ] as const)
            ).map(([key, label, icon]) => (
              <button
                key={key as string}
                className={(variant === "inline" ? activeTab === key : tab === key) ? (variant === "inline" ? "is-active" : "selected") : ""}
                onClick={() => pickTab(key as string)}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {!(variant === "inline" && (activeTab === "director" || activeTab === "help")) && (
        <div className="settings-content">
          {tab === "order" && (
            <div className="button-grid">
              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((order) => (
                <button
                  key={order}
                  className={ctx.world.order === order ? "selected" : ""}
                  disabled={lockOrder}
                  onClick={() => {
                    ctx.world.order = order;
                    ctx.preferance.refresh();
                    onOrder?.();
                    force((i) => i + 1);
                  }}
                >
                  {order} 阶
                </button>
              ))}
            </div>
          )}
          {tab === "camera" && (
            <div className="control-stack">
              <Range label="缩放" value={ctx.preferance.scale} onScrubStart={() => setScrubbingCamera(true)} onScrubEnd={() => setScrubbingCamera(false)} onChange={(v) => setPref("scale", v)} />
              <Range label="透视" value={ctx.preferance.perspective} onScrubStart={() => setScrubbingCamera(true)} onScrubEnd={() => setScrubbingCamera(false)} onChange={(v) => setPref("perspective", v)} />
              <Range label="水平角" value={ctx.preferance.angle} onScrubStart={() => setScrubbingCamera(true)} onScrubEnd={() => setScrubbingCamera(false)} onChange={(v) => setPref("angle", v)} />
              <Range label="俯仰角" value={ctx.preferance.gradient} onScrubStart={() => setScrubbingCamera(true)} onScrubEnd={() => setScrubbingCamera(false)} onChange={(v) => setPref("gradient", v)} />
              <Range label="自发光" value={ctx.preferance.stickerEmission} onScrubStart={() => setScrubbingCamera(true)} onScrubEnd={() => setScrubbingCamera(false)} onChange={(v) => setPref("stickerEmission", v)} />
            </div>
          )}
          {tab === "control" && (
            <div className="control-stack">
              <Range label="动画帧" value={ctx.preferance.frames} min={4} max={60} onChange={(v) => setPref("frames", v)} />
              <Range label="灵敏度" value={ctx.preferance.sensitivity} onChange={(v) => setPref("sensitivity", v)} />
            </div>
          )}
          {tab === "appear" && (
            <div className="toggle-grid">
              {[
                ["thickness", "厚贴纸"],
                ["mirror", "镜面"],
                ["hollow", "空心"],
                ["arrow", "箭头"],
                ["shadow", "光影"],
                ["dark", "深色界面"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={Boolean((ctx.preferance as unknown as Record<string, boolean>)[key]) ? "selected" : ""}
                  onClick={() => setPref(key as keyof PreferanceData, !Boolean((ctx.preferance as unknown as Record<string, boolean>)[key]))}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {tab === "palette" && (
            <div className="palette-grid">
              {["R", "L", "U", "D", "F", "B", "Core", "High", "Gray"].map((key) => (
                <label key={key} className="palette-card">
                  <input type="color" value={COLORS[key]} onChange={(e) => setColor(key, e.target.value)} />
                  <span>{key}</span>
                </label>
              ))}
              <button className="palette-card palette-reset" onClick={() => ctx.palette.reset()}>
                恢复默认
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (variant === "inline") {
    return (
      <>
        <div className={`settings-inline-panel ${scrubbingCamera ? "scrubbing-preview" : ""}`}>{settingsBody}</div>
        <Modal
          title="CubeTutor 使用帮助"
          open={helpOpen}
          onClose={() => {
            setHelpOpen(false);
            if (variant === "inline" && activeTab === "help") onTabChange?.("appear");
          }}
          className="help-modal"
        >
          <div className="help-modal-body">
            <HelpContent compact />
            <div className="danger-zone">
              <button className="settings-reset danger" onClick={() => setResetOpen(true)}>
                <Trash2 />
                <span>重置数据</span>
              </button>
            </div>
          </div>
        </Modal>
        <Modal title="重置数据" open={resetOpen} onClose={() => setResetOpen(false)}>
          <p>选择要重置的范围。</p>
          <div className="modal-actions">
            <button onClick={() => setResetOpen(false)}>取消</button>
            <button
              onClick={() => {
                resetConfig();
                setResetOpen(false);
              }}
            >
              配置
            </button>
            <button
              className="danger"
              onClick={() => {
                localStorage.clear();
                location.reload();
              }}
            >
              全部
            </button>
          </div>
        </Modal>
      </>
    );
  }

  return (
    <>
      <nav className="console-text-nav" aria-label="控制台导航">
        {NAV_ITEMS.map((item) => (
          <button key={item.mode} type="button" className={mode === item.mode ? "selected" : ""} onClick={() => openMode(item.mode)}>
            {item.label}
          </button>
        ))}
        <button type="button" className="console-text-settings" onClick={() => setOpen(true)}>
          控制台
        </button>
      </nav>
      <Modal
        title="Cuber 控制台"
        open={open}
        onClose={() => setOpen(false)}
        className={`settings-modal live-preview ${scrubbingCamera ? "scrubbing-preview" : ""}`}
        backdropClassName="preview-backdrop"
      >
        {settingsBody}
      </Modal>
      <Modal title="CubeTutor 使用帮助" open={helpOpen} onClose={() => setHelpOpen(false)} className="help-modal">
        <div className="help-modal-body">
          <HelpContent compact />
          <div className="danger-zone">
            <button className="settings-reset danger" onClick={() => setResetOpen(true)}>
              <Trash2 />
              <span>重置数据</span>
            </button>
          </div>
        </div>
      </Modal>
      <Modal title="重置数据" open={resetOpen} onClose={() => setResetOpen(false)}>
        <p>选择要重置的范围。</p>
        <div className="modal-actions">
          <button onClick={() => setResetOpen(false)}>取消</button>
          <button
            onClick={() => {
              resetConfig();
              setResetOpen(false);
            }}
          >
            配置
          </button>
          <button
            className="danger"
            onClick={() => {
              localStorage.clear();
              location.reload();
            }}
          >
            全部
          </button>
        </div>
      </Modal>
    </>
  );
}

function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  onScrubStart,
  onScrubEnd,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}) {
  return (
    <label className="range-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Some range implementations do not expose pointer capture reliably.
          }
          onScrubStart?.();
        }}
        onMouseDown={onScrubStart}
        onTouchStart={onScrubStart}
        onPointerUp={onScrubEnd}
        onPointerCancel={onScrubEnd}
        onMouseUp={onScrubEnd}
        onTouchEnd={onScrubEnd}
        onTouchCancel={onScrubEnd}
        onBlur={onScrubEnd}
        onChange={(e) => {
          onScrubStart?.();
          onChange(Number(e.target.value));
        }}
      />
      <b>{value}</b>
    </label>
  );
}

type PlaybarHandle = {
  init: () => void;
  toggle: () => void;
  playing: boolean;
};

const Playbar = forwardRef<
  PlaybarHandle,
  { ctx: AppContext; scene: string; action: string; disabled?: boolean; onSettled?: () => void }
>(({ ctx, scene, action, disabled = false, onSettled }, ref) => {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const actions = useMemo(() => new TwistNode(action).parse(), [action]);
  const playingRef = useRef(false);
  const progressRef = useRef(0);
  const actionsRef = useRef(actions);
  const onSettledRef = useRef(onSettled);
  playingRef.current = playing;
  progressRef.current = progress;
  actionsRef.current = actions;
  onSettledRef.current = onSettled;

  const init = useCallback(() => {
    ctx.world.controller.lock = false;
    playingRef.current = false;
    progressRef.current = 0;
    setPlaying(false);
    setProgress(0);
    const setup = scene.replace("^", `(${action})'`);
    ctx.world.cube.twister.setup(setup);
  }, [action, ctx.world, scene]);

  const finish = () => {
    init();
    for (const item of actions) ctx.world.cube.twister.twist(item, true, true);
    playingRef.current = false;
    progressRef.current = actions.length;
    setProgress(actions.length);
  };

  const forward = () => {
    if (progressRef.current >= actions.length) return;
    if (progressRef.current === 0) init();
    playingRef.current = false;
    setPlaying(false);
    const item = actions[progressRef.current];
    progressRef.current += 1;
    setProgress(progressRef.current);
    ctx.world.cube.twister.twist(item, false, true);
  };

  const backward = () => {
    if (progressRef.current === 0) return;
    playingRef.current = false;
    setPlaying(false);
    const item = actions[progressRef.current - 1];
    progressRef.current -= 1;
    setProgress(progressRef.current);
    ctx.world.cube.twister.twist(new TwistAction(item.sign, !item.reverse, item.times), false, true);
  };

  useEffect(init, [init]);
  useEffect(() => {
    ctx.world.controller.disable = playing;
  }, [ctx.world, playing]);
  useEffect(() => {
    ctx.world.controller.lock = progress > 0;
    return () => {
      ctx.world.controller.lock = false;
      ctx.world.controller.disable = false;
    };
  }, [ctx.world, progress]);

  const step = useCallback(() => {
    if (!playingRef.current) return;
    const list = actionsRef.current;
    if (progressRef.current === list.length) {
      playingRef.current = false;
      setPlaying(false);
      onSettledRef.current?.();
      return;
    }
    let next = progressRef.current;
    do {
      const item = list[next++];
      const success = ctx.world.cube.twister.twist(item, false, false);
      if (success) {
        progressRef.current = next;
        setProgress(next);
        if (next === list.length) break;
      } else {
        next--;
        break;
      }
    } while (next < list.length);
  }, [ctx.world]);

  useEffect(() => {
    const callback = () => step();
    ctx.world.callbacks.push(callback);
    return () => {
      ctx.world.callbacks = ctx.world.callbacks.filter((item) => item !== callback);
    };
  }, [ctx.world, step]);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    if (progressRef.current === 0) init();
    playingRef.current = true;
    setPlaying(true);
    step();
  }, [init, step]);

  useImperativeHandle(ref, () => ({
    init,
    toggle,
    get playing() {
      return playingRef.current;
    },
  }), [init, toggle]);

  const chaos = progress === 0 && ctx.world.cube.history.length !== 0;
  return (
    <div className="playbar">
      <input
        type="range"
        min={0}
        max={actions.length}
        value={progress}
        onChange={(e) => {
          init();
          const value = Number(e.target.value);
          for (let i = 0; i < value; i++) ctx.world.cube.twister.twist(actions[i], true, true);
          progressRef.current = value;
          setProgress(value);
        }}
      />
      <div className="toolbar">
        <IconButton title="回到开始" disabled={disabled || (progress === 0 && !chaos)} onClick={init}>
          <SkipBack />
        </IconButton>
        <IconButton title="上一步" disabled={disabled || progress === 0 || chaos} onClick={backward}>
          <ChevronLeft />
        </IconButton>
        <IconButton title={playing ? "暂停" : "播放"} disabled={disabled || progress === actions.length || chaos} onClick={toggle}>
          {playing ? <Pause /> : <Play />}
        </IconButton>
        <IconButton title="下一步" disabled={disabled || progress === actions.length || chaos} onClick={forward}>
          <ChevronRight />
        </IconButton>
        <IconButton title="跳到结尾" disabled={disabled || progress === actions.length || chaos} onClick={finish}>
          <SkipForward />
        </IconButton>
      </div>
    </div>
  );
});

class PlaygroundData {
  private values = { version: "0.5", order: 3, scrambler: "*", history: "", scene: "*", start: 0, now: 0, complete: false };
  constructor() {
    const save = localStorage.getItem("playground");
    if (save) {
      const data = JSON.parse(save);
      if (data.version === this.values.version) this.values = data;
    }
  }
  save() {
    localStorage.setItem("playground", JSON.stringify(this.values));
  }
  get order() { return this.values.order; } set order(v) { this.values.order = v; }
  get scrambler() { return this.values.scrambler; } set scrambler(v) { this.values.scrambler = v; }
  get history() { return this.values.history; } set history(v) { this.values.history = v; }
  get scene() { return this.values.scene; } set scene(v) { this.values.scene = v; }
  get start() { return this.values.start; } set start(v) { this.values.start = v; }
  get now() { return this.values.now; } set now(v) { this.values.now = v; }
  get complete() { return this.values.complete; } set complete(v) { this.values.complete = v; }
}

function formatScore(start: number, now: number, moves: number): string {
  let diff = now - start;
  const minute = Math.floor(diff / 60000);
  diff %= 60000;
  const second = Math.floor(diff / 1000);
  const ms = Math.floor((diff % 1000) / 100);
  return `${minute ? `${String(minute).padStart(2, "0")}:` : ""}${String(second).padStart(2, "0")}.${ms}/${moves}`;
}

function useKeyboard(callback: (exp: string) => void) {
  const [prefix, setPrefix] = useState("");
  useEffect(() => {
    let width = 2;
    const keymap: Record<number, string> = {
      73: "R", 75: "R'", 87: "B", 79: "B'", 83: "D", 76: "D'", 68: "L", 69: "L'",
      74: "U", 70: "U'", 72: "F", 71: "F'", 186: "y", 59: "y", 65: "y'", 85: "r",
      82: "l'", 77: "r'", 86: "l", 84: "x", 89: "x", 78: "x'", 66: "x'", 190: "M'",
      88: "M'", 53: "M", 54: "M", 80: "z", 81: "z'", 90: "d", 191: "d'", 67: "u'",
      188: "u", 37: "U", 38: "R", 39: "U'", 40: "R'",
    };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      if (
        (target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable ||
            target.closest(".chat-panel") ||
            target.closest(".chat-settings-modal") ||
            target.closest(".model-picker-modal"))) ||
        (activeEl &&
          (activeEl.tagName === "INPUT" ||
            activeEl.tagName === "TEXTAREA" ||
            activeEl.tagName === "SELECT" ||
            activeEl.isContentEditable ||
            activeEl.closest(".chat-panel") ||
            activeEl.closest(".chat-settings-modal") ||
            activeEl.closest(".model-picker-modal")))
      ) {
        return;
      }
      const id = event.keyCode || event.which;
      if (id === 51 || id === 55) {
        width = Math.max(2, width - 1);
        setPrefix(String(width));
      } else if (id === 52 || id === 56) {
        width += 1;
        setPrefix(String(width));
      }
      if (id === 8) callback("^");
      const key = keymap[id];
      if (key) {
        callback(width !== 2 && "lrfbdu".includes(key[0]) ? `${width}${key}` : key);
        setPrefix("");
      }
    };
    document.addEventListener("keydown", keydown, false);
    return () => document.removeEventListener("keydown", keydown);
  }, [callback]);
  return prefix;
}

function SceneShell({
  ctx,
  mode,
  viewportHeight,
  children,
  onOrder,
  lockOrder,
  embedded = false,
}: {
  ctx: AppContext;
  mode: Mode;
  viewportHeight: number;
  children: React.ReactNode;
  onOrder?: () => void;
  lockOrder?: boolean;
  /** When true, parent owns Viewport + top navigation */
  embedded?: boolean;
}) {
  const viewport = useRef<ViewportHandle>(null);
  const { width, height } = useWindowSize();
  useEffect(() => {
    if (embedded) return;
    viewport.current?.resize(width, Math.max(1, height - viewportHeight));
  }, [embedded, height, viewportHeight, width]);
  useAnimation(() => {
    if (!embedded) viewport.current?.draw();
  });
  useEffect(() => {
    ctx.preferance.refresh();
    ctx.palette.refresh();
  }, [ctx]);
  return (
    <main className={`app-shell ${embedded ? "embedded" : ""}`}>
      {!embedded && <SettingsPanel ctx={ctx} mode={mode} onOrder={onOrder} lockOrder={lockOrder} hideModeNav />}
      {!embedded && <Viewport ref={viewport} ctx={ctx} />}
      {children}
    </main>
  );
}

function Playground({ ctx: externalCtx, embedded = false }: { ctx?: AppContext; embedded?: boolean } = {}) {
  const localCtx = useAppContext();
  const ctx = externalCtx || localCtx;
  const data = useMemo(() => new PlaygroundData(), []);
  const [, force] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [link, setLink] = useState("");
  const [done, setDone] = useState(false);

  const sync = useCallback(() => {
    data.scene = ctx.world.cube.history.init;
    data.history = ctx.world.cube.history.exp.substring(1);
    // 计时中：根据魔方是否复原更新完成态；未开始计时时也允许首次拧动后进入计时
    if (!data.complete) {
      data.complete = ctx.world.cube.complete;
      if (data.complete) setDone(true);
    } else if (ctx.world.cube.history.moves > 0 && !ctx.world.cube.complete) {
      // 从「已复原待命」拧出第一步后，进入计时态
      data.complete = false;
      if (data.start === 0) data.start = Date.now();
      data.now = Date.now();
    }
    data.save();
    force((i) => i + 1);
  }, [ctx.world, data]);

  const scramble = useCallback(() => {
    ctx.world.controller.lock = false;
    ctx.world.controller.disable = false;
    data.complete = true;
    ctx.world.cube.twister.finish();
    ctx.world.cube.reset();
    ctx.world.cube.strip({});
    ctx.world.cube.history.clear();
    ctx.world.cube.twister.twist(new TwistAction("*"), true, true);
    data.complete = ctx.world.cube.complete;
    data.start = 0;
    data.now = 0;
    sync();
  }, [ctx.world, data, sync]);

  const resetTimer = useCallback(() => {
    data.start = 0;
    data.now = 0;
    ctx.world.cube.history.clear();
    ctx.world.cube.twister.clearRedo();
    // 清空步数后若仍是打乱态，继续允许计时
    data.complete = ctx.world.cube.complete;
    sync();
  }, [ctx.world, data, sync]);

  const load = useCallback(() => {
    ctx.world.controller.lock = false;
    ctx.world.controller.disable = false;
    ctx.world.controller.taps = [];
    // 每次进入计时训练：重置为已复原初始态（需手动点「打乱」后再计时）
    ctx.world.order = data.order || 3;
    ctx.world.cube.twister.finish();
    ctx.world.cube.reset();
    ctx.world.cube.strip({});
    ctx.world.cube.history.clear();
    ctx.world.cube.history.init = "";
    data.history = "";
    data.scene = "*";
    data.complete = true;
    data.start = 0;
    data.now = 0;
    data.save();
    force((i) => i + 1);
    ctx.world.dirty = true;
  }, [ctx.world, data]);

  useEffect(load, [load]);

  // 进入计时训练时解锁交互，避免从播放器/公式页残留 lock/disable
  useEffect(() => {
    ctx.world.controller.lock = false;
    ctx.world.controller.disable = false;
    return () => {
      ctx.world.controller.lock = false;
      ctx.world.controller.disable = false;
    };
  }, [ctx.world]);

  useEffect(() => {
    ctx.world.callbacks.push(sync);
    return () => {
      ctx.world.callbacks = ctx.world.callbacks.filter((item) => item !== sync);
    };
  }, [ctx.world, sync]);

  useAnimation(() => {
    // 计时训练不做呼吸动画，避免位移干扰层扭选取
    if (!data.complete) {
      if (ctx.world.cube.history.moves === 0) {
        data.start = 0;
        data.now = 0;
      } else {
        if (data.start === 0) data.start = Date.now();
        data.now = Date.now();
      }
      force((i) => i + 1);
    }
  });

  const prefix = useKeyboard((exp) => {
    if (exp === "^") ctx.world.cube.twister.undo();
    else ctx.world.cube.twister.twist(new TwistAction(exp), false, true);
  });

  const share = () => {
    const string = btoa(JSON.stringify({ order: ctx.world.order, drama: { scene: data.scene, action: data.history } }));
    const url = `${location.origin}${location.pathname}?mode=player&data=${string}`;
    setLink(url);
    setShareOpen(true);
  };

  return (
    <SceneShell
      ctx={ctx}
      mode="train"
      viewportHeight={100}
      embedded={embedded}
      onOrder={() => {
        data.order = ctx.world.order;
        data.save();
        scramble();
      }}
    >
      {prefix && <div className="key-pill">{prefix}</div>}
      <div className="bottom-panel">
        <div className="toolbar primary-toolbar playground-toolbar">
          <div className="score-pill-inline clickable" title="点击重置计时与步数" onClick={resetTimer}>
            <Timer size={15} style={{ opacity: 0.75, marginRight: 6 }} />
            <span>{formatScore(data.start, data.now, ctx.world.cube.history.moves)}</span>
          </div>
          <div className="toolbar-actions">
            <IconButton
              title="上一步"
              disabled={ctx.world.cube.history.length === 0}
              onClick={() => {
                ctx.world.cube.twister.undo();
                sync();
              }}
            >
              <RotateCcw />
            </IconButton>
            <IconButton
              title="下一步"
              disabled={!ctx.world.cube.twister.canRedo}
              onClick={() => {
                ctx.world.cube.twister.redo();
                sync();
              }}
            >
              <RotateCw />
            </IconButton>
            <IconButton title="随机打乱" onClick={scramble}><Shuffle /></IconButton>
            <IconButton title="分享" onClick={share}><Share2 /></IconButton>
          </div>
          <div className="playground-toolbar-placeholder" />
        </div>
      </div>
      <Modal title="分享链接" open={shareOpen} onClose={() => setShareOpen(false)}>
        <textarea readOnly value={link} />
        <div className="modal-actions"><button onClick={() => navigator.clipboard?.writeText(link)}>复制</button><button onClick={() => window.open(link)}>打开</button></div>
      </Modal>
      <Modal title="复原成功" open={done} onClose={() => setDone(false)}>
        <p>本次还原已经完成，可以查看历史或打开复盘播放。</p>
        <div className="modal-actions"><button onClick={() => setDone(false)}>知道了</button><button onClick={() => { setDone(false); share(); }}>复盘</button></div>
      </Modal>
    </SceneShell>
  );
}

function FaceNet({
  face,
  grid,
  onRotate,
  onRescan,
  onCellClick,
}: {
  face: FaceKey;
  grid?: FaceKey[];
  onRotate: () => void;
  onRescan: () => void;
  onCellClick?: (index: number) => void;
}) {
  return (
    <div className="face-net">
      <div className="face-grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="face-grid-cell"
            style={{ background: grid ? FACE_COLORS[grid[i]] : "#c8ced8", cursor: onCellClick && grid ? "pointer" : undefined }}
            title={onCellClick && grid ? "点击切换颜色" : undefined}
            onClick={onCellClick && grid ? () => onCellClick(i) : undefined}
          />
        ))}
      </div>
      <div className="face-net-tools">
        <span>{face}</span>
        <button title="旋转" onClick={onRotate}><RotateCw /></button>
        <button title="重新扫描" onClick={onRescan}><ScanLine /></button>
      </div>
    </div>
  );
}

function capturedCount(rec: Record<FaceKey, FaceKey[] | undefined>): number {
  return FACE_KEYS.reduce((n, k) => n + (rec[k] ? 1 : 0), 0);
}

const FACE_CN: Record<FaceKey, string> = {
  U: "顶面",
  R: "右面",
  F: "前面",
  D: "底面",
  L: "左面",
  B: "后面",
};

function MiniFaceGrid({ grid, size = 8 }: { grid?: FaceKey[]; size?: number }) {
  return (
    <div
      className="mini-face-grid"
      style={{
        gridTemplateColumns: `repeat(3, ${size}px)`,
        gridTemplateRows: `repeat(3, ${size}px)`,
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="mini-face-cell"
          style={{ background: grid ? FACE_COLORS[grid[i]] : "#c8ced8" }}
        />
      ))}
    </div>
  );
}

function stickerCounts(rec: Record<FaceKey, FaceKey[] | undefined>): Record<FaceKey, number> {
  const counts = { U: 0, R: 0, F: 0, D: 0, L: 0, B: 0 } as Record<FaceKey, number>;
  for (const k of FACE_KEYS) {
    const g = rec[k];
    if (!g) continue;
    for (const c of g) counts[c] += 1;
  }
  return counts;
}

async function detectViaBackend(
  canvas: HTMLCanvasElement
): Promise<{ success: boolean; bbox?: { x1: number; y1: number; x2: number; y2: number }; grid?: string[]; method?: string; message?: string } | null> {
  try {
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("toBlob failed"));
      }, "image/jpeg", 0.8);
    });
    const formData = new FormData();
    formData.append("file", blob, "frame.jpg");
    const resp = await fetch("/detect", { method: "POST", body: formData });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function ScannerPanel({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (faces: Record<FaceKey, FaceKey[]>) => void;
}) {
  const [phase, setPhase] = useState<"intro" | "capture" | "review">("intro");
  const [captured, setCaptured] = useState<Record<FaceKey, FaceKey[] | undefined>>({} as Record<FaceKey, FaceKey[]>);
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<FaceKey | null>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendStatus, setBackendStatus] = useState<string>("未连接");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveGridRef = useRef<FaceKey[]>([]);
  const capturedRef = useRef(captured);
  const targetRef = useRef(target);
  const lastKeyRef = useRef("");
  const lastPromptRef = useRef("");
  const regionRef = useRef<Region | null>(null);
  // 前置摄像头时在绘制阶段水平翻转视频帧（而非 CSS 镜像），
  // 使叠加层文字正常、检测坐标与用户视角一致
  const mirroredRef = useRef(false);
  // 连续两次检测分布一致时，把该分布“锁定”在一旁，
  // 便于手持魔方时松手后再按采集键，无需稳住同时按键
  const [liveGrid, setLiveGrid] = useState<FaceKey[]>([]);
  const [locked, setLocked] = useState<{ grid: FaceKey[]; face: FaceKey } | null>(null);
  const lockedRef = useRef<{ grid: FaceKey[]; face: FaceKey; rawKey: string } | null>(null);
  const prevDetectKeyRef = useRef("");
  // 最近一次后端失败消息（success=false 时的 message），用于在 prompt 中直接显示
  const lastFailMsgRef = useRef<string>("");
  capturedRef.current = captured;
  targetRef.current = target;

  useEffect(() => {
    if (open) {
      setPhase("intro");
      setCaptured({} as Record<FaceKey, FaceKey[]>);
      setTarget(null);
      setError(null);
      setPrompt("");
      setLiveReady(false);
      setLiveGrid([]);
      liveGridRef.current = [];
      regionRef.current = null;
      lastKeyRef.current = "";
      lastPromptRef.current = "";
      mirroredRef.current = false;
      lockedRef.current = null;
      prevDetectKeyRef.current = "";
      lastFailMsgRef.current = "";
      setLocked(null);
      // 自动连接后端检测服务，无需手动点击
      setBackendStatus("正在连接…");
      fetch("/health")
        .then((resp) => {
          if (resp.ok) {
            setBackendConnected(true);
            setBackendStatus("已连接");
          } else {
            setBackendConnected(false);
            setBackendStatus("连接失败");
          }
        })
        .catch(() => {
          setBackendConnected(false);
          setBackendStatus("无法连接");
        });
    }
  }, [open]);

  const doneCount = FACE_KEYS.filter((k) => captured[k]).length;

  const drawCellOverlay = (gctx: CanvasRenderingContext2D, region: Region | null, grid: FaceKey[] | null) => {
    if (!region) {
      // 未检测到魔方：显示一个灰色引导框
      gctx.strokeStyle = "rgba(200,200,200,0.35)";
      gctx.lineWidth = 2;
      gctx.setLineDash([8, 6]);
      const gx = canvasRef.current!.width * 0.2;
      const gy = canvasRef.current!.height * 0.2;
      const gw = canvasRef.current!.width * 0.6;
      const gh = canvasRef.current!.height * 0.6;
      gctx.strokeRect(gx, gy, gw, gh);
      gctx.setLineDash([]);
      return;
    }
    // 检测到魔方：绿色轮廓 + 3x3 网格
    gctx.lineWidth = 3;
    gctx.strokeStyle = "rgba(34,197,94,0.95)";
    gctx.strokeRect(region.x, region.y, region.w, region.h);
    if (grid) {
      const n = 3;
      const cw = region.w / n;
      const ch = region.h / n;
      gctx.lineWidth = 1;
      gctx.strokeStyle = "rgba(255,255,255,0.5)";
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const x = region.x + c * cw;
          const y = region.y + r * ch;
          gctx.strokeRect(x, y, cw, ch);
          const letter = grid[r * n + c];
          const fs = Math.max(10, Math.round(Math.min(cw, ch) * 0.35));
          gctx.font = `bold ${fs}px sans-serif`;
          gctx.textAlign = "center";
          gctx.textBaseline = "middle";
          gctx.fillStyle = "rgba(0,0,0,0.65)";
          gctx.fillText(letter, x + cw / 2 + 1, y + ch / 2 + 1);
          gctx.fillStyle = "#fff";
          gctx.fillText(letter, x + cw / 2, y + ch / 2);
        }
      }
    }
  };

  useEffect(() => {
    if (!open || phase !== "capture") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const gctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!gctx) return;
    // 进入/重新进入采集阶段时清空旧锁定，避免沿用上一面的结果
    lockedRef.current = null;
    prevDetectKeyRef.current = "";
    setLocked(null);
    let alive = true;
    let raf = 0;
    let sized = false;
    let detecting = false;
    let lastDetectAt = 0;
    const DETECT_INTERVAL = 400;

    // 独立的送检画布：只绘制视频帧，避免叠加层文字污染颜色采样
    const detCanvas = document.createElement("canvas");
    const detCtx = detCanvas.getContext("2d", { willReadFrequently: true });

    // 绘制视频帧：前置摄像头水平翻转，使画面方向与用户动作一致。
    // 预览与送检均使用此函数，后端返回的 bbox/grid 即用户视角坐标，
    // 叠加层文字无需镜像、采集结果可直接放入 2D 展开图
    const drawVideoFrame = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (mirroredRef.current) {
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(video, 0, 0, w, h);
      }
    };

    const runDetection = async () => {
      if (!detCtx || !detCanvas.width) return;
      drawVideoFrame(detCtx, detCanvas.width, detCanvas.height);
      detecting = true;
      lastDetectAt = performance.now();
      try {
        let nextPrompt = "";
        if (backendConnected) {
          const result = await detectViaBackend(detCanvas);
          if (!alive) return;
          if (result && result.success && result.bbox) {
            lastFailMsgRef.current = "";
            const region: Region = {
              x: result.bbox.x1,
              y: result.bbox.y1,
              w: result.bbox.x2 - result.bbox.x1,
              h: result.bbox.y2 - result.bbox.y1,
            };
            if (result.grid && result.grid.length === 9) {
              const grid = result.grid as FaceKey[];
              liveGridRef.current = grid;
              regionRef.current = region;
              const face = identifyFace(grid);
              const key = grid.join("");
              // 连续两次检测分布一致 → 锁定该分布在一旁
              // （锁定的是镜像后可直接存入展开图的 grid，便于松手后按采集键录入）
              if (key === prevDetectKeyRef.current && (!lockedRef.current || lockedRef.current.rawKey !== key)) {
                const displayGrid = mirroredRef.current ? mirrorGrid(grid) : [...grid];
                const lface = targetRef.current ?? face;
                lockedRef.current = { grid: displayGrid, face: lface, rawKey: key };
                setLocked({ grid: displayGrid, face: lface });
              }
              prevDetectKeyRef.current = key;
              if (lockedRef.current) {
                nextPrompt = targetRef.current
                  ? `已锁定 ${targetRef.current} 面分布，可松开魔方后点击"采集锁定"录入`
                  : `已锁定 ${lockedRef.current.face} 面分布，可松开魔方后点击"采集锁定"录入（已完成 ${capturedCount(capturedRef.current)}/6）`;
              } else {
                nextPrompt = targetRef.current
                  ? `目标面 ${targetRef.current}（${FACE_ORIENTATION_HINTS[targetRef.current]}）：当前识别中心为 ${face}。对准后点击采集。`
                  : `检测到魔方面 ${face}（${FACE_ORIENTATION_HINTS[face]}，已完成 ${capturedCount(capturedRef.current)}/6）。对准后点击采集。`;
              }
            }
          } else if (result && !result.success) {
            // 后端返回失败：记录 message，后续在 prompt 中显示
            lastFailMsgRef.current = result.message || "未检测到魔方";
          }
        }
        if (!nextPrompt) {
          liveGridRef.current = [];
          regionRef.current = null;
          // 检测丢失时重置连续计数，但保留已锁定分布：用户可放下魔方后再采集
          prevDetectKeyRef.current = "";
          if (lockedRef.current) {
            nextPrompt = `已锁定 ${lockedRef.current.face} 面分布，可松开魔方后点击"采集锁定"录入`;
          } else if (!backendConnected) {
            nextPrompt = "未连接检测服务，请确认后端已启动后返回重试";
          } else if (lastFailMsgRef.current) {
            // 后端返回失败：直接显示后端的 message，便于排查
            nextPrompt = `检测失败：${lastFailMsgRef.current}`;
          } else {
            nextPrompt = "正在搜索魔方…请将魔方一个面朝向镜头";
          }
        }
        const key = liveGridRef.current.join("");
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key;
          const ready = liveGridRef.current.length === 9;
          setLiveReady(ready);
          setLiveGrid(ready ? [...liveGridRef.current] : []);
        }
        if (nextPrompt !== lastPromptRef.current) {
          lastPromptRef.current = nextPrompt;
          setPrompt(nextPrompt);
        }
      } catch {
        // 检测出错时保持上一帧
      } finally {
        detecting = false;
      }
    };

    const loop = () => {
      if (!alive) return;
      if (video.readyState >= 2 && video.videoWidth) {
        if (!sized) {
          const long = Math.max(video.videoWidth, video.videoHeight);
          const scale = long > 480 ? 480 / long : 1;
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          detCanvas.width = canvas.width;
          detCanvas.height = canvas.height;
          sized = true;
        }
        drawVideoFrame(gctx, canvas.width, canvas.height);
        // 每帧根据最新检测结果重绘叠加层，检测异步执行且限频，不阻塞渲染
        const region = regionRef.current;
        const grid = liveGridRef.current;
        const hasResult = region && grid.length === 9;
        drawCellOverlay(gctx, hasResult ? region : null, hasResult ? grid : null);
        if (!detecting && performance.now() - lastDetectAt >= DETECT_INTERVAL) {
          void runDetection();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    startCamera(video)
      .then((s) => {
        streamRef.current = s;
        // 前置摄像头（user 或未报告朝向）在绘制阶段水平翻转视频帧，后置保持原始画面
        const facing = s.getVideoTracks()[0]?.getSettings?.().facingMode;
        mirroredRef.current = facing !== "environment";
        raf = requestAnimationFrame(loop);
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        let hint = "";
        if (msg.includes("Could not start video source")) {
          hint = "（摄像头可能被其他程序占用，或浏览器未授权。请关闭占用程序后重试。）";
        } else if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          hint = "（摄像头权限被拒绝。请在浏览器地址栏点击允许，或清除站点权限后重试。）";
        } else if (msg.includes("NotFoundError") || msg.includes("Requested device")) {
          hint = "（未检测到摄像头设备。）";
        } else if (msg.includes("NotReadableError")) {
          hint = "（摄像头被其他程序占用。）";
        }
        setError("无法访问摄像头：" + msg + hint);
      });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopCamera(streamRef.current);
      streamRef.current = null;
      video.srcObject = null;
    };
  }, [open, phase, backendConnected]);

  const capture = () => {
    const lk = lockedRef.current;
    let grid: FaceKey[];
    let face: FaceKey;
    // 优先使用已锁定的分布（已镜像、可直接存入展开图）；
    // 否则取实时检测结果，并按前置摄像头镜像还原魔方真实朝向
    if (lk) {
      grid = [...lk.grid];
      face = lk.face;
    } else {
      grid = liveGridRef.current;
      if (!grid.length) return;
      if (mirroredRef.current) grid = mirrorGrid(grid);
      const identified = identifyFace(grid);
      face = targetRef.current ?? identified;
    }
    const next = { ...capturedRef.current };
    next[face] = grid;
    setCaptured(next);
    const identified = identifyFace(grid);
    const onTop = ON_TOP_FACE[face];
    const msg = targetRef.current && identified !== targetRef.current
      ? `已录入 ${face} 面（中心识别为 ${identified}，请确认朝向）`
      : `已录入 ${face} 面（${FACE_COLORS[face]}色面正对镜头，${FACE_COLORS[onTop]}色面朝上，可在展开图中旋转校正）`;
    lastPromptRef.current = msg;
    setPrompt(msg);
    // 录入后重置连续计数，准备下一面；若使用了锁定则一并清除
    prevDetectKeyRef.current = "";
    if (lk) {
      lockedRef.current = null;
      setLocked(null);
    }
    setTarget(null);
  };

  useEffect(() => {
    if (!open || phase !== "capture") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      if (lockedRef.current || liveGridRef.current.length === 9) capture();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase]);

  // 主动清除当前锁定（分布陈旧或不想使用时）
  const clearLock = () => {
    lockedRef.current = null;
    prevDetectKeyRef.current = "";
    setLocked(null);
  };

  const rotate = (face: FaceKey) => {
    setCaptured((prev) => {
      const g = prev[face];
      if (!g) return prev;
      return { ...prev, [face]: rotateGrid(g) };
    });
  };

  const rescan = (face: FaceKey) => {
    setTarget(face);
    setPhase("capture");
  };

  // 手动校正：点击贴纸循环切换颜色（U→R→F→D→L→B）
  const editCell = (face: FaceKey, index: number) => {
    setCaptured((prev) => {
      const g = prev[face];
      if (!g) return prev;
      const next = [...g];
      const cur = FACE_KEYS.indexOf(next[index]);
      next[index] = FACE_KEYS[(cur + 1) % FACE_KEYS.length];
      return { ...prev, [face]: next };
    });
  };

  const confirm = () => {
    const result = {} as Record<FaceKey, FaceKey[]>;
    for (const k of FACE_KEYS) {
      const g = captured[k];
      if (g) result[k] = g;
    }
    onConfirm(result);
  };

  const rediscover = () => {
    clearLock();
    liveGridRef.current = [];
    regionRef.current = null;
    lastKeyRef.current = "";
    setLiveReady(false);
    setLiveGrid([]);
    const msg = "正在搜索魔方…请将魔方一个面朝向镜头";
    lastPromptRef.current = msg;
    setPrompt(msg);
  };

  if (!open) return null;
  const validation = phase === "review" ? validateState(captured) : null;
  const colorCounts = phase === "review" ? stickerCounts(captured) : null;
  const suggestedFace = target ?? (liveGrid.length === 9 ? identifyFace(liveGrid) : "U");

  return (
    <Modal title="魔方状态录入" open={open} onClose={onClose} className="scanner-modal" backdropClassName="scanner-backdrop">
      <video ref={videoRef} className="scanner-video-hidden" playsInline muted />
      {error && <div className="scanner-error">{error}</div>}
      {phase === "intro" && (
        <div className="scanner-intro">
          <p>通过摄像头智能识别实体魔方的 6 面颜色分布，将真实物理魔方状态实时同步至 3D 仿真模型，便于进行 AI 辅助教学与算法求解。</p>
          <ul className="scanner-tips">
            <li>点击“开始录入”后，将实体魔方的各个面逐一正对镜头。</li>
            <li>系统将自动识别当前面的 3x3 九格颜色分布，按提示依次完成 6 个面的采集。</li>
            <li>在光线均匀、背景简洁的环境下识别更加稳定准确。</li>
            <li>录入完成后可在 2D 展开图中进行颜色微调与朝向校正，确认无误即可同步至 3D 模型。</li>
          </ul>
          {!backendConnected && (
            <small className="hint scanner-backend-hint">
              检测服务{backendStatus}。若无法识别，请启动后端服务：
              <code>cd cuber-server && pip install -r requirements.txt && python main.py</code>
            </small>
          )}
          <div className="modal-actions">
            <button onClick={onClose}>取消</button>
            <button className="primary" onClick={() => setPhase("capture")}>
              <Camera />
              开始录入
            </button>
          </div>
        </div>
      )}
      {phase === "capture" && (
        <div className="scanner-capture">
          <div className="scanner-face-tabs">
            {FACE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                className={`scanner-face-tab ${suggestedFace === k ? "active" : ""} ${captured[k] ? "done" : ""}`}
                onClick={() => setTarget(k)}
              >
                <MiniFaceGrid grid={captured[k]} size={7} />
                <span className="scanner-face-tab-letter" style={{ background: FACE_COLORS[k], color: contrastColor(FACE_COLORS[k]) }}>{k}</span>
                <span className="scanner-face-tab-name">{FACE_CN[k]}</span>
              </button>
            ))}
          </div>
          <div className="scanner-capture-body">
            <div className="scanner-capture-main">
              <div className="scanner-stage">
                <canvas ref={canvasRef} className="scanner-canvas" />
              </div>
              <div className="scanner-prompt">
                <Sparkles />
                {prompt || "正在启动摄像头..."}
              </div>
            </div>
            <aside className="scanner-capture-side">
              <div className="scanner-side-card scanner-locked-card">
                <div className="scanner-side-head">
                  <strong>已锁定面</strong>
                  <button type="button" className="scanner-side-action" onClick={rediscover}>
                    <RefreshCw />
                    寻找魔方
                  </button>
                </div>
                <MiniFaceGrid grid={locked?.grid} size={22} />
                <div className="scanner-side-meta">
                  {locked
                    ? `已锁定 ${locked.face} 面，可松开魔方后点“采集锁定”录入`
                    : "尚未锁定，对准稳定后将自动锁定当前面"}
                </div>
              </div>
              <div className="scanner-side-card">
                <div className="scanner-side-head">
                  <strong><Keyboard /> 快捷录入</strong>
                </div>
                <p>对准稳定后按 <b>空格键 (Space)</b> 快速完成采集</p>
              </div>
              <div className="scanner-side-card">
                <div className="scanner-side-head">
                  <strong><Compass /> 朝向指引</strong>
                </div>
                <div className="scanner-orientation-rules">
                  <div className="scanner-orientation-title">面朝向规则（正对镜头 → 朝上）</div>
                  <div className="scanner-orientation-list">
                    {FACE_KEYS.map((k) => {
                      const onTop = ON_TOP_FACE[k];
                      return (
                        <div key={k} className={`scanner-orientation-row ${suggestedFace === k ? "active" : ""}`}>
                          <span className="face-letter" style={{ background: FACE_COLORS[k], color: contrastColor(FACE_COLORS[k]) }}>{k}</span>
                          <span className="arrow">→</span>
                          <span className="face-letter" style={{ background: FACE_COLORS[onTop], color: contrastColor(FACE_COLORS[onTop]) }}>{onTop}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>
          </div>
          <div className="modal-actions scanner-actions">
            <button onClick={() => { setTarget(null); setPhase("intro"); }}>返回说明</button>
            <button className="primary" disabled={!liveReady && !locked} onClick={capture}>
              <Camera />
              {locked ? `采集锁定 (${locked.face} 面)` : `采集此面 (${suggestedFace} 面)`}
            </button>
            <button disabled={doneCount < 6} onClick={() => setPhase("review")}>
              <Check />
              检查展开图 ({doneCount}/6)
            </button>
          </div>
        </div>
      )}
      {phase === "review" && (
        <div className="scanner-review">
          <p>下方为 6 面展开图。点击任意贴纸色块可手动循环切换颜色；点击旋转按钮可修正方向。确认与实体魔方完全一致后点击“同步至 3D 模型”。</p>
          <div className="scanner-count-row">
            {FACE_KEYS.map((k) => (
              <span key={k} className="scanner-count-chip">
                <i style={{ background: FACE_COLORS[k] }} />
                {FACE_CN[k]}: {colorCounts?.[k] ?? 0}/9
              </span>
            ))}
          </div>
          <div className="scanner-net">
            <div className="net-top"><FaceNet face="U" grid={captured.U} onRotate={() => rotate("U")} onRescan={() => rescan("U")} onCellClick={(i) => editCell("U", i)} /></div>
            <div className="net-row">
              {(["L", "F", "R", "B"] as FaceKey[]).map((k) => (
                <FaceNet key={k} face={k} grid={captured[k]} onRotate={() => rotate(k)} onRescan={() => rescan(k)} onCellClick={(i) => editCell(k, i)} />
              ))}
            </div>
            <div className="net-bottom"><FaceNet face="D" grid={captured.D} onRotate={() => rotate("D")} onRescan={() => rescan("D")} onCellClick={(i) => editCell("D", i)} /></div>
          </div>
          {validation && !validation.ok && (
            <div className="scanner-warn">{validation.issues.map((s, i) => <div key={i}>· {s}</div>)}</div>
          )}
          <div className="modal-actions">
            <button onClick={() => setPhase("capture")}>继续采集</button>
            <button className="primary" onClick={confirm}>
              <Check />
              同步至 3D 模型
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// 单层 / 双层 / 整体旋转图例
const LEGEND_FACES: { face: string; name: string }[] = [
  { face: "R", name: "右面" },
  { face: "U", name: "顶面" },
  { face: "F", name: "前面" },
  { face: "L", name: "左面" },
  { face: "D", name: "底面" },
  { face: "B", name: "后面" },
];

function LegendDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop legend-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <aside className="legend-drawer" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>
            <Compass />
            操作图鉴
          </strong>
          <IconButton title="关闭" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        <div className="legend-body">
          <section>
            <h3>
              <Layers />
              单层旋转（大写）
            </h3>
            <p className="legend-hint">从该面外侧看，顺时针 90° 为基本方向；加 ' 表示反向，加 2 表示 180°。</p>
            <div className="legend-grid">
              {LEGEND_FACES.map(({ face, name }) => (
                <div className="legend-row" key={face}>
                  <span className="legend-token">{face}</span>
                  <span className="legend-desc">
                    {name}顺时针 90°
                    <RotateCw className="legend-arrow" />
                  </span>
                </div>
              ))}
              {LEGEND_FACES.map(({ face, name }) => (
                <div className="legend-row" key={`${face}'`}>
                  <span className="legend-token">{face}'</span>
                  <span className="legend-desc">
                    {name}逆时针 90°
                    <RotateCcw className="legend-arrow" />
                  </span>
                </div>
              ))}
              {LEGEND_FACES.map(({ face, name }) => (
                <div className="legend-row" key={`${face}2`}>
                  <span className="legend-token">{face}2</span>
                  <span className="legend-desc">{name}转 180°</span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3>
              <Layers />
              双层旋转（小写）
            </h3>
            <p className="legend-hint">小写字母 = 该面 + 相邻中层（两层一起转），方向同大写。</p>
            <div className="legend-grid">
              {LEGEND_FACES.map(({ face, name }) => (
                <div className="legend-row" key={`w${face}`}>
                  <span className="legend-token">{face.toLowerCase()}</span>
                  <span className="legend-desc">
                    {name}+中层顺时针 90°
                    <RotateCw className="legend-arrow" />
                  </span>
                </div>
              ))}
              {LEGEND_FACES.map(({ face, name }) => (
                <div className="legend-row" key={`w${face}'`}>
                  <span className="legend-token">{face.toLowerCase()}'</span>
                  <span className="legend-desc">
                    {name}+中层逆时针 90°
                    <RotateCcw className="legend-arrow" />
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3>
              <Compass />
              整体旋转
            </h3>
            <p className="legend-hint">绕整体坐标轴旋转整个魔方，不改变已涂抹颜色，仅改变观察方向。</p>
            <div className="legend-grid">
              <div className="legend-row">
                <span className="legend-token">x</span>
                <span className="legend-desc">整体绕 R 方向旋转 90°</span>
              </div>
              <div className="legend-row">
                <span className="legend-token">x'</span>
                <span className="legend-desc">整体绕 R 方向反向 90°</span>
              </div>
              <div className="legend-row">
                <span className="legend-token">y</span>
                <span className="legend-desc">整体绕 U 方向旋转 90°</span>
              </div>
              <div className="legend-row">
                <span className="legend-token">y'</span>
                <span className="legend-desc">整体绕 U 方向反向 90°</span>
              </div>
              <div className="legend-row">
                <span className="legend-token">z</span>
                <span className="legend-desc">整体绕 F 方向旋转 90°</span>
              </div>
              <div className="legend-row">
                <span className="legend-token">z'</span>
                <span className="legend-desc">整体绕 F 方向反向 90°</span>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

const SOLVE_METHODS: { id: SolveMethod; name: string; desc: string; tag: string }[] = [
  {
    id: "layerfirst",
    name: "层先法",
    desc: "7 阶段入门解法：底十字→底角→中层棱→顶十字→顶角定向→顶角位置→顶棱位置。步骤多但易懂。",
    tag: "推荐新手",
  },
  {
    id: "cfop",
    name: "CFOP",
    desc: "Cross / F2L / OLL / PLL 四阶段速拧框架。阶段更少、动作更紧凑，适合进阶。",
    tag: "进阶",
  },
  {
    id: "kociemba",
    name: "Kociemba",
    desc: "两阶段最优搜索，给出最短单串解，不分 CFOP 阶段。",
    tag: "最优",
  },
];

function MethodSelect({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (m: SolveMethod) => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal method-modal">
        <header>
          <strong>
            <Sparkles />
            选择求解方法
          </strong>
          <IconButton title="关闭" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        <div className="method-list">
          {SOLVE_METHODS.map((m) => (
            <button key={m.id} className="method-card" onClick={() => onPick(m.id)}>
              <div className="method-head">
                <strong>{m.name}</strong>
                <span className="method-tag">{m.tag}</span>
              </div>
              <p>{m.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// 求解结果播放器：上方显示下一步 + 阶段进度 + 逐步点亮的解串 + Playbar
function SolutionPlayer({
  ctx,
  result,
  scene,
  stickers,
  onClose,
}: {
  ctx: AppContext;
  result: SolveResult;
  scene: string;
  stickers: StickerMap;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  // 播放速度 1–10（越大越快），映射到动画帧数（帧数越小越快）
  const [playSpeed, setPlaySpeed] = useState(() => {
    const frames = ctx.preferance.frames || 20;
    return Math.max(1, Math.min(10, Math.round(11 - (frames - 4) / 6.2)));
  });
  const actions = useMemo(() => new TwistNode(result.raw).parse(), [result.raw]);
  const playingRef = useRef(false);
  const progressRef = useRef(0);
  const actionsRef = useRef(actions);
  const stepsScrollRef = useRef<HTMLDivElement>(null);
  const currentStepRef = useRef<HTMLSpanElement>(null);
  playingRef.current = playing;
  progressRef.current = progress;
  actionsRef.current = actions;

  const init = useCallback(() => {
    ctx.world.controller.lock = false;
    playingRef.current = false;
    progressRef.current = 0;
    setPlaying(false);
    setProgress(0);
    const setup = scene.replace("^", `(${result.raw})'`);
    ctx.world.cube.twister.setup(setup);
    if (stickers) {
      for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
        const list = stickers[FACE[face]];
        if (list) for (const sticker in list) ctx.world.cube.stick(Number(sticker), face, list[sticker]);
      }
    }
  }, [ctx.world, scene, result.raw, stickers]);

  const finish = useCallback(() => {
    init();
    for (const item of actionsRef.current) ctx.world.cube.twister.twist(item, true, true);
    progressRef.current = actionsRef.current.length;
    setProgress(actionsRef.current.length);
    setPlaying(false);
    playingRef.current = false;
  }, [ctx.world, init]);

  const forward = useCallback(() => {
    if (progressRef.current >= actionsRef.current.length) return;
    if (progressRef.current === 0) init();
    setPlaying(false);
    playingRef.current = false;
    const item = actionsRef.current[progressRef.current];
    progressRef.current += 1;
    setProgress(progressRef.current);
    ctx.world.cube.twister.twist(item, false, true);
  }, [ctx.world, init]);

  const backward = useCallback(() => {
    if (progressRef.current === 0) return;
    setPlaying(false);
    playingRef.current = false;
    const item = actionsRef.current[progressRef.current - 1];
    progressRef.current -= 1;
    setProgress(progressRef.current);
    ctx.world.cube.twister.twist(new TwistAction(item.sign, !item.reverse, item.times), false, true);
  }, [ctx.world]);

  useEffect(init, [init]);
  useEffect(() => {
    ctx.world.controller.disable = playing;
    ctx.world.controller.lock = progress > 0;
    return () => {
      ctx.world.controller.lock = false;
      ctx.world.controller.disable = false;
    };
  }, [ctx.world, playing, progress]);

  const step = useCallback(() => {
    if (!playingRef.current) return;
    const list = actionsRef.current;
    if (progressRef.current === list.length) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    let next = progressRef.current;
    do {
      const item = list[next++];
      const success = ctx.world.cube.twister.twist(item, false, false);
      if (success) {
        progressRef.current = next;
        setProgress(next);
        if (next === list.length) break;
      } else {
        next--;
        break;
      }
    } while (next < list.length);
  }, [ctx.world]);

  useEffect(() => {
    const callback = () => step();
    ctx.world.callbacks.push(callback);
    return () => {
      ctx.world.callbacks = ctx.world.callbacks.filter((item) => item !== callback);
    };
  }, [ctx.world, step]);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
      return;
    }
    if (progressRef.current === 0) init();
    playingRef.current = true;
    setPlaying(true);
    step();
  }, [init, step]);

  const total = result.steps.length;
  const nextStep = progress < total ? result.steps[progress] : null;
  const currentPhaseIdx = nextStep ? nextStep.phase : result.phases.length - 1;
  const atEnd = progress >= total;

  useEffect(() => {
    const chip = currentStepRef.current;
    const box = stepsScrollRef.current;
    if (!chip || !box) return;
    const chipRect = chip.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    if (chipRect.top < boxRect.top + 2 || chipRect.bottom > boxRect.bottom - 2) {
      chip.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }, [progress]);

  return (
    <div className="bottom-panel tall solution-player">
      <div className="solution-topbar">
        <div className="solution-phases">
          {result.phases.map((p) => {
            const done = progress >= p.endStep && p.endStep > 0;
            const active = p.startStep <= progress && progress < p.endStep && p.endStep > 0;
            return (
              <div
                key={p.index}
                className={`phase-pill ${done ? "done" : ""} ${active ? "active" : ""} ${p.endStep === 0 ? "empty" : ""}`}
              >
                <span className="phase-index">{p.index + 1}</span>
                <span className="phase-name">{p.label}</span>
              </div>
            );
          })}
        </div>
        <button className="solution-close" title="返回录入" onClick={onClose}>
          <X />
        </button>
      </div>

      <div className="solution-next">
        <span className="next-label">
          <ListChecks />
          下一步
        </span>
        <span className={`next-token ${atEnd ? "done" : ""}`}>{nextStep ? nextStep.exp : "完成"}</span>
        <span className="next-phase">
          <Info />
          {nextStep ? nextStep.phaseLabel : "已复原"}
        </span>
      </div>

      <div className="solution-string" ref={stepsScrollRef}>
        {result.steps.map((s, i) => (
          <span
            key={i}
            ref={i === Math.min(progress, Math.max(0, total - 1)) ? currentStepRef : undefined}
            className={`step-chip ${i < progress ? "done" : ""} ${i === progress ? "current" : ""}`}
          >
            {s.exp}
          </span>
        ))}
      </div>

      <div className="playbar">
        <input
          type="range"
          min={0}
          max={actions.length}
          value={progress}
          onChange={(e) => {
            init();
            const value = Number(e.target.value);
            for (let i = 0; i < value; i++) ctx.world.cube.twister.twist(actions[i], true, true);
            progressRef.current = value;
            setProgress(value);
          }}
        />
        <div className="toolbar solution-controls">
          <IconButton title="回到开始" disabled={progress === 0} onClick={init}>
            <SkipBack />
          </IconButton>
          <IconButton title="上一步" disabled={progress === 0} onClick={backward}>
            <ChevronLeft />
          </IconButton>
          <IconButton title={playing ? "暂停" : "播放"} disabled={atEnd} onClick={toggle}>
            {playing ? <Pause /> : <Play />}
          </IconButton>
          <IconButton title="下一步" disabled={atEnd} onClick={forward}>
            <ChevronRight />
          </IconButton>
          <IconButton title="跳到结尾" disabled={atEnd} onClick={finish}>
            <SkipForward />
          </IconButton>
          <div className="solution-speed-inline" title="播放速度">
            <span>速度</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={playSpeed}
              onChange={(e) => {
                const speed = Number(e.target.value);
                setPlaySpeed(speed);
                const frames = Math.round(60 - (speed - 1) * (56 / 9));
                ctx.preferance.frames = Math.max(4, Math.min(60, frames));
                ctx.preferance.save();
              }}
            />
            <b>{playSpeed}x</b>
          </div>
        </div>
      </div>
    </div>
  );
}

function convertBackendSolution(
  data: { method?: string; steps?: Array<{ move: string; stage: string; narration_key?: string }> },
  method: SolveMethod
): SolveResult {
  const methodKey = (data.method || method).toLowerCase();
  const backendSteps = data.steps || [];
  const rawMoves = backendSteps.map((s) => s.move).join(" ");
  const isCfop = methodKey === "cfop";
  const isKociemba = methodKey === "kociemba";
  const phaseList = isCfop
    ? ["cross", "f2l", "oll", "pll"]
    : isKociemba
      ? ["kociemba"]
      : [
          "cross",
          "first_layer_corners",
          "second_layer",
          "last_layer_cross",
          "last_layer_corners_orient",
          "last_layer_corners_perm",
          "last_layer_edges",
        ];
  const phaseLabels = isCfop
    ? ["1. Cross 底层十字", "2. F2L 前两层", "3. OLL 顶层朝向", "4. PLL 顶层排列"]
    : isKociemba
      ? ["两阶段最优求解"]
      : [
          "1. 底层十字",
          "2. 底层角块",
          "3. 中层棱块",
          "4. 顶层十字",
          "5. 顶层角定向",
          "6. 顶层角位置",
          "7. 顶层棱位置",
        ];
  const phases: SolvePhaseInfo[] = phaseLabels.map((label, idx) => ({
    index: idx,
    label,
    startStep: -1,
    endStep: 0,
  }));
  const steps: SolveStep[] = [];
  backendSteps.forEach((s, idx) => {
    let pIdx = phaseList.indexOf(s.stage);
    if (pIdx === -1) pIdx = 0;
    const pLabel = phaseLabels[pIdx] || s.stage;
    steps.push({
      exp: s.move,
      moveIndex: idx,
      phase: pIdx,
      phaseLabel: pLabel,
    });
    if (phases[pIdx].startStep === -1) phases[pIdx].startStep = idx;
    phases[pIdx].endStep = idx + 1;
  });
  phases.forEach((p) => {
    if (p.startStep === -1) {
      p.startStep = 0;
      p.endStep = 0;
    }
  });
  return { method, raw: rawMoves, steps, phases };
}

function Helper({
  ctx: externalCtx,
  embedded = false,
  tab = "input",
  onResultChange,
}: {
  ctx?: AppContext;
  embedded?: boolean;
  tab?: TeachTab;
  onResultChange?: (has: boolean) => void;
} = {}) {
  const localCtx = useAppContext();
  const ctx = externalCtx || localCtx;
  const solver = useMemo(() => new Solver(), []);
  const [stickers, setStickers] = useState<StickerMap>({});
  const [methodOpen, setMethodOpen] = useState(false);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [resultScene, setResultScene] = useState("");
  const [errorText, setErrorText] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const applyStickers = useCallback(
    (map: StickerMap) => {
      for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
        const list = map[FACE[face]];
        if (list) for (const sticker in list) ctx.world.cube.stick(Number(sticker), face, list[sticker]);
      }
      ctx.world.dirty = true;
    },
    [ctx.world]
  );
  const persistStickers = useCallback((next: StickerMap) => {
    setStickers(next);
    localStorage.setItem("helper-stickers", JSON.stringify(next));
  }, []);
  const buildSolvedStickers = useCallback((): StickerMap => {
    const next: StickerMap = {};
    for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
      const key = FACE[face];
      const group = ctx.world.cube.table.face(key);
      next[key] = {};
      for (const index of group.indices) next[key]![index] = key;
    }
    return next;
  }, [ctx.world]);
  const captureStickersFromCube = useCallback(() => {
    const facelets = ctx.world.cube.serialize();
    ctx.world.cube.twister.finish();
    ctx.world.cube.reset();
    ctx.world.cube.strip({});
    ctx.world.cube.history.clear();
    const next: StickerMap = {};
    let offset = 0;
    for (const fk of FACE_KEYS) {
      const indices = FACELET_INDICES[fk];
      const faceEnum = FACE_ENUM[fk];
      const map: { [index: number]: string } = {};
      for (let i = 0; i < 9; i++) {
        const color = facelets[offset + i];
        map[indices[i]] = color;
        ctx.world.cube.stick(indices[i], faceEnum, color);
      }
      next[fk] = map;
      offset += 9;
    }
    persistStickers(next);
    ctx.world.dirty = true;
  }, [ctx.world, persistStickers]);
  // 进入教学台：默认还原态，不恢复上次打乱/贴纸
  useEffect(() => {
    ctx.world.order = 3;
    ctx.world.cube.twister.finish();
    ctx.world.cube.reset();
    ctx.world.cube.strip({});
    ctx.world.cube.history.clear();
    ctx.world.cube.history.init = "";
    const solved = buildSolvedStickers();
    persistStickers(solved);
    applyStickers(solved);
    setResult(null);
    setResultScene("");
    setErrorText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyStickers, buildSolvedStickers, ctx.world, persistStickers]);
  useAnimation(() => solver.init());
  const reset = () => {
    ctx.world.cube.twister.finish();
    ctx.world.cube.reset();
    ctx.world.cube.strip({});
    ctx.world.cube.history.clear();
    const next = buildSolvedStickers();
    persistStickers(next);
    ctx.world.dirty = true;
  };
  const clear = () => {
    persistStickers({});
    localStorage.removeItem("helper-stickers");
    ctx.world.cube.twister.finish();
    ctx.world.cube.reset();
    ctx.world.cube.strip({});
    ctx.world.cube.history.clear();
    ctx.world.dirty = true;
  };
  const scrambleRandom = () => {
    ctx.world.cube.twister.finish();
    ctx.world.cube.reset();
    ctx.world.cube.strip({});
    ctx.world.cube.history.clear();
    ctx.world.cube.twister.twist(new TwistAction("*"), true, true);
    captureStickersFromCube();
  };
  const runSolve = async (method: SolveMethod) => {
    const currentState = ctx.world.cube.serialize();
    const solvedFacelets = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
    setMethodOpen(false);
    setErrorText("");

    const applyResult = (ret: SolveResult) => {
      if (ret.error) {
        setErrorText(ret.error);
        setResult(null);
        return;
      }
      if (ret.steps.length === 0 && currentState !== solvedFacelets) {
        setErrorText("未返回有效还原步骤，请检查魔方贴纸颜色是否完整合法。");
        setResult(null);
        return;
      }
      const hasStickers = Object.values(stickers).some((face) => face && Object.keys(face).length > 0);
      const sceneToPlay =
        ctx.world.cube.history.init ||
        ctx.world.cube.history.exp ||
        (hasStickers ? "" : ret.raw ? `(${ret.raw})'` : "");
      setErrorText("");
      setResultScene(sceneToPlay);
      setResult(ret);
    };

    const fallbackLocal = () => {
      const fallback = solver.solvePhased(currentState, method);
      applyResult(fallback);
    };

    try {
      const controller = new AbortController();
      // Kociemba 首次生成查找表可能阻塞后端；超时后回退到前端离线求解，保证能出还原过程
      const timeoutMs = method === "kociemba" ? 12000 : 8000;
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      let resp: Response;
      try {
        resp = await fetch("/api/solve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method,
            facelets: currentState,
          }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timer);
      }
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        const detail = (errJson as { detail?: string }).detail || `后端求解错误 (${resp.status})`;
        throw new Error(detail);
      }
      const data = await resp.json();
      applyResult(convertBackendSolution(data, method));
    } catch (err: unknown) {
      console.warn("后端求解失败，回退前端求解器:", err);
      fallbackLocal();
    }
  };
  const exitPlayer = () => {
    // 退出播放：恢复录入态（重置动作历史，回到求解前的贴纸状态）
    ctx.world.cube.twister.setup(resultScene);
    if (stickers) {
      for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
        const list = stickers[FACE[face]];
        if (list) for (const sticker in list) ctx.world.cube.stick(Number(sticker), face, list[sticker]);
      }
    }
    setResult(null);
  };
  useEffect(() => {
    onResultChange?.(!!result);
  }, [onResultChange, result]);
  const applyScan = (faces: Record<FaceKey, FaceKey[]>) => {
    const next: StickerMap = { ...stickers };
    for (const fk of FACE_KEYS) {
      const grid = faces[fk];
      if (!grid) continue;
      const indices = FACELET_INDICES[fk];
      const faceEnum = FACE_ENUM[fk];
      const map: { [index: number]: string } = {};
      for (let i = 0; i < 9; i++) {
        const idx = indices[i];
        map[idx] = grid[i];
        ctx.world.cube.stick(idx, faceEnum, grid[i]);
      }
      next[fk] = map;
    }
    persistStickers(next);
    ctx.world.dirty = true;
    setScanOpen(false);
  };
  const showPlayer = tab === "solve" && !!result;
  const showInputTools = tab === "input" && !result;
  const showSolveTools = tab === "solve" && !result;
  return (
    <SceneShell ctx={ctx} mode="teach" viewportHeight={showPlayer ? 360 : showSolveTools ? 100 : 120} lockOrder embedded={embedded}>
      {showPlayer ? (
        <SolutionPlayer
          ctx={ctx}
          result={result!}
          scene={resultScene}
          stickers={stickers}
          onClose={exitPlayer}
        />
      ) : (
        <div className={`bottom-panel ${showInputTools ? "helper-input-panel" : "helper-solve-panel"}`}>
          <div className="helper-actions">
            {showInputTools && (
              <>
                <button type="button" onClick={() => setScanOpen(true)}><ScanLine />录入</button>
                <button type="button" onClick={scrambleRandom}><Shuffle />随机打乱</button>
                <button type="button" onClick={reset}><RefreshCw />重置</button>
                <button type="button" className="danger" onClick={clear}><Trash2 />清空</button>
              </>
            )}
            {showSolveTools && (
              <>
                <button type="button" onClick={() => setMethodOpen(true)}><Sparkles />求解</button>
                <button type="button" onClick={reset}><RefreshCw />重置状态</button>
              </>
            )}
          </div>
        </div>
      )}
      <MethodSelect open={methodOpen} onClose={() => setMethodOpen(false)} onPick={runSolve} />
      <ScannerPanel open={scanOpen} onClose={() => setScanOpen(false)} onConfirm={applyScan} />
      <Modal title="求解失败" open={!!errorText} onClose={() => setErrorText("")}>
        <p className="error-text">{errorText}</p>
        <div className="modal-actions">
          <button className="primary" onClick={() => setErrorText("")}>确定</button>
        </div>
      </Modal>
    </SceneShell>
  );
}

function Player({ ctx: externalCtx, embedded = false }: { ctx?: AppContext; embedded?: boolean } = {}) {
  const localCtx = useAppContext();
  const ctx = externalCtx || localCtx;
  const [scene, setScene] = useState("");
  const [action, setAction] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      const raw = new URLSearchParams(location.search).get("data") || "";
      const data = JSON.parse(atob(raw));
      if (data.order) ctx.world.order = data.order;
      if (data.drama) {
        setScene(data.drama.scene || "");
        setAction(data.drama.action || "");
        const stickers = data.drama.stickers as StickerMap | undefined;
        if (stickers) {
          for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
            const list = stickers[FACE[face]];
            if (list) for (const sticker in list) ctx.world.cube.stick(Number(sticker), face, list[sticker]);
          }
        }
      }
    } catch (e) {
      console.log(e);
    }
  }, [ctx.world]);
  return (
    <SceneShell ctx={ctx} mode="player" viewportHeight={100} lockOrder embedded={embedded}>
      <div className="score-pill clickable" onClick={() => setOpen(true)}><Code2 />脚本</div>
      <div className="bottom-panel"><Playbar ctx={ctx} scene={scene} action={action} /></div>
      <Modal title="播放脚本" open={open} onClose={() => setOpen(false)}>
        <label>场景<textarea readOnly value={scene} /></label>
        <label>动作<textarea readOnly value={action} /></label>
      </Modal>
    </SceneShell>
  );
}

function Algs({
  ctx: externalCtx,
  embedded = false,
  ready = true,
}: {
  ctx?: AppContext;
  embedded?: boolean;
  ready?: boolean;
} = {}) {
  const localCtx = useAppContext();
  const ctx = externalCtx || localCtx;
  const data = useMemo(() => algsJson as { name: string; strip: { [face: string]: number[] | undefined }; items: { name: string; origin: string; exp?: string; order?: number; scramble?: boolean }[] }[], []);
  const [group, setGroup] = useState(0);
  const [index, setIndex] = useState(0);
  const [action, setAction] = useState("");
  const current = data[group].items[index];
  useEffect(() => {
    if (!ready) return;
    const order = current.order || 3;
    if (ctx.world.order !== order) ctx.world.order = order;
    ctx.world.cube.strip(data[group].strip);
    setAction(current.exp || current.origin);
    ctx.world.dirty = true;
  }, [ctx.world, current, data, group, ready]);
  return (
    <SceneShell ctx={ctx} mode="guide" viewportHeight={158} lockOrder embedded={embedded}>
      <aside className="legend-panel alg-side-panel">
        <header>
          <strong>
            <BookOpen />
            公式库
          </strong>
        </header>
        <p className="legend-hint">当前：{current.name} — 点击条目切换公式，下方可播放与编辑。</p>
        <div className="alg-layout alg-side-layout">
          <div className="settings-tabs compact alg-side-tabs">
            {data.map((item, i) => (
              <button key={item.name} className={group === i ? "selected" : ""} onClick={() => { setGroup(i); setIndex(0); }}>
                {item.name}
              </button>
            ))}
          </div>
          <div className="alg-grid alg-side-grid">
            {data[group].items.map((item, i) => (
              <button key={item.name} className={index === i ? "selected" : ""} onClick={() => setIndex(i)}>
                <strong>{item.name}</strong>
                <span>{(item.exp || item.origin).slice(0, 70)}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
      <div className="bottom-panel medium">
        <div className="script-row">
          <input value={action} onChange={(e) => setAction(e.target.value)} />
          <IconButton title="恢复默认" disabled={action === current.origin} onClick={() => setAction(current.origin)}><RotateCcw /></IconButton>
        </div>
        <Playbar ctx={ctx} scene={`x2${current.scramble ? "" : "^"}`} action={action} />
      </div>
    </SceneShell>
  );
}

function Director({ ctx: externalCtx, embedded = false }: { ctx?: AppContext; embedded?: boolean } = {}) {
  const localCtx = useAppContext();
  const ctx = externalCtx || localCtx;
  const playbar = useRef<PlaybarHandle>(null);
  const [scene, setScene] = useState("x2^");
  const [action, setAction] = useState("RUR'U'~");
  const [script, setScript] = useState(false);
  const [output, setOutput] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [recording, setRecording] = useState(false);
  const [pixel, setPixel] = useState(512);
  const [filmt, setFilmt] = useState<"gif" | "pngs">("gif");
  const [delay, setDelay] = useState(2);
  const filmer = useMemo(
    () => configureRenderer(new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })),
    []
  );
  const gif = useMemo(() => new GIF(COLORS), []);
  const zip = useMemo(() => new ZIP(), []);
  const pixels = useRef<Uint8Array>(new Uint8Array(0));
  const snap = () => {
    const width = ctx.world.width;
    const height = ctx.world.height;
    ctx.world.width = pixel;
    ctx.world.height = pixel;
    ctx.world.resize();
    filmer.setSize(pixel, pixel, true);
    filmer.setClearColor(0xffffff, 0);
    filmer.clear();
    filmer.render(ctx.world.scene, ctx.world.camera);
    ctx.world.width = width;
    ctx.world.height = height;
    ctx.world.resize();
    Util.DOWNLOAD("cuber", "png", filmer.domElement.toDataURL("image/png"));
  };
  const finish = () => {
    setRecording(false);
    if (filmt === "gif") {
      gif.finish();
      const blob = new Blob([gif.out.getData() as BlobPart], { type: "image/gif" });
      Util.DOWNLOAD("cuber", "gif", URL.createObjectURL(blob));
    } else {
      zip.finish();
      const blob = new Blob([zip.out.getData() as BlobPart], { type: "application/zip" });
      Util.DOWNLOAD("cuber", "zip", URL.createObjectURL(blob));
    }
  };
  useAnimation(() => {
    if (!recording) return;
    const width = ctx.world.width;
    const height = ctx.world.height;
    ctx.world.width = pixel;
    ctx.world.height = pixel;
    ctx.world.resize();
    filmer.clear();
    filmer.render(ctx.world.scene, ctx.world.camera);
    if (filmt === "gif") {
      const gl = filmer.getContext();
      gl.readPixels(0, 0, pixel, pixel, gl.RGBA, gl.UNSIGNED_BYTE, pixels.current);
      gif.add(pixels.current);
    } else {
      const raw = atob(filmer.domElement.toDataURL("image/png").split(";base64,")[1]);
      const data = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
      zip.add(`cuber${zip.num}.png`, data);
    }
    ctx.world.width = width;
    ctx.world.height = height;
    ctx.world.resize();
    if (playbar.current && !playbar.current.playing) finish();
  });
  const film = () => {
    if (recording) {
      finish();
      return;
    }
    filmer.setPixelRatio(1);
    filmer.setSize(pixel, pixel, true);
    if (filmt === "gif") {
      pixels.current = new Uint8Array(pixel * pixel * 4);
      gif.start(pixel, pixel, delay);
      filmer.setClearColor(0xffffff, 1);
    } else {
      zip.init();
      filmer.setClearColor(0xffffff, 0);
    }
    playbar.current?.init();
    playbar.current?.toggle();
    setRecording(true);
  };
  const share = () => {
    const data = btoa(JSON.stringify({ order: ctx.world.order, drama: { scene, action } }));
    const url = `${location.origin}${location.pathname}?mode=player&data=${data}`;
    setShareLink(url);
    setShareOpen(true);
    navigator.clipboard?.writeText(url).catch(() => undefined);
  };
  return (
    <SceneShell ctx={ctx} mode="settings" viewportHeight={204} embedded={embedded}>
      <div className="bottom-panel tall">
        <div className="toolbar primary-toolbar">
          <IconButton title="输出设置" disabled={recording} onClick={() => setOutput(true)}><Settings /></IconButton>
          <IconButton title="截图" disabled={recording} onClick={snap}><Camera /></IconButton>
          <IconButton title={recording ? "停止录制" : "导出动画"} onClick={film}>{recording ? <Pause /> : <Clapperboard />}</IconButton>
          <IconButton title="分享" disabled={recording} onClick={share}><Share2 /></IconButton>
          <IconButton title="脚本" disabled={recording} onClick={() => setScript(true)}><Clipboard /></IconButton>
        </div>
        <div className="script-row"><input value={action} onChange={(e) => setAction(e.target.value)} /><IconButton title="展开" onClick={() => setAction(new TwistNode(action.startsWith("SSE:") ? Util.SSE2SIGN(ctx.world.order, action.replace("SSE:", "")) : action).parse().map((item) => item.value).join(" "))}><FastForward /></IconButton></div>
        <Playbar ref={playbar} ctx={ctx} scene={scene} action={action.startsWith("SSE:") ? Util.SSE2SIGN(ctx.world.order, action.replace("SSE:", "")) : action} disabled={recording} />
      </div>
      <Modal title="脚本编辑" open={script} onClose={() => setScript(false)}>
        <label>场景<textarea value={scene} onChange={(e) => setScene(e.target.value)} /></label>
        <label>动作<textarea value={action} onChange={(e) => setAction(e.target.value)} /></label>
      </Modal>
      <Modal title="分享链接" open={shareOpen} onClose={() => setShareOpen(false)}>
        <textarea readOnly value={shareLink} />
        <div className="modal-actions">
          <button onClick={() => navigator.clipboard?.writeText(shareLink)}>复制</button>
          <button onClick={() => window.open(shareLink)}>打开</button>
        </div>
      </Modal>
      <Modal title="输出设置" open={output} onClose={() => setOutput(false)}>
        <div className="option-group">
          <strong>画布尺寸</strong>
          <div className="button-grid">{[128, 256, 512, 1024, 2048].map((item) => <button key={item} className={pixel === item ? "selected" : ""} onClick={() => setPixel(item)}>{item}px</button>)}</div>
        </div>
        <div className="option-group">
          <strong>导出格式</strong>
          <div className="button-grid">{(["gif", "pngs"] as const).map((item) => <button key={item} className={filmt === item ? "selected" : ""} onClick={() => setFilmt(item)}>{item === "gif" ? "GIF 动画" : "PNG 序列"}</button>)}</div>
        </div>
        <div className="option-group">
          <strong>GIF 帧延迟</strong>
          <div className="button-grid">{[2, 3, 4, 5, 6, 10].map((item) => <button key={item} className={delay === item ? "selected" : ""} onClick={() => setDelay(item)}>{item} cs</button>)}</div>
        </div>
      </Modal>
    </SceneShell>
  );
}

function HelpContent({ compact = false }: { compact?: boolean }) {
  const quickStarts = [
    ["AI 智能伴学", "右侧「魔方助手」接入 MCP 协议，随时点击「新手教学」、「CFOP速拧」或「下一步怎么做」，获取结构化动作与语音指导。"],
    ["练习与计时", "3D 拟真舞台自由转动，支持鼠标拖拽旋转。点击左下角时钟可清零重置，打乱转动第 1 步自动起步计时。"],
    ["录入与求解", "在求解模式中填涂真实魔方贴纸颜色，后端求解引擎秒级计算还原路径，并可点击播放条跟随 3D 动画复盘。"],
    ["公式与动画", "在公式模式中按分类学习 F2L/OLL/PLL；在动画模式中编辑动作脚本，一键导出 GIF 动图或 PNG 序列。"],
  ];
  const modes = [
    ["练习", "3D 拟真舞台与计时复盘", "自由操作魔方、毫秒级计时、打乱还原、历史记录及 AI 实时伴学。"],
    ["求解", "实体魔方颜色录入与求解", "录入真实魔方 54 格颜色，由 MCP 求解引擎秒级计算还原步骤并生成分步动画。"],
    ["公式", "全套 CFOP 标准公式库", "涵盖 F2L、OLL、PLL 经典公式，支持逐步拆解播放与自定义编辑验证。"],
    ["动画", "魔方动作脚本与动画制作", "支持自定义场景与动作脚本编写，可导出高清 PNG 序列或 GIF 教学动图。"],
    ["播放", "复原路径推演播放器", "跟随 3D 动画与语音解法，按阶段和步骤逐格观察魔方旋转变化。"],
  ];
  return (
    <section className={compact ? "help compact-help" : "help-page"}>
      <h1>CubeTutor 使用帮助</h1>
      <p className="help-lead">
        CubeTutor 是一个基于 <strong>MCP（Model Context Protocol）协议</strong> 与 3D 拟真舞台的智能魔方教学与求解系统。系统深度融合了 Emotion Ball 灵动 AI 伴学导师、多算法核心求解引擎（新手层先法 / CFOP 进阶速拧 / Kociemba 最优解）、3D 动画推演与语音教学。
      </p>

      <h2>快速开始</h2>
      <div className="help-grid">
        {quickStarts.map(([title, text]) => (
          <article key={title} className="help-card">
            <strong>{title}</strong>
            <p>{text}</p>
          </article>
        ))}
      </div>

      <h2>模式怎么选</h2>
      <div className="help-mode-list">
        {modes.map(([name, title, text]) => (
          <article key={name} className="help-mode-item">
            <b>{name}</b>
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </article>
        ))}
      </div>

      <h2>AI 智能助手与求解体系</h2>
      <ul>
        <li><strong>新手层先法（LBL · 7 阶段）</strong>：专为初学者打造，按“底十字 ➔ 底角块 ➔ 中层棱 ➔ 顶十字 ➔ 顶角向 ➔ 顶角位 ➔ 顶棱位”分步推进，易学易懂。</li>
        <li><strong>CFOP 进阶速拧（4 阶段）</strong>：竞技速拧主流方案，按“Cross 底十字 ➔ F2L 前两层 ➔ OLL 顶面朝向 ➔ PLL 顶层置换”快速还原。</li>
        <li><strong>Kociemba 最优解</strong>：采用两阶段数学算法，20 步以内极速计算理论最优还原路径。</li>
        <li><strong>大模型 API 配置</strong>：点击右侧面板顶部「⚙️ 设置」可配置 DeepSeek、通义千问、OpenRouter、OpenAI 等大模型服务，获得更具深度的答疑。</li>
      </ul>

      <h2>3D 舞台与基础操作</h2>
      <ul>
        <li>在魔方贴纸上拖动可以转动对应层，在空白区域拖动可以旋转整体 3D 视角。</li>
        <li>鼠标滚轮可缩放视图；控制台的“镜头”页可以精确调整缩放、透视、水平角和俯仰角。</li>
        <li>练习模式底部工具栏包含计时重置、随机打乱、上一步、下一步和分享功能。</li>
        <li>点击左下角 <code>⏱️ 00:00.0/0</code> 计时卡片可一键重置当前用时与步数。</li>
        <li>随机打乱会立刻生成新打乱，无需弹窗确认。</li>
      </ul>

      <h2>求解与录入模式</h2>
      <ul>
        <li>先在底部选择颜色，再点击魔方上的贴纸录入颜色。三阶魔方每种颜色应各出现 9 次。</li>
        <li>“重置”会恢复标准已还原状态；“清空”会移除所有贴纸颜色，适合重新录入。</li>
        <li>求解完成后可直接打开播放器逐步跟随 3D 动画与语音解法复盘。若校验未通过，系统会自动提示不合法的具体原因。</li>
      </ul>

      <h2>公式与动画制作</h2>
      <ul>
        <li>公式模式内置完整 F2L、OLL、PLL 公式库，支持按条目逐步拆解观察。</li>
        <li>动画模式支持自定义场景和动作脚本，可一键导出高清透明 PNG 序列或 GIF 动图。</li>
        <li>基础转动语法：<code>R U F D L B</code>；整体转动：<code>x y z</code>；宽层转动：<code>Rw Uw</code>；后缀 <code>'</code> 表示逆时针，数字表示旋转次数（如 <code>U2</code>）。</li>
      </ul>

      <h2>控制台与个性化</h2>
      <ul>
        <li>阶数支持 2 到 10 阶自由调节（求解模式锁定为 3 阶以匹配算法约束）。</li>
        <li>显示页支持厚贴纸、镜面、空心、箭头、光影和深色界面自由切换。</li>
        <li>配色页可自定义六面颜色及辅助高亮颜色，满足个性化视觉需求。</li>
      </ul>

      <h2>数据与分享</h2>
      <ul>
        <li>练习数据、偏好设置和配色保存在浏览器本地存储中，不需要账号。</li>
        <li>分享链接会把阶数、场景、动作和必要贴纸状态编码到 URL 中，接收者打开后可直接复盘。</li>
        <li>如果页面表现异常，可以先尝试控制台重置配置；需要彻底恢复时再选择清空全部本地数据。</li>
      </ul>
    </section>
  );
}

function HelpPage({ onHome }: { onHome?: () => void }) {
  return (
    <main className="document-shell">
      <button className="floating-menu" title="返回首页" onClick={() => (onHome ? onHome() : openMode("home"))}>
        <Home />
      </button>
      <HelpContent />
    </main>
  );
}

function invertTwistToken(token: string): string {
  const action = new TwistAction(token);
  if (action.times % 2 === 0) return action.value;
  return new TwistAction(action.sign, !action.reverse, action.times).value;
}

const CONTENT_SCENE_X = Math.PI / 6;
const CONTENT_SCENE_Y = -Math.PI / 4 + Math.PI / 16;

type PoseLerp = {
  start: number;
  duration: number;
  fromCubeX: number;
  fromCubeY: number;
  fromCubeZ: number;
  fromPosY: number;
  fromSceneX: number;
  fromSceneY: number;
};

function startPoseLerpToContent(ctx: AppContext, duration = 800): PoseLerp {
  return {
    start: performance.now(),
    duration,
    fromCubeX: ctx.world.cube.rotation.x,
    fromCubeY: ctx.world.cube.rotation.y,
    fromCubeZ: ctx.world.cube.rotation.z,
    fromPosY: ctx.world.cube.position.y,
    fromSceneX: ctx.world.scene.rotation.x,
    fromSceneY: ctx.world.scene.rotation.y,
  };
}

function tickPoseLerp(ctx: AppContext, lerp: PoseLerp): boolean {
  const t = Math.min(1, (performance.now() - lerp.start) / lerp.duration);
  const e = 1 - (1 - t) ** 3;
  ctx.world.cube.rotation.x = lerp.fromCubeX * (1 - e);
  ctx.world.cube.rotation.y = lerp.fromCubeY * (1 - e);
  ctx.world.cube.rotation.z = lerp.fromCubeZ * (1 - e);
  ctx.world.cube.position.y = lerp.fromPosY * (1 - e);
  ctx.world.scene.rotation.x = lerp.fromSceneX + (CONTENT_SCENE_X - lerp.fromSceneX) * e;
  ctx.world.scene.rotation.y = lerp.fromSceneY + (CONTENT_SCENE_Y - lerp.fromSceneY) * e;
  ctx.world.cube.updateMatrix();
  ctx.world.scene.updateMatrix();
  ctx.world.dirty = true;
  return t >= 1;
}

function snapContentPose(ctx: AppContext) {
  ctx.world.cube.rotation.set(0, 0, 0);
  ctx.world.cube.position.set(0, 0, 0);
  ctx.world.cube.updateMatrix();
  ctx.world.scene.rotation.x = CONTENT_SCENE_X;
  ctx.world.scene.rotation.y = CONTENT_SCENE_Y;
  ctx.world.scene.updateMatrix();
  ctx.world.dirty = true;
}

function restoreSolvedCube(ctx: AppContext, opts?: { keepPose?: boolean }) {
  ctx.world.order = 3;
  ctx.world.cube.twister.finish();
  ctx.world.cube.reset();
  ctx.world.cube.strip({});
  ctx.world.cube.history.clear();
  ctx.world.cube.history.init = "";
  if (!opts?.keepPose) {
    snapContentPose(ctx);
  } else {
    ctx.world.cube.position.y = 0;
    ctx.world.cube.updateMatrix();
    ctx.world.dirty = true;
  }
}

function LegendPanel({ ctx }: { ctx: AppContext }) {
  const [active, setActive] = useState<string | null>(null);
  const demoLock = useRef(false);
  const restoring = useRef(false);
  const restoreTimer = useRef<number | null>(null);
  const pendingInverse = useRef<string | null>(null);

  const clearRestoreTimer = () => {
    if (restoreTimer.current != null) {
      window.clearTimeout(restoreTimer.current);
      restoreTimer.current = null;
    }
  };

  const finishRestoreCycle = useCallback(() => {
    pendingInverse.current = null;
    ctx.world.cube.history.clear();
    setActive(null);
    demoLock.current = false;
    restoring.current = false;
  }, [ctx.world.cube.history]);

  const twistBackAnimated = useCallback(
    (token: string | null) => {
      restoring.current = true;
      if (token) {
        pendingInverse.current = invertTwistToken(token);
        ctx.world.cube.twister.twist(new TwistAction(pendingInverse.current), false, false);
        return;
      }
      const list = [...ctx.world.cube.history.list].reverse();
      if (list.length === 0) {
        finishRestoreCycle();
        return;
      }
      const queue = list.map((item) => new TwistAction(item.sign, !item.reverse, item.times));
      let i = 0;
      const step = () => {
        if (i >= queue.length) {
          ctx.world.callbacks = ctx.world.callbacks.filter((cb) => cb !== step);
          ctx.world.cube.history.clear();
          finishRestoreCycle();
          return;
        }
        const action = queue[i];
        const ok = ctx.world.cube.twister.twist(action, false, false);
        if (ok) i += 1;
      };
      ctx.world.callbacks.push(step);
      step();
    },
    [ctx, finishRestoreCycle]
  );

  const scheduleRestore = useCallback(
    (token: string | null, delay = 1000) => {
      clearRestoreTimer();
      restoreTimer.current = window.setTimeout(() => {
        restoreTimer.current = null;
        twistBackAnimated(token);
      }, delay);
    },
    [twistBackAnimated]
  );

  useEffect(() => {
    // 状态已由 App 在切页时重置，这里只挂交互回调，避免重复 reset 造成卡顿
    const onChanged = () => {
      if (restoring.current && pendingInverse.current) {
        pendingInverse.current = null;
        finishRestoreCycle();
        return;
      }
      if (demoLock.current || restoring.current) return;
      scheduleRestore(null, 1000);
    };
    ctx.world.callbacks.push(onChanged);
    return () => {
      clearRestoreTimer();
      ctx.world.callbacks = ctx.world.callbacks.filter((item) => item !== onChanged);
    };
  }, [ctx, finishRestoreCycle, scheduleRestore]);

  const demoMove = (token: string) => {
    clearRestoreTimer();
    demoLock.current = true;
    setActive(token);
    restoring.current = true;
    ctx.world.cube.twister.finish();
    ctx.world.cube.reset();
    ctx.world.cube.history.clear();
    restoring.current = false;
    pendingInverse.current = null;
    requestAnimationFrame(() => {
      ctx.world.cube.twister.twist(new TwistAction(token), false, false);
      scheduleRestore(token, 1000);
    });
  };

  const Token = ({ token }: { token: string }) => (
    <button type="button" className={`legend-token ${active === token ? "active" : ""}`} onClick={() => demoMove(token)} title={`演示 ${token}`}>
      {token}
    </button>
  );

  return (
    <aside className="legend-panel">
      <header>
        <strong>
          <Compass />
          操作图鉴
        </strong>
      </header>
      <p className="legend-hint">点击记号可演示对应转动；手动旋转后也会自动复原。</p>
      <div className="legend-body">
        <section>
          <h3>
            <Layers />
            单层旋转（大写）
          </h3>
          <p className="legend-hint">从该面外侧看，顺时针 90° 为基本方向；加 ' 表示反向，加 2 表示 180°。</p>
          <div className="legend-grid">
            {LEGEND_FACES.map(({ face, name }) => (
              <div className="legend-row" key={face}>
                <Token token={face} />
                <span className="legend-desc">
                  {name}顺时针 90°
                  <RotateCw className="legend-arrow" />
                </span>
              </div>
            ))}
            {LEGEND_FACES.map(({ face, name }) => (
              <div className="legend-row" key={`${face}'`}>
                <Token token={`${face}'`} />
                <span className="legend-desc">
                  {name}逆时针 90°
                  <RotateCcw className="legend-arrow" />
                </span>
              </div>
            ))}
            {LEGEND_FACES.map(({ face, name }) => (
              <div className="legend-row" key={`${face}2`}>
                <Token token={`${face}2`} />
                <span className="legend-desc">{name}转 180°</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>
            <Layers />
            双层旋转（小写）
          </h3>
          <p className="legend-hint">小写字母 = 该面 + 相邻中层（两层一起转），方向同大写。</p>
          <div className="legend-grid">
            {LEGEND_FACES.map(({ face, name }) => (
              <div className="legend-row" key={`w${face}`}>
                <Token token={face.toLowerCase()} />
                <span className="legend-desc">
                  {name}+中层顺时针 90°
                  <RotateCw className="legend-arrow" />
                </span>
              </div>
            ))}
            {LEGEND_FACES.map(({ face, name }) => (
              <div className="legend-row" key={`w${face}'`}>
                <Token token={`${face.toLowerCase()}'`} />
                <span className="legend-desc">
                  {name}+中层逆时针 90°
                  <RotateCcw className="legend-arrow" />
                </span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>
            <Compass />
            整体旋转
          </h3>
          <p className="legend-hint">绕整体坐标轴旋转整个魔方，不改变已涂抹颜色，仅改变观察方向。</p>
          <div className="legend-grid">
            {(
              [
                ["x", "整体绕 R 方向旋转 90°"],
                ["x'", "整体绕 R 方向反向 90°"],
                ["y", "整体绕 U 方向旋转 90°"],
                ["y'", "整体绕 U 方向反向 90°"],
                ["z", "整体绕 F 方向旋转 90°"],
                ["z'", "整体绕 F 方向反向 90°"],
              ] as const
            ).map(([token, desc]) => (
              <div className="legend-row" key={token}>
                <Token token={token} />
                <span className="legend-desc">{desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}

function App() {
  const [route, setRoute] = useState<AppRoute>(() => readRoute());
  const [teachHasResult, setTeachHasResult] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(420);
  const ctx = useAppContext();
  const viewport = useRef<ViewportHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { width, height } = useWindowSize();
  const isHome = route.mode === "home";
  const isDocument = route.mode === "help";
  const isGuideSide = route.mode === "guide";
  const panelHeight = panelHeightFor(route, { teachHasResult });

  const navigate = useCallback<NavigateFn>((partial) => {
    setRoute((prev) => {
      const next: AppRoute = { ...prev, ...partial, mode: partial.mode || prev.mode };
      const url = routeToUrl(next);
      if (`${location.pathname}${location.search}` !== url) {
        history.pushState(next, "", url);
      }
      return next;
    });
    setMobileOpen(false);
  }, []);

  navigateRef = navigate;

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    ctx.preferance.refresh();
    ctx.palette.refresh();
  }, [ctx]);

  // 落地页 ↔ 内容页：位移中插值朝向；结束后再处理涂黑/贴纸
  const scopeKey =
    route.mode === "teach"
      ? "teach"
      : route.mode === "guide"
        ? `guide:${route.guideTab}`
        : route.mode === "settings"
          ? `settings:${route.settingsTab}`
          : route.mode;
  const prevScopeRef = useRef<string | null>(null);
  const stageMovingRef = useRef(false);
  const poseLerpRef = useRef<PoseLerp | null>(null);
  const pendingScopeRef = useRef<{ prev: string | null; key: string; mode: AppMode } | null>(null);
  const [cubeSettled, setCubeSettled] = useState(() => route.mode !== "home");

  const applyScopeReset = useCallback(
    (prev: string | null, key: string, mode: AppMode) => {
      if (mode === "player") return;
      snapContentPose(ctx);
      // 教学台 / 计时训练 / 设置：进入时统一硬重置，避免其它模块污染
      if (mode === "teach" || mode === "train" || mode === "settings") {
        if (mode === "teach") ctx.world.order = 3;
        ctx.world.controller.lock = false;
        ctx.world.controller.disable = false;
        ctx.world.controller.taps = [];
        ctx.world.cube.twister.finish();
        ctx.world.cube.reset();
        ctx.world.cube.strip({});
        ctx.world.cube.history.clear();
        ctx.world.cube.history.init = "";
        ctx.world.cube.position.set(0, 0, 0);
        ctx.world.cube.rotation.set(0, 0, 0);
        ctx.world.cube.updateMatrix();
        if (mode === "teach") {
          // 进入教学台统一回到已复原状态，不恢复上次贴纸
          localStorage.removeItem("helper-stickers");
          const next: StickerMap = {};
          for (const face of [FACE.L, FACE.R, FACE.D, FACE.U, FACE.B, FACE.F]) {
            const key = FACE[face];
            const group = ctx.world.cube.table.face(key);
            next[key] = {};
            for (const index of group.indices) next[key]![index] = key;
          }
          localStorage.setItem("helper-stickers", JSON.stringify(next));
        }
        ctx.world.dirty = true;
        void prev;
        void key;
        return;
      }
      // 其它内容页统一先清成完整色块；公式页再由 Algs(ready) 涂黑
      restoreSolvedCube(ctx, { keepPose: true });
      snapContentPose(ctx);
      void prev;
      void key;
    },
    [ctx]
  );

  const syncStageSize = useCallback(() => {
    const el = stageRef.current;
    if (!el || stageMovingRef.current) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 1 && h > 1) viewport.current?.resize(w, h);
  }, []);

  useLayoutEffect(() => {
    if (isDocument) return;
    if (prevScopeRef.current === scopeKey) return;
    const prev = prevScopeRef.current;
    prevScopeRef.current = scopeKey;
    if (prev === null) {
      if (route.mode !== "home" && route.mode !== "player") {
        applyScopeReset(prev, scopeKey, route.mode);
        setCubeSettled(true);
      }
      return;
    }
    const involvesHome = prev === "home" || scopeKey === "home";
    if (involvesHome) {
      stageMovingRef.current = true;
      setCubeSettled(false);
      pendingScopeRef.current = { prev, key: scopeKey, mode: route.mode };
      if (prev === "home") {
        poseLerpRef.current = startPoseLerpToContent(ctx, 800);
      } else {
        // 回首页：立刻清涂黑并保持朝向；过渡中不 idle，结束不再 snap
        poseLerpRef.current = null;
        restoreSolvedCube(ctx, { keepPose: true });
      }
      return;
    }
    applyScopeReset(prev, scopeKey, route.mode);
    setCubeSettled(true);
  }, [applyScopeReset, ctx, isDocument, route.mode, scopeKey]);

  useEffect(() => {
    if (isDocument) return;
    const el = stageRef.current;
    if (!el) return;

    const finishMove = () => {
      if (!stageMovingRef.current && !pendingScopeRef.current) return;
      stageMovingRef.current = false;
      const pending = pendingScopeRef.current;
      pendingScopeRef.current = null;
      poseLerpRef.current = null;
      if (pending && pending.key !== "home") {
        snapContentPose(ctx);
        applyScopeReset(pending.prev, pending.key, pending.mode);
      }
      // 回首页：朝向与色块已在过渡开始时处理好，这里只收尾
      syncStageSize();
      setCubeSettled(true);
    };

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== el) return;
      if (!["left", "top", "width", "height", "transform"].includes(e.propertyName)) return;
      finishMove();
    };

    let raf = 0;
    const onResize = () => {
      if (stageMovingRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => syncStageSize());
    };

    syncStageSize();
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    el.addEventListener("transitionend", onTransitionEnd);
    const fallback = window.setTimeout(finishMove, 950);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
      ro.disconnect();
      el.removeEventListener("transitionend", onTransitionEnd);
    };
  }, [applyScopeReset, ctx, height, isDocument, isGuideSide, isHome, panelHeight, route.mode, scopeKey, syncStageSize, width]);

  useEffect(() => {
    if (isHome) {
      setChatOpen(false);
      setChatWidth(420);
    }
  }, [isHome]);

  const [heroMounted, setHeroMounted] = useState(isHome);
  const [heroVisible, setHeroVisible] = useState(isHome);
  const [contentReady, setContentReady] = useState(!isHome);
  useEffect(() => {
    if (isHome) {
      setHeroMounted(true);
      setContentReady(false);
      const id = requestAnimationFrame(() => setHeroVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setHeroVisible(false);
    setContentReady(false);
    const showContent = window.setTimeout(() => setContentReady(true), 200);
    const unmountHero = window.setTimeout(() => setHeroMounted(false), 650);
    return () => {
      window.clearTimeout(showContent);
      window.clearTimeout(unmountHero);
    };
  }, [isHome]);

  // 落地页：不规则随机拧面 idle
  useEffect(() => {
    if (!isHome || !heroVisible) return;
    const faces = ["U", "D", "R", "L", "F", "B"];
    const suffixes = ["", "'", "2"];
    let lastFace = "";
    let cancelled = false;
    let timer = 0;
    // 保持可交互：不禁用 controller；仅在空闲时自动拧面
    ctx.world.controller.disable = false;
    ctx.world.controller.lock = false;

    const schedule = () => {
      const delay = 700 + Math.random() * 1400;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (
          !stageMovingRef.current &&
          !ctx.world.controller.dragging &&
          !ctx.world.controller.rotating &&
          ctx.world.cube.twister.length === 0 &&
          tweener.length === 0
        ) {
          let face = faces[Math.floor(Math.random() * faces.length)];
          if (face === lastFace) {
            face = faces[(faces.indexOf(face) + 1 + Math.floor(Math.random() * 5)) % faces.length];
          }
          lastFace = face;
          const suf = suffixes[Math.floor(Math.random() * suffixes.length)];
          ctx.world.cube.twister.push(face + suf);
        }
        schedule();
      }, delay);
    };
    schedule();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      ctx.world.cube.twister.finish();
    };
  }, [isHome, heroVisible, ctx]);

  useAnimation(() => {
    if (isDocument) return;
    if (poseLerpRef.current) {
      const done = tickPoseLerp(ctx, poseLerpRef.current);
      if (done) poseLerpRef.current = null;
    } else if (isHome && heroVisible && !stageMovingRef.current && ctx.world.order < 10) {
      const twisting = ctx.world.cube.twister.length > 0 || tweener.length > 0;
      const tick = Math.sin((Date.now() / 2800) * Math.PI);
      ctx.world.cube.rotation.y += twisting ? 0.0015 : 0.003;
      if (!twisting) {
        ctx.world.cube.position.y = (tick * Cubelet.SIZE) / 72;
      }
      ctx.world.cube.dirty = true;
      ctx.world.cube.updateMatrix();
    } else if (!isHome && !stageMovingRef.current) {
      const scene = ctx.world.scene;
      if (Math.abs(scene.rotation.x - CONTENT_SCENE_X) > 1e-4 || Math.abs(scene.rotation.y - CONTENT_SCENE_Y) > 1e-4) {
        snapContentPose(ctx);
      }
    }
    viewport.current?.draw();
  });

  if (isDocument) {
    return <HelpPage onHome={() => navigate({ mode: "home" })} />;
  }

  return (
    <div
      className={`cuber-root ${isHome ? "layout-home" : "layout-app"}${isGuideSide ? " guide-atlas" : ""}${chatOpen ? " chat-open" : ""}`}
      style={{ ["--chat-w" as string]: `${chatWidth}px` } as React.CSSProperties}
    >
      <AppTopNav
        route={route}
        variant={isHome ? "home" : "app"}
        onHome={() => navigate({ mode: "home" })}
        onNavigate={(mode) => {
          if (mode === "guide") navigate({ mode, guideTab: "legend" });
          else if (mode === "settings") navigate({ mode, settingsTab: "appear" });
          else if (mode === "teach") navigate({ mode, teachTab: "input" });
          else navigate({ mode });
        }}
        onOpenMenu={() => setMobileOpen(true)}
      />

      {mobileOpen && (
        <div className="cuber-mobile-menu">
          <BrandLogo onClick={() => navigate({ mode: "home" })} />
          <button type="button" className="cuber-mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭">
            <X />
          </button>
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.mode}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.mode === "guide") navigate({ mode: "guide", guideTab: "legend" });
                    else if (item.mode === "settings") navigate({ mode: "settings", settingsTab: "appear" });
                    else if (item.mode === "teach") navigate({ mode: "teach", teachTab: "input" });
                    else navigate({ mode: item.mode });
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="hero-cta mobile-cta"
            onClick={() => navigate({ mode: "teach", teachTab: "input" })}
          >
            Start Solving
            <ArrowUpRight size={22} />
          </button>
        </div>
      )}

      <div ref={stageRef} className={`viewport-stage ${isHome ? "stage-left" : "stage-center"}`}>
        <Viewport ref={viewport} ctx={ctx} />
      </div>

      {heroMounted && (
        <div className={`hero-layer ${heroVisible ? "is-visible" : "is-exit"}`}>
          <HeroChrome
            onNavigate={(mode) => {
              if (mode === "guide") navigate({ mode, guideTab: "legend" });
              else if (mode === "settings") navigate({ mode, settingsTab: "appear" });
              else if (mode === "teach") navigate({ mode, teachTab: "input" });
              else navigate({ mode });
            }}
            onStart={() => navigate({ mode: "teach", teachTab: "input" })}
          />
        </div>
      )}

      {!isHome && (
        <div className={`app-mode-layer ${contentReady ? "is-ready" : ""}`}>
          {route.mode === "guide" && (
            <>
              <SubTabBar
                tabs={GUIDE_TABS}
                value={route.guideTab}
                alignTo="guide"
                layoutKey={`${chatOpen}-${chatWidth}`}
                onChange={(guideTab) => navigate({ mode: "guide", guideTab })}
              />
              {route.guideTab === "algs" ? <Algs ctx={ctx} embedded ready={cubeSettled} /> : <LegendPanel ctx={ctx} />}
            </>
          )}
          {route.mode === "teach" && (
            <>
              <SubTabBar
                tabs={TEACH_TABS}
                value={route.teachTab}
                alignTo="teach"
                layoutKey={`${chatOpen}-${chatWidth}`}
                onChange={(teachTab) => navigate({ mode: "teach", teachTab })}
              />
              <Helper ctx={ctx} embedded tab={route.teachTab} onResultChange={setTeachHasResult} />
            </>
          )}
          {route.mode === "train" && <Playground ctx={ctx} embedded />}
          {route.mode === "settings" && (
            <>
              <SettingsPanel
                ctx={ctx}
                mode="settings"
                variant="inline"
                hideModeNav
                activeTab={route.settingsTab}
                onTabChange={(settingsTab) => navigate({ mode: "settings", settingsTab })}
                lockOrder={false}
              />
              {route.settingsTab === "director" && <Director ctx={ctx} embedded />}
            </>
          )}
          {route.mode === "player" && <Player ctx={ctx} embedded />}
        </div>
      )}

      {isHome ? (
        <HomeAgentPeek />
      ) : (
        <ChatPanel
          open={chatOpen}
          onToggle={setChatOpen}
          onWidthChange={setChatWidth}
          getCubeState={() => ctx.world.cube.serialize()}
          isSolved={ctx.world.cube.complete}
        />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
