import Phaser from 'phaser';
import { App } from './app/App';
import { Sfx } from './audio/sfx';
import { VIEW_CONFIG } from './config/arena';
import { installDevHook } from './dev/devHook';
import { readDevOptions } from './dev/devOptions';
import { GameScene } from './render/GameScene';
import { loadSave, type StorageLike } from './storage/save';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import './style.css';

function getStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();
const { data: save, status } = loadSave(storage);
if (status === 'corrupt' || status === 'version') console.warn(`[save] 저장 데이터를 읽을 수 없어 기본값으로 시작합니다 (${status}).`);

const dev = readDevOptions(location.search, import.meta.env.DEV);
const app = new App({
  save,
  storage,
  dev,
  sfx: new Sfx(save.settings.volume),
  hud: new Hud(document.getElementById('hud')!),
  screens: new Screens(document.getElementById('overlay')!),
});

new Phaser.Game({
  type: Phaser.AUTO,
  pixelArt: true,
  parent: 'game-root',
  width: VIEW_CONFIG.width,
  height: VIEW_CONFIG.height,
  backgroundColor: '#0d0e16',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  audio: { noAudio: true },
  banner: false,
  scene: [new GameScene(app)],
});

if (dev.enabled) installDevHook(app);
