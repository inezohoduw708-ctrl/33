import { TURTLES, TURTLE_ORDER, fmt } from '../core/utils';
import type { TurtleId } from '../types';

const maskSvg = (css: string) => `
<svg viewBox="0 0 42 30" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="21" cy="15" rx="17" ry="12" fill="#5f9a34"/>
  <path d="M2 12h38v6H2z" fill="${css}"/>
  <ellipse cx="13" cy="15" rx="4.5" ry="3.4" fill="#fff"/>
  <ellipse cx="29" cy="15" rx="4.5" ry="3.4" fill="#fff"/>
  <circle cx="13.5" cy="15.4" r="1.9" fill="#101010"/>
  <circle cx="28.5" cy="15.4" r="1.9" fill="#101010"/>
</svg>`;

export class HUD {
  private bar: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private energyFill: HTMLElement;
  private energyHint: HTMLElement;
  private objKicker: HTMLElement;
  private objTitle: HTMLElement;
  private objFill: HTMLElement;
  private objSub: HTMLElement;
  private bossWrap: HTMLElement;
  private bossFill: HTMLElement;
  private bossPhase: HTMLElement;
  private pickupHint: HTMLElement;
  private cards = new Map<TurtleId, HTMLElement>();
  private lastScore = -1;
  private lastCombo = -1;

  constructor() {
    this.bar = document.getElementById('turtle-bar')!;
    this.scoreEl = document.getElementById('score')!;
    this.comboEl = document.getElementById('combo')!;
    this.energyFill = document.getElementById('energy-fill')!;
    this.energyHint = document.getElementById('energy-hint')!;
    this.objKicker = document.getElementById('obj-kicker')!;
    this.objTitle = document.getElementById('obj-title')!;
    this.objFill = document.getElementById('obj-fill')!;
    this.objSub = document.getElementById('obj-sub')!;
    this.bossWrap = document.getElementById('boss-wrap')!;
    this.bossFill = document.getElementById('boss-fill')!;
    this.bossPhase = document.getElementById('boss-phase')!;
    this.pickupHint = document.getElementById('pickup-hint')!;
    this.buildCards();
  }

  private buildCards() {
    this.bar.innerHTML = '';
    TURTLE_ORDER.forEach((id, i) => {
      const t = TURTLES[id];
      const el = document.createElement('div');
      el.className = 'tcard';
      el.style.setProperty('--accent', t.css);
      el.innerHTML = `
        <span class="num">${i + 1}</span>
        <div class="energy">СПЕЦ</div>
        <div class="mask">${maskSvg(t.css)}</div>
        <div class="tname">${t.short}</div>
        <div class="hpbar"><i></i></div>
      `;
      this.bar.appendChild(el);
      this.cards.set(id, el);
    });
  }

  show(v: boolean) {
    document.getElementById('hud')!.classList.toggle('hidden', !v);
  }

  setObjective(kicker: string, title: string, sub: string, progress: number) {
    this.objKicker.textContent = kicker;
    this.objTitle.textContent = title;
    this.objSub.textContent = sub;
    this.objFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  }

  setScore(score: number) {
    if (Math.round(score) === this.lastScore) return;
    this.lastScore = Math.round(score);
    this.scoreEl.textContent = fmt(this.lastScore);
  }

  setCombo(combo: number) {
    if (combo !== this.lastCombo) {
      this.lastCombo = combo;
      (this.comboEl.querySelector('span') as HTMLElement).textContent = String(combo);
      this.comboEl.classList.toggle('on', combo >= 2);
      if (combo >= 5) {
        const pop = document.getElementById('combo-pop')!;
        pop.textContent = `${combo} КОМБО`;
        pop.classList.remove('show');
        void pop.offsetWidth;
        pop.classList.add('show');
      }
    }
  }

  setEnergy(v: number, ready: boolean, label: string) {
    this.energyFill.style.width = `${Math.round(v)}%`;
    this.energyHint.textContent = ready ? `Спецприём: ${label}` : `Заряд спецприёма ${Math.round(v)}%`;
  }

  setTurtles(hp: number[], energy: number[], active: number) {
    TURTLE_ORDER.forEach((id, i) => {
      const card = this.cards.get(id)!;
      const def = TURTLES[id];
      card.classList.toggle('active', i === active);
      card.classList.toggle('dead', hp[i] <= 0);
      card.classList.toggle('spec-ready', energy[i] >= 100 && hp[i] > 0);
      const bar = card.querySelector('.hpbar i') as HTMLElement;
      bar.style.width = `${Math.max(0, (hp[i] / def.maxHp) * 100)}%`;
    });
  }

  setBoss(visible: boolean, hpFrac = 1, phase = 1) {
    this.bossWrap.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.bossFill.style.width = `${Math.max(0, hpFrac) * 100}%`;
    this.bossPhase.textContent = phase === 1 ? '— Остриё Клана' : phase === 2 ? '— Ярость Клана' : '— ПОСЛЕДНИЙ РУБЕЖ';
  }

  setPickupHint(text: string | null) {
    if (!text) {
      this.pickupHint.classList.add('hidden');
      return;
    }
    this.pickupHint.textContent = text;
    this.pickupHint.classList.remove('hidden');
  }

  toast(text: string, ms = 2200) {
    const el = document.getElementById('toast')!;
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.add('show');
    window.clearTimeout((this as any)._toastTimer);
    (this as any)._toastTimer = window.setTimeout(() => {
      el.classList.remove('show');
    }, ms);
  }
}
