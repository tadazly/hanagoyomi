import { frameLimitRange } from '../rendering/render-preferences.js';
import { onLanguageChange, t } from '../i18n/index.js';

export function bindRenderSettings({ settings, wallpaper, hostSettings, resize, document: doc = document }) {
  const scale = doc.getElementById('renderScale'), fps = doc.getElementById('fpsLimit');
  const scaleOutput = doc.querySelector('output[for="renderScale"]'), fpsOutput = doc.querySelector('output[for="fpsLimit"]');
  const note = doc.getElementById('fpsLimitNote');
  const showPerformance = doc.getElementById('showPerformance');
  const overlay = doc.getElementById('performanceOverlay');
  const logo = doc.querySelector('[data-ui-component="logo"]');
  function placePerformance(){
    overlay.hidden=!settings.showPerformance;
    if(overlay.hidden)return;
    overlay.style.top='';
    const base=overlay.getBoundingClientRect(),rect=logo.getBoundingClientRect();
    const visible=getComputedStyle(logo).visibility!=='hidden'&&getComputedStyle(logo).display!=='none';
    if(visible&&rect.right>base.left&&rect.left<base.right&&rect.bottom>base.top&&rect.top<base.bottom){
      overlay.style.top=`${Math.ceil(rect.bottom+12)}px`;
    }
  }
  showPerformance.addEventListener('change',()=>{
    settings.showPerformance=showPerformance.checked;placePerformance();
  });
  window.addEventListener('resize',placePerformance);
  doc.addEventListener('componentlayout',placePerformance);
  new ResizeObserver(placePerformance).observe(logo);
  new MutationObserver(placePerformance).observe(logo,{attributes:true,attributeFilter:['style','class','data-visible']});
  new MutationObserver(placePerformance).observe(doc.body,{attributes:true,attributeFilter:['data-immersive']});
  const paint = (input, output, value, label) => {
    input.value = value;
    output.textContent = label;
    input.setAttribute('aria-valuetext', label);
    input.style.setProperty('--fill', `${(input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
  };
  function refresh() {
    showPerformance.checked=settings.showPerformance;placePerformance();
    paint(scale, scaleOutput, settings.renderScale, `${Math.round(settings.renderScale * 100)}%`);
    const { min, max, ceiling } = frameLimitRange(wallpaper ? hostSettings.fps : undefined);
    fps.min = min; fps.max = max;
    const value = settings.fpsLimit === 0 ? max : Math.max(min, Math.min(ceiling, settings.fpsLimit));
    paint(fps, fpsOutput, value, settings.fpsLimit === 0 ? t('quality.fpsUnlimited') : `${value} FPS`);
    note.textContent = wallpaper && hostSettings.fps !== 0 ? t('quality.fpsHostLimit', { value: ceiling }) : t('quality.fpsLimitNote');
  }
  scale.addEventListener('input', () => {
    settings.renderScale = Math.round(scale.valueAsNumber * 20) / 20;
    refresh(); resize();
  });
  fps.addEventListener('input', () => {
    settings.fpsLimit = fps.valueAsNumber === Number(fps.max) ? 0 : Math.max(10, fps.valueAsNumber);
    refresh();
  });
  onLanguageChange(refresh);
  refresh();
  return { refresh, placePerformance };
}
