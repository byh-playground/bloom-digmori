import { installShowcase } from 'https://cdn.jsdelivr.net/gh/byh-playground/bloom-gamekit@2c6de8e749d88d00fd8c9825170ec957bdd64d35/scenario.js';
const SHOWCASE = installShowcase({
    title:'디그모리',
    launcher:'#new-world',
    playSelector:'#resume',
    durationMs:27000,
    readyTimeoutMs:210000,
    ready:win=>{
      const app=win.Bloom?.app;
      if(!app?.started || !app?.sim)return false;
      // The disposable intro owns this world's first presentation, not the normal load curtain.
      const loading=win.document.getElementById('loading');
      if(loading)loading.hidden=true;
      return true;
    },
    timeline:[
  {
    "atMs": 0,
    "action": "chapter",
    "index": 0,
    "title": "절차적으로 생성되는 모험의 세계",
    "caption": "바이옴과 동굴이 이어지는 2.5D 샌드박스를 탐험합니다."
  },
  {
    "atMs": 1500,
    "action": "key",
    "code": "KeyW",
    "down": true
  },
  {
    "atMs": 5100,
    "action": "key",
    "code": "KeyW",
    "down": false
  },
  {
    "atMs": 8200,
    "action": "chapter",
    "index": 1,
    "title": "직접 채굴하고 재료를 모으기",
    "caption": "자원을 캐고 제작해 새로운 탐험을 준비합니다."
  },
  {
    "atMs": 8500,
    "action": "pointer",
    "selector": "#world",
    "phase": "pointerdown",
    "u": 0.53,
    "v": 0.51
  },
  {
    "atMs": 11200,
    "action": "pointer",
    "selector": "#world",
    "phase": "pointerup",
    "u": 0.53,
    "v": 0.51
  },
  {
    "atMs": 11800,
    "action": "key",
    "code": "KeyD",
    "down": true
  },
  {
    "atMs": 14800,
    "action": "key",
    "code": "KeyD",
    "down": false
  },
  {
    "atMs": 17500,
    "action": "chapter",
    "index": 2,
    "title": "지하와 유적, 동료가 있는 세계",
    "caption": "월드를 자유롭게 이동하고 오래 탐험할수록 선택지가 늘어납니다."
  },
  {
    "atMs": 17900,
    "action": "key",
    "code": "KeyW",
    "down": true
  },
  {
    "atMs": 19900,
    "action": "key",
    "code": "KeyW",
    "down": false
  },
  {
    "atMs": 20100,
    "action": "key",
    "code": "KeyA",
    "down": true
  },
  {
    "atMs": 22400,
    "action": "key",
    "code": "KeyA",
    "down": false
  },
  {
    "atMs": 23000,
    "action": "pointer",
    "selector": "#world",
    "phase": "pointerdown",
    "u": 0.55,
    "v": 0.54
  },
  {
    "atMs": 25100,
    "action": "pointer",
    "selector": "#world",
    "phase": "pointerup",
    "u": 0.55,
    "v": 0.54
  }
]
});

// Restore direct introduction links after the game's own menu router has booted.
if (window.__BLOOM_SHOWCASE_DEEPLINK && SHOWCASE) {
    window.addEventListener('load', () => SHOWCASE.open(), { once: true });
}
