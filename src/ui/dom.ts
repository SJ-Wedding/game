/** 작은 DOM 도우미 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

/** 값이 바뀌었을 때만 DOM 에 쓰기 (매 프레임 호출해도 가볍게) */
export class Cached {
  private last = new Map<string, string>();
  text(node: HTMLElement, key: string, value: string): void {
    if (this.last.get(key) === value) return;
    this.last.set(key, value);
    node.textContent = value;
  }
  style(node: HTMLElement, key: string, prop: string, value: string): void {
    const k = `${key}:${prop}`;
    if (this.last.get(k) === value) return;
    this.last.set(k, value);
    node.style.setProperty(prop, value);
  }
  toggle(node: HTMLElement, key: string, cls: string, on: boolean): void {
    const k = `${key}:${cls}`;
    const v = on ? '1' : '0';
    if (this.last.get(k) === v) return;
    this.last.set(k, v);
    node.classList.toggle(cls, on);
  }
  reset(): void {
    this.last.clear();
  }
}

/** 한국어 조사 선택: josa('잿불 군주', '을/를') → '잿불 군주를' */
export function josa(word: string, pair: '을/를' | '이/가' | '은/는' | '과/와'): string {
  const code = word.charCodeAt(word.length - 1);
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  const [withFinal, without] = pair.split('/');
  return word + (hasFinal ? withFinal : without);
}
