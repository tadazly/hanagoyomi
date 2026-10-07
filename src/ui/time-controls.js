import { fmtTime, TIME_SPEEDS, zonedHours } from '../world/clock.js';
import { onLanguageChange, t } from '../i18n/index.js';

// 大面板与快捷面板共用这一份结构、事件绑定和数值格式。
const template = `
  <label class="ctl"><span data-i18n="time.local">Local time</span><output data-time-output="time"></output><input aria-label="Local time" data-i18n-aria-label="time.local" type="range" data-time-field="time" min="0" max="23.99" step="0.01"></label>
  <label class="ctl"><span data-i18n="time.speed">Time speed</span><output data-time-output="speed"></output><input aria-label="Time speed" data-i18n-aria-label="time.speed" type="range" data-time-field="speed" min="0" step="1"></label>
  <button class="btn primary" data-time-action="sync" type="button"><span data-icon="history"></span><span data-i18n="time.sync">Back to now</span></button>
  <div class="solar-row"><span><span data-icon="sunrise"></span><span data-time-sun="rise">Sunrise --</span></span><span><span data-icon="sunset"></span><span data-time-sun="set">Sunset --</span></span></div>
`;
const instances = [];
let actions = {}, snapshot, activeRange = null;

function paintRange(input, output, value, format) {
  const displayed = input === activeRange ? input.valueAsNumber : value;
  if (input !== activeRange) input.value = value;
  output.textContent = format(displayed);
  input.style.setProperty('--fill', `${(displayed - input.min) / (input.max - input.min) * 100}%`);
}

function render() {
  if (!snapshot) return;
  const { hours, speedIndex, loc, sun, phase } = snapshot;
  const speedLabel = index => index === 0 ? t('time.paused') : index === 1 ? t('time.realtime') : `${TIME_SPEEDS[index]}×`;
  const formatSun = ms => ms === null ? '--' : fmtTime(zonedHours(loc.tz, ms));
  const rise = sun.polar ? t(sun.polar === 'day' ? 'sun.polarDay' : 'sun.polarNight') : t('sun.rise', { time: formatSun(sun.rise) });
  const set = sun.polar ? t(`phase.${phase}`) : t('sun.set', { time: formatSun(sun.set) });
  for (const view of instances) {
    paintRange(view.time, view.timeOutput, hours, fmtTime);
    paintRange(view.speed, view.speedOutput, speedIndex, speedLabel);
    view.sunrise.textContent = rise;
    view.sunset.textContent = set;
  }
}

function mount(root, prefix) {
  root.innerHTML = template;
  const field = name => root.querySelector(`[data-time-field="${name}"]`);
  const output = name => root.querySelector(`[data-time-output="${name}"]`);
  const view = {
    time: field('time'), speed: field('speed'), timeOutput: output('time'), speedOutput: output('speed'),
    sunrise: root.querySelector('[data-time-sun="rise"]'), sunset: root.querySelector('[data-time-sun="set"]'),
  };
  for (const name of ['time', 'speed']) {
    const input = view[name];
    input.id = `${prefix}${name}`;
    output(name).setAttribute('for', input.id);
    input.addEventListener('pointerdown', () => { activeRange = input; });
    input.addEventListener('blur', () => { if (activeRange === input) { activeRange = null; render(); } });
    input.addEventListener('input', () => actions[name]?.(input.valueAsNumber));
  }
  view.speed.max = TIME_SPEEDS.length - 1;
  view.sunrise.id = `${prefix}sunriseText`;
  view.sunset.id = `${prefix}sunsetText`;
  const sync = root.querySelector('[data-time-action="sync"]');
  sync.id = `${prefix}syncNow`;
  sync.addEventListener('click', () => actions.sync?.());
  instances.push(view);
}

export function initTimeControls() {
  mount(document.getElementById('timeControls'), '');
  mount(document.getElementById('quickTimeControls'), 'quick-');
  const finishDrag = () => { activeRange = null; render(); };
  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', finishDrag);
  onLanguageChange(render);
}

export function bindTimeActions(callbacks) {
  actions = callbacks;
}

export function updateTimeControls(state) {
  snapshot = state;
  render();
}
