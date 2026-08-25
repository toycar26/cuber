import { TouchAction } from "../../cuber/controller";

export default class Toucher {
  init(dom: HTMLElement, callback: (action: TouchAction) => void): void {
    this.dom = dom;
    this.callback = callback;
    document.addEventListener("touchstart", this.touch);
    document.addEventListener("touchmove", this.touch);
    document.addEventListener("touchend", this.touch);
    document.addEventListener("touchcancel", this.touch);
    document.addEventListener("mousedown", this.mouse);
    document.addEventListener("mousemove", this.mouse);
    document.addEventListener("mouseup", this.mouse);
  }
  dom: HTMLElement;
  callback: (action: TouchAction) => void;
  target: EventTarget | null;
  last: Touch | null;

  /** 将视口坐标换算为相对 canvas、并缩放到逻辑尺寸（与 world.width/height 一致） */
  private localPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.dom.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    // canvas 缓冲区尺寸；controller 使用的是 resize 写入的逻辑宽高，优先用 client 尺寸比例映射
    const logicW = this.dom.clientWidth || cssW;
    const logicH = this.dom.clientHeight || cssH;
    return {
      x: ((clientX - rect.left) / cssW) * logicW,
      y: ((clientY - rect.top) / cssH) * logicH,
    };
  }

  mouse = (event: MouseEvent): boolean => {
    if (event.type === "mousedown") {
      this.target = event.target;
    }
    if (this.target !== this.dom) {
      return true;
    }
    this.dom.tabIndex = 1;
    this.dom.focus();
    const { x, y } = this.localPoint(event.clientX, event.clientY);
    const action = new TouchAction(event.type, x, y);
    this.callback(action);
    event.returnValue = false;
    if (event.type === "mouseup") {
      this.target = null;
    }
    return false;
  };

  touch = (event: TouchEvent): boolean => {
    const first = event.changedTouches[0];
    if (event.type === "touchstart") {
      this.target = event.target;
      if (this.last) {
        const p = this.localPoint(this.last.clientX, this.last.clientY);
        const action = new TouchAction("touchend", p.x, p.y);
        this.callback(action);
      }
      this.last = first;
    }
    if (this.target !== this.dom || this.last?.identifier != first.identifier) {
      return false;
    }
    this.dom.tabIndex = 1;
    this.dom.focus();
    const { x, y } = this.localPoint(first.clientX, first.clientY);
    const action = new TouchAction(event.type, x, y);
    this.callback(action);
    event.preventDefault();
    if (event.type === "touchend" || event.type === "touchcancel") {
      this.target = null;
    }
    return true;
  };
}
